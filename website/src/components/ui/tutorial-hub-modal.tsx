'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useRef } from 'react';
import { cn } from '../../lib/utils';

export interface TutorialHubStep {
  title: string;
  description: string;
  imageSrc: string;
}

export interface TutorialHubData {
  id: string;
  eyebrow: string;
  steps: TutorialHubStep[];
}

interface TutorialHubModalProps {
  hub: TutorialHubData | null;
  onClose: () => void;
}

const SKETCH_WIDTH = 515;
const SKETCH_HEIGHT = 749;

export function TutorialHubModal({ hub, onClose }: TutorialHubModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!hub) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [hub, onClose]);

  return (
    <AnimatePresence>
      {hub && (
        <>
          <motion.button
            type="button"
            aria-label="Close tutorial"
            className="fixed inset-0 z-[200] cursor-default bg-[#1d1613]/75 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="pointer-events-none fixed inset-0 z-[210] grid place-items-center p-4 sm:p-8">
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="pointer-events-auto flex max-h-[min(92vh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-rf-border/50 bg-rf-bg shadow-[0_24px_80px_rgb(0_0_0/0.55)]"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex shrink-0 items-center justify-between gap-4 border-b border-rf-border/40 px-5 py-4 sm:px-6">
                <h2 id={titleId} className="font-display text-lg font-bold tracking-tight text-rf-text sm:text-xl">
                  {hub.eyebrow}
                </h2>
                <button
                  type="button"
                  aria-label="Close"
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rf-border/60',
                    'bg-rf-surface/80 text-rf-text-muted transition-colors hover:border-rf-accent/30 hover:text-rf-text',
                  )}
                  onClick={onClose}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
                <div className="tutorial-modal-grid grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-3">
                  {hub.steps.map((step) => (
                    <article key={step.title} className="tutorial-modal-card overflow-visible rounded-[1.35rem] shadow-[0_12px_36px_rgb(0_0_0/0.25)]">
                      <div
                        className="relative w-full"
                        style={{ aspectRatio: `${SKETCH_WIDTH} / ${SKETCH_HEIGHT}` }}
                      >
                        <img
                          src={step.imageSrc}
                          alt=""
                          className="block h-full w-full object-contain object-top"
                          width={SKETCH_WIDTH}
                          height={SKETCH_HEIGHT}
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="tutorial-modal-card__copy absolute inset-x-[9%] bottom-[4.5%] top-[57.5%] flex flex-col items-start justify-start px-2 pt-7">
                          <h3 className="font-display m-0 mb-1.5 text-[1.05rem] font-bold leading-tight tracking-tight text-[#2c221e]">
                            {step.title}
                          </h3>
                          <p className="m-0 text-[0.8125rem] leading-snug text-[rgb(44_34_30/0.82)]">{step.description}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
