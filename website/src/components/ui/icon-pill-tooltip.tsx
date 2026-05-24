'use client';

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

type TipPos = { top: number; left: number };

function clampTip(anchor: DOMRect, tip: DOMRect): TipPos {
  const pad = 8;
  const gap = 6;
  let top = anchor.top - tip.height - gap;
  if (top < pad) {
    top = anchor.bottom + gap;
  }

  let left = anchor.left + anchor.width / 2 - tip.width / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - tip.width - pad));

  return { top, left };
}

export function IconPillTooltip({
  label,
  children,
  className,
  uppercase = true,
  variant = 'icon',
}: {
  label: string;
  children: ReactNode;
  className?: string;
  /** Docs icons use uppercase pill labels; file paths stay readable. */
  uppercase?: boolean;
  variant?: 'icon' | 'path';
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<TipPos | null>(null);

  const updatePos = useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    setPos(clampTip(anchor.getBoundingClientRect(), tip.getBoundingClientRect()));
  }, []);

  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => {
    setVisible(false);
    setPos(null);
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [visible, updatePos]);

  return (
    <>
      <span
        ref={anchorRef}
        className={className}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tipRef}
            className={cn(
              'rf-icon-pill-tooltip rf-icon-pill-tooltip--floating',
              variant === 'path' && 'rf-icon-pill-tooltip--path',
              !uppercase && 'rf-icon-pill-tooltip--normal-case',
            )}
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
            role="tooltip"
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
