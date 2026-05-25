import { useEffect, useRef, useState } from 'react';
import type { ProgressSnapshot } from '../../lib/downloadProgress';
import { formatBytes, formatEta, formatSpeed } from '../../lib/downloadProgress';
import { SITE } from '../../lib/site';

export type ModalPhase = 'downloading' | 'processing' | 'complete' | 'error';

type Props = {
  visible: boolean;
  logoSrc: string;
  filename: string;
  version: string;
  phase: ModalPhase;
  progress: ProgressSnapshot;
  errorMessage: string | null;
  viaBrowser?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onSaveAgain?: () => void;
  onDone?: () => void;
  troubleHref: string;
  reducedMotion: boolean;
};

/* ------------------------------------------------------------------ */
/*  Animated checkmark SVG (draws in via stroke-dashoffset)           */
/* ------------------------------------------------------------------ */

function AnimatedCheckmark({ active }: { active: boolean }) {
  return (
    <svg
      className="rf-dl-checkmark-svg"
      viewBox="0 0 52 52"
      width={52}
      height={52}
      aria-hidden
    >
      <circle
        className={`rf-dl-checkmark-ring${active ? ' rf-dl-checkmark-ring--fill' : ''}`}
        cx={26}
        cy={26}
        r={23}
        fill="none"
        stroke="#4caf50"
        strokeWidth={3}
      />
      <path
        className={`rf-dl-checkmark-path${active ? ' rf-dl-checkmark-path--draw' : ''}`}
        d="M15 27 l7 7 l15 -15"
        fill="none"
        stroke="#4caf50"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress ring (circular)                                          */
/* ------------------------------------------------------------------ */

const RING_R = 40;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

function ProgressRing({ pct, reducedMotion }: { pct: number; reducedMotion: boolean }) {
  const offset = RING_CIRCUMFERENCE * (1 - pct / 100);
  return (
    <svg className="rf-dl-ring-svg" viewBox="0 0 100 100" width={96} height={96} aria-hidden>
      <circle
        cx={50}
        cy={50}
        r={RING_R}
        fill="none"
        stroke="rgb(237 215 156 / 0.1)"
        strokeWidth={5}
      />
      <circle
        className="rf-dl-ring-fill"
        cx={50}
        cy={50}
        r={RING_R}
        fill="none"
        stroke="var(--color-rf-accent)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{ transition: reducedMotion ? 'none' : 'stroke-dashoffset 0.25s ease' }}
        transform="rotate(-90 50 50)"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Post-download steps timeline                                      */
/* ------------------------------------------------------------------ */

type StepStatus = 'done' | 'current' | 'upcoming';

const STEPS: { label: string; badge: string }[] = [
  { label: 'Download finished', badge: 'DONE' },
  { label: 'Run the installer', badge: 'NEXT' },
  { label: 'Launch RuForge', badge: '' },
];

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <div className="rf-dl-step-icon rf-dl-step-icon--done">
        <svg viewBox="0 0 20 20" width={14} height={14} aria-hidden>
          <path
            d="M5 10.5 l3.5 3.5 l6.5 -7"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (status === 'current') {
    return (
      <div className="rf-dl-step-icon rf-dl-step-icon--current">
        <svg viewBox="0 0 20 20" width={10} height={10} aria-hidden>
          <path
            d="M7 5 l7 5 l-7 5z"
            fill="currentColor"
          />
        </svg>
      </div>
    );
  }
  return <div className="rf-dl-step-icon rf-dl-step-icon--upcoming" />;
}

function PostDownloadSteps({
  version,
  onSaveAgain,
  troubleHref,
}: {
  version: string;
  onSaveAgain?: () => void;
  troubleHref: string;
}) {
  const stepStatuses: StepStatus[] = ['done', 'current', 'upcoming'];

  return (
    <div className="rf-dl-post">
      <p className="rf-dl-post-eyebrow">DOWNLOAD COMPLETE</p>
      <h2 className="rf-dl-post-heading">thanks for downloading.</h2>

      <div className="rf-dl-steps" role="list">
        {STEPS.map((step, i) => (
          <div className="rf-dl-step" key={i} role="listitem">
            {i < STEPS.length - 1 && (
              <div className="rf-dl-step-line" aria-hidden />
            )}
            <StepIcon status={stepStatuses[i]} />
            <span className={`rf-dl-step-label${stepStatuses[i] === 'upcoming' ? ' rf-dl-step-label--dim' : ''}`}>
              {step.label}
            </span>
            {step.badge && (
              <span className={`rf-dl-step-badge rf-dl-step-badge--${stepStatuses[i]}`}>
                {step.badge}
              </span>
            )}
          </div>
        ))}
      </div>

      {onSaveAgain && (
        <button type="button" className="rf-dl-btn-primary rf-dl-post-cta" onClick={onSaveAgain}>
          <svg viewBox="0 0 20 20" width={16} height={16} aria-hidden>
            <path
              d="M10 3v10m0 0l-3.5-3.5M10 13l3.5-3.5M4 16h12"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Open installer
        </button>
      )}

      <div className="rf-dl-post-links">
        <a href="/changelog">Changelog</a>
        <span className="rf-dl-post-dot" aria-hidden>&middot;</span>
        <a href={`${SITE.releases}/tag/v${version}`}>v{version} notes</a>
        <span className="rf-dl-post-dot" aria-hidden>&middot;</span>
        <a href={troubleHref}>Troubleshooting</a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Flash confirmation (animated checkmark, auto-dismiss)             */
/* ------------------------------------------------------------------ */

function FlashConfirm({
  viaBrowser,
  onFinished,
}: {
  viaBrowser: boolean;
  onFinished: () => void;
}) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setActive(true), 80);
    const t2 = window.setTimeout(onFinished, 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onFinished]);

  return (
    <div className="rf-dl-flash">
      <div className="rf-dl-flash-check">
        <AnimatedCheckmark active={active} />
      </div>
      <p className="rf-dl-flash-text">
        {viaBrowser
          ? 'check your browser downloads'
          : 'saved to your downloads folder'}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main modal                                                        */
/* ------------------------------------------------------------------ */

export default function DownloadProgressModal({
  visible,
  logoSrc,
  filename,
  version,
  phase,
  progress,
  errorMessage,
  viaBrowser = false,
  onCancel,
  onRetry,
  onSaveAgain,
  onDone,
  troubleHref,
  reducedMotion,
}: Props) {
  const liveRef = useRef<HTMLParagraphElement>(null);
  const pct = Math.min(100, Math.round(progress.percent));
  const errored = phase === 'error';
  const processing = phase === 'processing';

  // Internal sub-phase for the complete state: flash first, then steps
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    if (phase !== 'complete') {
      setShowSteps(false);
    }
  }, [phase]);

  const speedPart = formatSpeed(progress.speedBps);
  const etaPart = formatEta(progress.etaSec);
  const detail = errored
    ? errorMessage ?? 'Download failed.'
    : processing
      ? 'Finishing...'
      : progress.total != null
        ? [formatBytes(progress.loaded), formatBytes(progress.total), speedPart, etaPart]
            .filter(Boolean)
            .join(' \u00b7 ')
        : [formatBytes(progress.loaded), speedPart, etaPart].filter(Boolean).join(' \u00b7 ') ||
          'Downloading...';

  useEffect(() => {
    if (!visible || !liveRef.current || errored || phase === 'complete') return;
    liveRef.current.textContent = `${pct} percent. ${detail}`;
  }, [visible, pct, detail, errored, phase]);

  if (!visible) return null;

  // Complete phase: flash confirmation, then post-download steps
  if (phase === 'complete') {
    return (
      <div
        className="rf-dl-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label={showSteps ? 'Download complete' : 'Saved'}
      >
        <div className={`rf-dl-modal rf-dl-modal--post${reducedMotion ? ' rf-dl-modal--reduced' : ''}`}>
          {!showSteps ? (
            <FlashConfirm
              viaBrowser={viaBrowser}
              onFinished={() => setShowSteps(true)}
            />
          ) : (
            <PostDownloadSteps
              version={version}
              onSaveAgain={onSaveAgain}
              troubleHref={troubleHref}
            />
          )}
        </div>
      </div>
    );
  }

  // Downloading / processing / error
  return (
    <div
      className="rf-dl-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rf-dl-modal-title"
    >
      <div className={`rf-dl-modal${reducedMotion ? ' rf-dl-modal--reduced' : ''}`}>
        <div className="rf-dl-modal-header">
          <img className="rf-dl-modal-logo" src={logoSrc} alt="" width={28} height={28} />
          <div className="rf-dl-modal-titles">
            <span id="rf-dl-modal-title" className="rf-dl-modal-app-name">
              RuForge
            </span>
            <span className="rf-dl-modal-version">v{version}</span>
          </div>
        </div>

        <div className="rf-dl-modal-body rf-scrollbar">
          {!errored && (
            <div className="rf-dl-ring-wrap">
              <ProgressRing pct={pct} reducedMotion={reducedMotion} />
              <span className="rf-dl-ring-label">
                {processing ? 'Finishing...' : `${pct}%`}
              </span>
            </div>
          )}

          {errored && (
            <h2 className="rf-dl-modal-heading">Download failed</h2>
          )}

          <p ref={liveRef} className="rf-dl-modal-stat" aria-live="polite" aria-atomic="true">
            {detail}
          </p>

          <div className="rf-dl-modal-actions">
            {phase === 'downloading' && onCancel && (
              <button type="button" className="rf-dl-btn-secondary" onClick={onCancel}>
                Cancel
              </button>
            )}
            {errored && onRetry && (
              <button type="button" className="rf-dl-btn-primary" onClick={onRetry}>
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
