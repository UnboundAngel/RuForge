import { useState, useEffect, useCallback, useRef } from 'react';
import MobileFullscreenNav from './MobileFullscreenNav';
import { useHaptic } from './useHaptic';

const SCROLL_THRESHOLD = 64;

interface Props {
  logoSrc: string;
}

export default function MobileHeader({ logoSrc }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { tap } = useHaptic();
  const rafRef = useRef(0);

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
    tap();
    setNavOpen((v) => !v);
  }, [tap]);

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

  return (
    <>
      {/* Full-width bar (visible at top) */}
      <header
        className="fixed top-0 left-0 w-full z-[100] px-5 py-4 bg-rf-bg/90 backdrop-blur-md border-b border-rf-border/20 will-change-[opacity]"
        style={{
          opacity: scrolled ? 0 : 1,
          pointerEvents: scrolled ? 'none' : 'auto',
          transition: 'opacity 350ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <a href="/m/" className="flex items-center gap-2.5 no-underline shrink-0">
            <img src={logoSrc} alt="RuForge" className="w-8 h-8 rounded-md" width={32} height={32} />
            <span className="font-hand text-2xl font-bold text-rf-text tracking-tight leading-none">
              RuForge
            </span>
          </a>
          {hamburger}
        </div>
      </header>

      {/* Floating pill (visible after scroll) */}
      <header
        className="fixed top-3 left-1/2 z-[100] px-4 py-2 rounded-full bg-rf-surface/80 backdrop-blur-xl border border-rf-border/40 shadow-lg shadow-black/30 will-change-[opacity,transform]"
        style={{
          opacity: scrolled ? 1 : 0,
          pointerEvents: scrolled ? 'auto' : 'none',
          transform: scrolled
            ? 'translateX(-50%) translateY(0) scale(1)'
            : 'translateX(-50%) translateY(-8px) scale(0.95)',
          transition: 'opacity 350ms cubic-bezier(0.22, 1, 0.36, 1), transform 350ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <a href="/m/" className="flex items-center gap-2.5 no-underline shrink-0">
            <img src={logoSrc} alt="RuForge" className="w-6 h-6 rounded-md" width={24} height={24} />
            <span className="font-hand text-lg text-rf-text tracking-tight leading-none">
              RuForge
            </span>
          </a>
          {hamburger}
        </div>
      </header>

      <MobileFullscreenNav open={navOpen} onClose={() => setNavOpen(false)} logoSrc={logoSrc} />
    </>
  );
}
