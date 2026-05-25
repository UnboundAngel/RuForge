import { useCallback, useEffect, useRef, useState } from 'react';
import DownloadOwlHero from './DownloadOwlHero';
import { Component as SilkBackground } from '../ui/silk-background-animation';
import {
  type ProgressSnapshot,
  fetchInstaller,
  runDemoDownload,
  saveBlob,
  formatBytes,
  formatSpeed,
  formatEta,
} from '../../lib/downloadProgress';
import { SITE } from '../../lib/site';

type VisualPhase = 'idle' | 'downloading' | 'flash' | 'done' | 'error';

const EMPTY_PROGRESS: ProgressSnapshot = {
  loaded: 0,
  total: null,
  speedBps: 0,
  etaSec: null,
  percent: 0,
};

const FLASH_MS = 4500;

/* ------------------------------------------------------------------ */
/*  Progress ring                                                     */
/* ------------------------------------------------------------------ */

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

function ProgressRing({
  pct,
  reducedMotion,
}: {
  pct: number;
  reducedMotion: boolean;
}) {
  const offset = RING_C * (1 - pct / 100);

  return (
    <div
      className="relative z-10 flex items-center justify-center"
      style={{ width: 120, height: 120 }}
    >
      <svg viewBox="0 0 100 100" width={120} height={120} aria-hidden>
        <circle
          cx={50} cy={50} r={RING_R}
          fill="none"
          stroke="rgb(237 215 156 / 0.08)"
          strokeWidth={4}
        />
        <circle
          cx={50} cy={50} r={RING_R}
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={offset}
          className="rf-dl-ring-active"
          style={{
            transition: reducedMotion
              ? 'none'
              : 'stroke-dashoffset 0.25s ease',
          }}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums text-rf-text pointer-events-none">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated checkmark (draws via stroke-dashoffset)                  */
/* ------------------------------------------------------------------ */

function AnimatedCheckmark() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setActive(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative z-10 flex items-center justify-center">
      <svg className="rf-dl-checkmark-svg" viewBox="0 0 52 52" aria-hidden>
        <circle
          className={`rf-dl-checkmark-ring${active ? ' rf-dl-checkmark-ring--fill' : ''}`}
          cx={26} cy={26} r={23}
          fill="none" strokeWidth={2.5}
        />
        <path
          className={`rf-dl-checkmark-path${active ? ' rf-dl-checkmark-path--draw' : ''}`}
          d="M15 27 l7 7 l15 -15"
          fill="none" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step icons                                                        */
/* ------------------------------------------------------------------ */

function StepIcon({ status }: { status: 'done' | 'current' | 'upcoming' }) {
  if (status === 'done') {
    return (
      <div className="rf-dl-step-icon rf-dl-step-icon--done">
        <svg viewBox="0 0 20 20" width={14} height={14} aria-hidden>
          <path
            d="M5 10.5 l3.5 3.5 l6.5 -7"
            fill="none" stroke="currentColor"
            strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (status === 'current') {
    return (
      <div className="rf-dl-step-icon rf-dl-step-icon--current">
        <svg viewBox="0 0 20 20" width={10} height={10} aria-hidden>
          <path d="M7 5 l7 5 l-7 5z" fill="currentColor" />
        </svg>
      </div>
    );
  }
  return <div className="rf-dl-step-icon rf-dl-step-icon--upcoming" />;
}

const STEPS = [
  { label: 'Download finished', badge: 'DONE', status: 'done' as const },
  { label: 'Run the installer', badge: 'NEXT', status: 'current' as const },
  { label: 'Launch RuForge', badge: '', status: 'upcoming' as const },
];

/* ------------------------------------------------------------------ */
/*  Main flow                                                         */
/* ------------------------------------------------------------------ */

export type DownloadOwlFlowProps = {
  version: string;
  fetchUrls: string[];
  directDownloadUrl: string;
  filename: string;
  autoStart?: boolean;
  troubleHref: string;
};

export default function DownloadOwlFlow({
  version,
  fetchUrls,
  directDownloadUrl,
  filename,
  autoStart = false,
  troubleHref,
}: DownloadOwlFlowProps) {
  const [visualPhase, setVisualPhase] = useState<VisualPhase>(
    autoStart ? 'downloading' : 'idle',
  );
  const [progress, setProgress] = useState<ProgressSnapshot>(EMPTY_PROGRESS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedBlob, setSavedBlob] = useState<Blob | null>(null);
  const [viaBrowser, setViaBrowser] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  const timersRef = useRef<number[]>([]);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const showFlash = useCallback(() => {
    clearTimers();
    if (pendingBlobRef.current) {
      saveBlob(pendingBlobRef.current, filename);
    }
    setVisualPhase('flash');
    timersRef.current.push(
      window.setTimeout(() => setVisualPhase('done'), FLASH_MS),
    );
  }, [clearTimers, filename]);

  const runDownload = useCallback(
    async (useDemo: boolean) => {
      clearTimers();
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setVisualPhase('downloading');
      setErrorMessage(null);
      setSavedBlob(null);
      setViaBrowser(false);
      setProgress(EMPTY_PROGRESS);
      pendingBlobRef.current = null;

      try {
        if (useDemo) {
          await runDemoDownload(
            controller.signal,
            (snap) => setProgress(snap),
            () => {},
          );
          showFlash();
          return;
        }

        const result = await fetchInstaller(
          fetchUrls,
          directDownloadUrl,
          controller.signal,
          (snap) => setProgress(snap),
        );

        if (result.kind === 'blob') {
          pendingBlobRef.current = result.blob;
          setSavedBlob(result.blob);
        } else {
          setViaBrowser(true);
        }

        showFlash();
      } catch (err) {
        if (controller.signal.aborted) {
          setVisualPhase('idle');
          return;
        }
        setVisualPhase('error');
        setErrorMessage(err instanceof Error ? err.message : 'Download failed');
      }
    },
    [clearTimers, directDownloadUrl, fetchUrls, showFlash],
  );

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !autoStart) return;
    startedRef.current = true;
    void runDownload(false);
  }, [autoStart, runDownload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (visualPhase === 'downloading') {
        e.preventDefault();
        abortRef.current?.abort();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visualPhase]);

  const displayPct = Math.round(progress.percent);

  const speedPart = formatSpeed(progress.speedBps);
  const etaPart = formatEta(progress.etaSec);
  const detail =
    progress.total != null
      ? [formatBytes(progress.loaded), formatBytes(progress.total), speedPart, etaPart]
          .filter(Boolean)
          .join(' \u00b7 ')
      : [formatBytes(progress.loaded), speedPart, etaPart].filter(Boolean).join(' \u00b7 ') ||
        'downloading...';

  return (
    <div className="rf-dl-flow">
      <div className="relative flex w-full min-h-screen flex-col items-center justify-center overflow-hidden">
        <div className="fixed inset-0 z-0 pointer-events-none">
          <SilkBackground demoMode={false} variant="owl" />
        </div>

        {visualPhase === 'idle' && (
          <DownloadOwlHero
            version={version}
            onDownload={() => runDownload(false)}
          />
        )}

        {visualPhase === 'downloading' && (
          <>
            <ProgressRing pct={displayPct} reducedMotion={reducedMotion} />
            <p className="relative z-10 mt-4 text-center text-sm text-rf-text-muted">
              {detail}
            </p>
            <button
              type="button"
              className="relative z-10 mt-6 text-xs text-rf-text-muted/50 underline underline-offset-4 hover:text-rf-text-muted transition-colors"
              onClick={() => abortRef.current?.abort()}
            >
              Cancel
            </button>
          </>
        )}

        {visualPhase === 'flash' && (
          <>
            <AnimatedCheckmark />
            <p className="relative z-10 mt-4 text-center text-sm text-rf-text-muted">
              {viaBrowser
                ? 'check your browser downloads'
                : 'saved to your downloads folder'}
            </p>
          </>
        )}

        {visualPhase === 'done' && (
          <div className="relative z-10 flex flex-col items-center w-full max-w-md px-6">
            <p className="rf-dl-post-eyebrow">DOWNLOAD COMPLETE</p>
            <h1 className="font-display text-3xl font-bold text-rf-text mb-8 text-center leading-tight">
              thanks for downloading!
            </h1>

            <div className="rf-dl-steps w-full" role="list">
              {STEPS.map((step, i) => (
                <div className="rf-dl-step" key={i} role="listitem">
                  {i < STEPS.length - 1 && (
                    <div className="rf-dl-step-line" aria-hidden />
                  )}
                  <StepIcon status={step.status} />
                  <span
                    className={`rf-dl-step-label${
                      step.status === 'upcoming' ? ' rf-dl-step-label--dim' : ''
                    }`}
                  >
                    {step.label}
                  </span>
                  {step.badge && (
                    <span
                      className={`rf-dl-step-badge rf-dl-step-badge--${step.status}`}
                    >
                      {step.badge}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {savedBlob && (
              <button
                type="button"
                className="mt-6 w-full flex items-center justify-center gap-2 rounded-full bg-rf-text text-rf-bg px-8 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
                onClick={() => saveBlob(savedBlob, filename)}
              >
                <svg viewBox="0 0 20 20" width={16} height={16} aria-hidden>
                  <path
                    d="M10 3v10m0 0l-3.5-3.5M10 13l3.5-3.5M4 16h12"
                    fill="none" stroke="currentColor"
                    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
                Open installer
              </button>
            )}

            <div className="mt-6 flex items-center gap-2 flex-wrap justify-center text-xs">
              <a
                href="/changelog"
                className="text-rf-text-muted/50 hover:text-rf-text-muted underline-offset-4 hover:underline transition-colors"
              >
                Changelog
              </a>
              <span className="text-rf-text-muted/25" aria-hidden>
                &middot;
              </span>
              <a
                href={`${SITE.releases}/tag/v${version}`}
                className="text-rf-text-muted/50 hover:text-rf-text-muted underline-offset-4 hover:underline transition-colors"
              >
                v{version} notes
              </a>
              <span className="text-rf-text-muted/25" aria-hidden>
                &middot;
              </span>
              <a
                href={troubleHref}
                className="text-rf-text-muted/50 hover:text-rf-text-muted underline-offset-4 hover:underline transition-colors"
              >
                Troubleshooting
              </a>
            </div>
          </div>
        )}

        {visualPhase === 'error' && (
          <div className="relative z-10 flex flex-col items-center gap-4 px-6">
            <h2 className="font-display text-2xl font-bold text-rf-text">
              Download failed
            </h2>
            <p className="text-sm text-rf-text-muted text-center">
              {errorMessage}
            </p>
            <button
              type="button"
              className="mt-2 rounded-full border border-rf-border bg-rf-surface/80 px-8 py-3 text-sm font-medium text-rf-text hover:bg-rf-surface transition-colors"
              onClick={() => runDownload(false)}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
