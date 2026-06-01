import React, { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';
import { Play, SkipForward, SkipBack, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import type { LoopMode, Direction, Layer } from './types';
import { useRafLoop } from './hooks';

const COLS = 10;
const ROWS = 10;
const BAND_RANGES: [number, number][] = [
  [0, 1], [1, 3], [3, 6], [6, 10], [10, 16],
  [16, 24], [24, 36], [36, 52], [52, 74], [74, 100],
];
const sineOut = (x: number) => Math.sin((x * Math.PI) / 2);
const sineIn = (x: number) => 1 - Math.cos((x * Math.PI) / 2);
const sineInOut = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const PART_A_DUR = 1.5;
const PART_A_TO = 11;
const PART_A_STEP = 3 / (COLS - 1);
const PART_B_DUR = 1;
const SCALE_FROM = 0.133;
const SCALE_TO = 0.8;

function partAColumnY(time: number, col: number): number {
  const local = time - col * PART_A_STEP;
  const period = PART_A_DUR * 2;
  const cyc = ((local % period) + period) % period;
  if (cyc < PART_A_DUR) return PART_A_TO * sineInOut(cyc / PART_A_DUR);
  return PART_A_TO * sineInOut(1 - (cyc - PART_A_DUR) / PART_A_DUR);
}
function partBCircle(time: number, col: number, row: number): [number, number] {
  const frac = row / ROWS;
  const yFrom = lerp(77, -77, frac);
  const yTo = lerp(col, -col, frac);
  const local = time - col / COLS;
  const period = PART_B_DUR * 2;
  const cyc = ((local % period) + period) % period;
  let e: number;
  if (cyc < PART_B_DUR) e = sineOut(cyc / PART_B_DUR);
  else e = sineIn(1 - (cyc - PART_B_DUR) / PART_B_DUR);
  return [lerp(yFrom, yTo, e), lerp(SCALE_FROM, SCALE_TO, e)];
}

export function ScalesMixer({
  isPlaying,
  getFrequencyData,
}: {
  isPlaying: boolean;
  getFrequencyData?: () => Uint8Array | null;
}) {
  const maskId = useId().replace(/:/g, '_');
  const colRefs = useRef<(SVGGElement | null)[]>([]);
  const circleRefs = useRef<(SVGCircleElement | null)[][]>(Array.from({ length: COLS }, () => []));
  const tRef = useRef(50);

  useRafLoop((_, dt) => {
    if (isPlaying) tRef.current += dt / 1000;
    const time = tRef.current;
    const freqData = getFrequencyData?.();
    for (let c = 0; c < COLS; c++) {
      let energy = 0.0;
      let hasData = false;
      if (freqData) {
        const [binStart, binEnd] = BAND_RANGES[c];
        let sum = 0;
        for (let b = binStart; b < binEnd; b++) sum += freqData[b] ?? 0;
        if (sum > 0) {
          energy = Math.sqrt(sum / (binEnd - binStart) / 255);
          hasData = true;
        }
      }
      if (!hasData) {
        if (isPlaying) {
          const speed = [1.2, 1.5, 0.8, 1.9, 1.1, 1.4, 0.9, 1.6, 1.1, 1.3][c];
          const amp = [0.6, 0.8, 0.5, 0.9, 0.6, 0.7, 0.4, 0.8, 0.5, 0.6][c];
          energy = (0.5 + 0.5 * Math.sin(time * 8 * speed)) * amp;
        } else {
          energy = 0;
        }
      }
      const bobGain = isPlaying ? (0.4 + energy) : 0.2;
      const scaleGain = isPlaying ? (0.5 + energy) : 0.3;
      const colEl = colRefs.current[c];
      if (colEl) {
        const ay = partAColumnY(time, c) * bobGain;
        colEl.style.transform = `translate(${c * 10}px, ${ay}px)`;
      }
      for (let r = 0; r < ROWS; r++) {
        const circle = circleRefs.current[c][r];
        if (!circle) continue;
        const [ty, s] = partBCircle(time, c, r);
        circle.style.transform = `translateY(${ty}px) scale(${s * scaleGain})`;
      }
    }
  });

  return (
    <svg className={cn("h-4 fill-white/80", !isPlaying && "opacity-40", isPlaying && "animate-pulse")} viewBox="0 0 98 108" aria-hidden="true" style={{ width: '40px' }}>
      <mask id={maskId}>
        <rect width="10" height="10" fill="#fff" />
      </mask>
      {Array.from({ length: COLS }, (_, c) => (
        <g key={c} ref={(el) => { colRefs.current[c] = el; }} style={{ transform: `translate(${c * 10}px, 0px)` }}>
          {Array.from({ length: ROWS }, (_, r) => (
            <g key={r} mask={`url(#${maskId})`} transform={`translate(0 ${r * 10})`}>
              <circle ref={(el) => { circleRefs.current[c][r] = el; }} cx="5" cy="5" r="5" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

const SPIN_MAX = 0.4375;
const BURST_DURATION = 620;

export function Disc({
  layers,
  isPlaying,
  trackKey,
  direction,
  isExpanded,
}: {
  layers: Layer[];
  isPlaying: boolean;
  trackKey: number;
  direction: Direction;
  isExpanded?: boolean;
}) {
  const spinRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef(0);
  const velRef = useRef(0);
  const burstRef = useRef({ from: 0, start: 0, active: false, pending: false });
  const lastKey = useRef(trackKey);

  useEffect(() => {
    if (trackKey !== lastKey.current) {
      lastKey.current = trackKey;
      if (direction) {
        burstRef.current.from = direction === 'prev' ? 360 : -360;
        burstRef.current.pending = true;
      }
    }
  }, [trackKey, direction]);

  useRafLoop((now) => {
    const el = spinRef.current;
    if (!el) return;
    if (isPlaying && !isExpanded) velRef.current += (SPIN_MAX - velRef.current) * 0.2;
    else {
      velRef.current *= 0.96;
      if (velRef.current < 0.001) velRef.current = 0;
    }
    
    if (isExpanded) {
      // Smoothly rotate to nearest 360 degree, taking the shortest path
      const target = Math.round(rotRef.current / 360) * 360;
      rotRef.current += (target - rotRef.current) * 0.08;
    } else {
      rotRef.current += velRef.current;
    }
    
    const burst = burstRef.current;
    if (burst.pending) {
      burst.start = now;
      burst.pending = false;
      burst.active = true;
    }
    let b = 0;
    if (burst.active) {
      const t = (now - burst.start) / BURST_DURATION;
      if (t >= 1) burst.active = false;
      else b = burst.from * (1 - (1 - Math.pow(1 - t, 3)));
    }
    el.style.transform = `scale(1.01) rotate(${rotRef.current + b}deg)`;
  });

  return (
    <div className={cn("relative w-full h-full transition-transform duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-disc")}>
      <div 
        className={cn(
          "absolute inset-0 overflow-hidden shadow-[0_12px_24px_rgba(0,0,0,0.4)] transition-all duration-[700ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
          isExpanded ? "rounded-[32px]" : "rounded-[190px] ring-1 ring-white/5"
        )} 
        ref={spinRef}
      >
        {layers.map((l, i) => {
          const isNewest = i === layers.length - 1;
          const cls = cn(
            "absolute inset-0 w-full h-full object-cover transition-all duration-[700ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
            isExpanded ? "rounded-[32px]" : "rounded-[190px]",
            isNewest ? (l.dir ? "cover-enter" : "") : "cover-exit"
          );
          return (
            <img key={l.id} src={l.track.cover} alt={`${l.track.title} — ${l.track.artist}`} className={cls} draggable={false} />
          );
        })}
        <div className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[84px] h-[84px] rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.6)] flex items-center justify-center overflow-hidden bg-[#181818] ring-4 ring-[#111] transition-all duration-[500ms]",
          isExpanded ? "opacity-0 scale-50" : "opacity-100 scale-100"
        )}>
           <div className="absolute inset-0 rounded-full opacity-30 border-[3px] border-dashed border-[#aaa]"></div>
           <div className="absolute inset-2 rounded-full border-[1px] border-dotted border-[#aaa] opacity-50"></div>
           <div className="absolute w-1.5 h-1.5 bg-[#ccc] rounded-full top-2.5 left-1/2 -translate-x-1/2"></div>
           <div className="absolute w-1 h-1 bg-[#ccc] rounded-full bottom-3 left-1/4"></div>

           <div className="relative w-8 h-8 rounded-full bg-[#121212] shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)] border border-[#333]">
              <div className="absolute inset-0 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,1)]"></div>
           </div>
        </div>
      </div>
      
      <div className={cn(
        "absolute inset-0 pointer-events-none mix-blend-screen transition-all duration-[700ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
        isExpanded ? "opacity-0 rounded-[32px]" : "opacity-[0.05] rounded-[190px]"
      )} style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.8) 100%)' }}></div>
    </div>
  );
}

function MarqueeTitle({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        setIsOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth + 2);
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [text]);

  return (
    <div ref={containerRef} className={cn("w-full max-w-[280px] overflow-hidden leading-tight mt-1", isOverflowing && "fade-edges")}>
      <div className={cn("flex whitespace-nowrap", isOverflowing ? "w-max animate-marquee" : "w-full justify-center")}>
        <span ref={textRef} className={cn("inline-block", isOverflowing && "pr-12", className)}>
          {text}
        </span>
        {isOverflowing && (
          <span className={cn("inline-block pr-12", className)}>
            {text}
          </span>
        )}
      </div>
    </div>
  );
}

export function TrackInfo({ layers }: { layers: Layer[] }) {
  return (
    <div className="relative w-full h-[64px] flex justify-center items-center overflow-hidden px-8 mb-4">
      {layers.map((l, i) => {
        const isNewest = i === layers.length - 1;
        const dx = l.dir === 'next' ? 14 : l.dir === 'prev' ? -14 : 0;
        const exitDx = -dx;
        const state = isNewest ? (l.dir ? 'ti-enter' : '') : 'ti-exit';
        const style = { ['--dx' as string]: `${isNewest ? dx : exitDx}px` } as React.CSSProperties;
        return (
          <div key={l.id} className={cn("absolute inset-0 flex flex-col items-center justify-center text-center", !isNewest && "pointer-events-none")}>
            <p className={cn("text-gray-400 text-[11px] font-medium tracking-[0.2em] uppercase", state)} style={style}>
              {l.track.artist}
            </p>
            <div className={cn("w-full flex justify-center", state)} style={style}>
              <MarqueeTitle text={l.track.title} className="text-white text-[24px] font-semibold tracking-tight" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmt(s: number): string {
  if (!isFinite(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function ProgressBar({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (pct: number) => void;
}) {
  const pct = duration ? (currentTime / duration) * 100 : 0;
  return (
    <div className="w-full flex md:w-full flex-col px-8">
      <div
        className="w-full h-0.5 bg-white/10 cursor-pointer relative group/bar mb-4"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
        }}
      >
        <div className="absolute left-0 top-0 bottom-0 bg-accent transition-all duration-100 group-hover/bar:h-1 group-hover/bar:-top-[1px]" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-full flex justify-center items-center gap-3 text-gray-400 text-[13px] font-mono tracking-widest">
        <span>{fmt(currentTime)}</span>
        <span className="text-gray-600">/</span>
        <span>{fmt(duration)}</span>
      </div>
    </div>
  );
}

export function Controls({
  isPlaying,
  shuffled,
  loopMode,
  onToggle,
  onNext,
  onPrev,
  onShuffle,
  onLoop,
}: {
  isPlaying: boolean;
  shuffled: boolean;
  loopMode: LoopMode;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onShuffle: () => void;
  onLoop: () => void;
}) {
  return (
    <div className="w-full flex items-center justify-center gap-6 px-6 mt-8 mb-4">
      <button className={cn("transition-colors duration-200", shuffled ? "text-accent hover:text-red-400" : "text-gray-500 hover:text-white")} onClick={onShuffle} aria-label="Shuffle">
        <Shuffle size={18} strokeWidth={2.5} />
      </button>
      <button className="text-gray-400 hover:text-white transition-colors duration-200" onClick={onPrev} aria-label="Previous">
        <SkipBack size={20} fill="currentColor" />
      </button>
      <button
        className="relative w-[64px] h-[64px] bg-accent text-white hover:bg-red-500 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] shadow-lg overflow-hidden"
        onClick={onToggle}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        <Play size={24} fill="currentColor" className={cn("transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ml-1", isPlaying ? "opacity-0 scale-50 rotate-45 pointer-events-none" : "opacity-100 scale-100 rotate-0")} />
        <div className={cn("absolute bg-white transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]", isPlaying ? "w-[18px] h-[18px] opacity-100 scale-100 animate-play-pulse" : "w-[18px] h-[18px] opacity-0 scale-50 pointer-events-none")} />
      </button>
      <button className="text-gray-400 hover:text-white transition-colors duration-200" onClick={onNext} aria-label="Next">
        <SkipForward size={20} fill="currentColor" />
      </button>
      <button className={cn("transition-colors duration-200", loopMode !== 'off' ? "text-accent hover:text-red-400" : "text-gray-500 hover:text-white")} onClick={onLoop} aria-label="Loop">
        {loopMode === 'one' ? <Repeat1 size={18} strokeWidth={2.5} /> : <Repeat size={18} strokeWidth={2.5} />}
      </button>
    </div>
  );
}
