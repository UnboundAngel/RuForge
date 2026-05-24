import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { applyDownloadHeroLogoLight } from '../../lib/downloadHeroLogoLight';

const HERO_LOGO_SVG_URL = '/download-hero-logo.svg';

type DownloadHeroMarkProps = {
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

export default function DownloadHeroMark({ onActivate }: DownloadHeroMarkProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const logoWrapRef = useRef<HTMLDivElement>(null);
  const canDownload = Boolean(onActivate);
  const trackingRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const [heroLogoSvg, setHeroLogoSvg] = useState<string | null>(null);

  const applyLogoLight = useCallback((lx: number, ly: number) => {
    const svg = logoWrapRef.current?.querySelector('svg');
    if (!svg) return;
    applyDownloadHeroLogoLight(svg, lx, ly);
  }, []);

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const { lx, ly, mx, my } = lightFromPointer(clientX, clientY, rect);
      el.style.setProperty('--spot-lx', String(lx));
      el.style.setProperty('--spot-ly', String(ly));
      el.style.setProperty('--mouse-x', mx);
      el.style.setProperty('--mouse-y', my);
      if (!reducedMotionRef.current) {
        applyLogoLight(lx, ly);
      }
    },
    [applyLogoLight],
  );

  const resetPointer = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--spot-lx', '0');
    el.style.setProperty('--spot-ly', '0');
    el.style.setProperty('--mouse-x', '50%');
    el.style.setProperty('--mouse-y', '50%');
    applyLogoLight(0, 0);
  }, [applyLogoLight]);

  const onCardPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onCardPointerEnter = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
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
    let cancelled = false;
    fetch(HERO_LOGO_SVG_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((markup) => {
        if (!cancelled) setHeroLogoSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setHeroLogoSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!heroLogoSvg) return;
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    applyLogoLight(0, 0);
  }, [applyLogoLight, heroLogoSvg]);

  useEffect(() => {
    const onDocumentMove = (e: MouseEvent) => {
      if (!trackingRef.current) return;
      applyPointer(e.clientX, e.clientY);
    };

    document.addEventListener('mousemove', onDocumentMove, { passive: true });
    return () => document.removeEventListener('mousemove', onDocumentMove);
  }, [applyPointer]);

  const onClick = useCallback(() => {
    if (canDownload && onActivate) onActivate();
  }, [canDownload, onActivate]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!canDownload || !onActivate) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
    [canDownload, onActivate],
  );

  return (
    <div className="rf-dl-hero-mark">
      <div
        ref={cardRef}
        role={canDownload ? 'button' : 'img'}
        tabIndex={canDownload ? 0 : -1}
        aria-disabled={canDownload ? undefined : true}
        aria-label={canDownload ? 'Download RuForge' : 'RuForge app icon'}
        className={`rf-dl-hero-mark-btn rf-dl-logo-shimmer${canDownload ? '' : ' rf-dl-hero-mark-btn--static'}`}
        style={CENTER_STYLE}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerMove={onCardPointerMove}
        onPointerEnter={onCardPointerEnter}
        onPointerLeave={onCardPointerLeave}
      >
        <div className="rf-dl-hero-mark-card">
          <span className="rf-dl-hero-mark-noise" aria-hidden />
          <div className="rf-dl-hero-mark-stack">
            <div
              ref={logoWrapRef}
              className="rf-dl-hero-mark-logo-wrap rf-dl-hero-mark-logo-svg"
              {...(heroLogoSvg ? { dangerouslySetInnerHTML: { __html: heroLogoSvg } } : {})}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
