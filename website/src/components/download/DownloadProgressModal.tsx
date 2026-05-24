import { useEffect, useRef } from 'react';
import type { ProgressSnapshot } from '../../lib/downloadProgress';
import { formatBytes, formatEta, formatSpeed } from '../../lib/downloadProgress';

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
  const complete = phase === 'complete';
  const errored = phase === 'error';
  const processing = phase === 'processing';

  const speedPart = formatSpeed(progress.speedBps);
  const etaPart = formatEta(progress.etaSec);
  const detail =
    complete
      ? viaBrowser
        ? 'Download started in your browser. Check Downloads (Ctrl+J in Chrome or Edge).'
        : 'Saved to your Downloads folder.'
      : errored
        ? errorMessage ?? 'Download failed.'
        : processing
          ? 'Finishing…'
          : progress.total != null
            ? [formatBytes(progress.loaded), formatBytes(progress.total), speedPart, etaPart]
                .filter(Boolean)
                .join(' · ')
            : [formatBytes(progress.loaded), speedPart, etaPart].filter(Boolean).join(' · ') ||
              'Downloading…';

  useEffect(() => {
    if (!visible || !liveRef.current || errored) return;
    liveRef.current.textContent = complete
      ? 'Download complete.'
      : `${pct} percent. ${detail}`;
  }, [visible, pct, detail, complete, errored]);

  if (!visible) return null;

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
          <h2 className="rf-dl-modal-heading">
            {complete ? 'Download complete' : errored ? 'Download failed' : 'Downloading installer'}
          </h2>
          <p className="rf-dl-modal-filename">{filename}</p>

          {!errored && (
            <div className="rf-dl-bar-wrap" aria-hidden={complete}>
              <div className="rf-dl-bar-track">
                <div
                  className={`rf-dl-bar-fill${complete ? ' rf-dl-bar-fill--done' : ''}`}
                  style={{ width: `${pct}%`, transition: reducedMotion ? 'none' : undefined }}
                />
              </div>
              {!complete && <span className="rf-dl-bar-pct">{pct}%</span>}
            </div>
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
            {complete && (
              <>
                {onSaveAgain && (
                  <button type="button" className="rf-dl-btn-secondary" onClick={onSaveAgain}>
                    Save again
                  </button>
                )}
                {onDone && (
                  <button type="button" className="rf-dl-btn-primary" onClick={onDone}>
                    Done
                  </button>
                )}
              </>
            )}
          </div>

          <p className="rf-dl-trouble">
            <a href={troubleHref}>Having trouble?</a>
          </p>
        </div>
      </div>
    </div>
  );
}
