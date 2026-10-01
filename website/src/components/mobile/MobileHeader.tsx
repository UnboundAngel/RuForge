import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import MobileFullscreenNav from './MobileFullscreenNav';
const SCROLL_THRESHOLD = 64;
/** Pill padding (16 each side) + gap (16) + menu button (44, pulled in 4). */
const PILL_CHROME = 88;
const PILL_LOGO_SCALE = 0.75;

interface Props {
  logoSrc: string;
}

export default function MobileHeader({ logoSrc }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [pillWidth, setPillWidth] = useState(200);
  const rafRef = useRef(0);
  const logoRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const measure = () => {
      const logo = logoRef.current;
      if (logo) setPillWidth(Math.ceil(logo.offsetWidth * PILL_LOGO_SCALE + PILL_CHROME));
    };
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      rafRef.current = requestAnimationFrame(() => {
        setScrolled(window.scrollY > SCROLL_THRESHOLD);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (navOpen) {
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
    } else {
      html.style.overflow = '';
      body.style.overflow = '';
    }
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
    };
  }, [navOpen]);

  const toggle = useCallback(() => {
    setNavOpen((v) => !v);
  }, []);

  const hamburger = (
    <button
      onClick={toggle}
      className="rf-m-btn flex items-center justify-center w-11 h-11 -mr-1 rounded-lg text-rf-text-muted hover:text-rf-text shrink-0"
      aria-label={navOpen ? 'Close menu' : 'Open menu'}
      aria-expanded={navOpen}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <line x1="3" y1="5" x2="17" y2="5"
          style={{
            transformOrigin: '10px 10px',
            transition: 'transform 200ms ease, opacity 200ms ease',
            transform: navOpen ? 'rotate(45deg) translateY(5px)' : 'rotate(0deg) translateY(0px)',
          }}
        />
        <line x1="3" y1="10" x2="17" y2="10"
          style={{
            transition: 'opacity 200ms ease',
            opacity: navOpen ? 0 : 1,
          }}
        />
        <line x1="3" y1="15" x2="17" y2="15"
          style={{
            transformOrigin: '10px 10px',
            transition: 'transform 200ms ease, opacity 200ms ease',
            transform: navOpen ? 'rotate(-45deg) translateY(-5px)' : 'rotate(0deg) translateY(0px)',
          }}
        />
      </svg>
    </button>
  );

  const pillEdge = 'calc(50% - var(--pill-w) / 2)';
  const shift = 'calc(50vw - var(--pill-w) / 2 - 4px)';
  const morph = 'transition-[clip-path,background-color,transform,filter] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none';

  return (
    <>
      {/* One header that morphs from the full-width bar into the floating pill. */}
      <header
        data-rf-fixed-header
        className={`fixed inset-x-0 top-0 z-[100] h-[76px] ${morph}`}
        style={{
          '--pill-w': `${pillWidth}px`,
          pointerEvents: scrolled ? 'none' : 'auto',
          filter: scrolled ? 'drop-shadow(0 8px 14px rgb(0 0 0 / 0.3))' : 'drop-shadow(0 0 0 rgb(0 0 0 / 0))',
        } as CSSProperties}
      >
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-rf-border/40 ${morph}`}
          style={{
            clipPath: scrolled ? `inset(12px ${pillEdge} 4px ${pillEdge} round 30px)` : 'inset(0px 0px 0px 0px round 0px)',
          }}
        />
        <div
          aria-hidden="true"
          className={`absolute inset-0 ${morph}`}
          style={{
            backgroundColor: scrolled ? 'var(--color-rf-surface)' : 'var(--color-rf-bg)',
            clipPath: scrolled
              ? `inset(13px calc(${pillEdge} + 1px) 5px calc(${pillEdge} + 1px) round 29px)`
              : 'inset(0px 0px 1px 0px round 0px)',
          }}
        />
        <div className="relative flex h-full items-center justify-between px-5">
          <a
            ref={logoRef}
            href="/m/"
            className={`pointer-events-auto flex shrink-0 origin-left items-center gap-2.5 no-underline ${morph}`}
            style={{ transform: scrolled ? `translate(${shift}, 4px) scale(0.75)` : 'none' }}
          >
            <img src={logoSrc} alt="RuForge" className="w-8 h-8 rounded-md" width={32} height={32} />
            <span className="font-hand text-2xl font-bold text-rf-text tracking-tight leading-none">
              RuForge
            </span>
          </a>
          <div
            className={`pointer-events-auto ${morph}`}
            style={{ transform: scrolled ? `translate(calc(-1 * ${shift}), 4px)` : 'none' }}
          >
            {hamburger}
          </div>
        </div>
      </header>

      <MobileFullscreenNav open={navOpen} onClose={() => setNavOpen(false)} logoSrc={logoSrc} />
    </>
  );
}
