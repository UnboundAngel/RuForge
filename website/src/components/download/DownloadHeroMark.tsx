import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent } from 'react';

type DownloadHeroMarkProps = {
  logoSrc: string;
  onActivate?: () => void;
};

/** Obsidian download page uses sigmoid-scaled cursor offset for facet lighting. */
function sigmoid(t: number) {
  return 1 / (1 + Math.exp(-t));
}

function lightFromPointer(clientX: number, clientY: number, rect: DOMRect) {
  const nx = (clientX - (rect.left + rect.width / 2)) / window.innerWidth;
  const ny = (clientY - (rect.top + rect.height / 2)) / window.innerHeight;
  const lx = 50 * (2 * sigmoid(15 * nx) - 1);
  const ly = 50 * (2 * sigmoid(15 * ny) - 1);
  return {
    lx,
    ly,
    mx: `${clientX - rect.left}px`,
    my: `${clientY - rect.top}px`,
  };
}

const CENTER_STYLE = {
  '--spot-lx': '0',
  '--spot-ly': '0',
  '--mouse-x': '50%',
  '--mouse-y': '50%',
} as CSSProperties;

export default function DownloadHeroMark({ logoSrc, onActivate }: DownloadHeroMarkProps) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const interactive = Boolean(onActivate);
  const trackingRef = useRef(false);

  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { lx, ly, mx, my } = lightFromPointer(clientX, clientY, rect);
    el.style.setProperty('--spot-lx', String(lx));
    el.style.setProperty('--spot-ly', String(ly));
    el.style.setProperty('--mouse-x', mx);
    el.style.setProperty('--mouse-y', my);
  }, []);

  const resetPointer = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--spot-lx', '0');
    el.style.setProperty('--spot-ly', '0');
    el.style.setProperty('--mouse-x', '50%');
    el.style.setProperty('--mouse-y', '50%');
  }, []);

  const onCardPointerMove = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onCardPointerEnter = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      trackingRef.current = true;
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onCardPointerLeave = useCallback(() => {
    trackingRef.current = false;
    resetPointer();
  }, [resetPointer]);

  useEffect(() => {
    if (!interactive) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const onDocumentMove = (e: MouseEvent) => {
      if (!trackingRef.current) return;
      applyPointer(e.clientX, e.clientY);
    };

    document.addEventListener('mousemove', onDocumentMove, { passive: true });
    return () => document.removeEventListener('mousemove', onDocumentMove);
  }, [interactive, applyPointer]);

  const maskStyle = {
    WebkitMaskImage: `url(${logoSrc})`,
    maskImage: `url(${logoSrc})`,
  } as CSSProperties;

  return (
    <div className="rf-dl-hero-mark">
      <button
        ref={cardRef}
        type="button"
        className="rf-dl-hero-mark-btn rf-dl-logo-shimmer"
        onClick={onActivate}
        onPointerMove={interactive ? onCardPointerMove : undefined}
        onPointerEnter={interactive ? onCardPointerEnter : undefined}
        onPointerLeave={interactive ? onCardPointerLeave : undefined}
        disabled={!interactive}
        aria-label={interactive ? 'Download RuForge' : 'RuForge app icon'}
        style={CENTER_STYLE}
      >
        <div className="rf-dl-hero-mark-card">
          <span className="rf-dl-hero-mark-noise" aria-hidden />
          <div className="rf-dl-hero-mark-stack">
            <span className="rf-dl-hero-mark-plate" aria-hidden />
            <div className="rf-dl-hero-mark-logo-wrap">
              <div className="rf-dl-hero-mark-lit" style={maskStyle} aria-hidden />
              <img
                src={logoSrc}
                alt=""
                width={168}
                height={168}
                className="rf-dl-hero-mark-logo"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
