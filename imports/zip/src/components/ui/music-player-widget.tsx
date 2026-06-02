import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { cn } from '../../lib/utils';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1 } from 'lucide-react';

/* ----------------------------------------------------------------- types */

export interface Track {
  title: string;
  artist: string;
  cover: string;
  src: string;
}
export type LoopMode = 'off' | 'all' | 'one';
export type Direction = 'next' | 'prev' | null;
type AudioCtor = typeof AudioContext;

/* ------------------------------------------------------------- useRafLoop */

function useRafLoop(cb: (now: number, dt: number) => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      cbRef.current(now, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/* -------------------------------------------------- useTransitionSound */

function useTransitionSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);
  return useCallback((bassEnergy = 0.5) => {
    try {
      if (!ctxRef.current) {
        const Ctor: AudioCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: AudioCtor })
            .webkitAudioContext;
        if (!Ctor) return;
        ctxRef.current = new Ctor();
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startFreq = 440 + bassEnergy * 440;
      const endFreq = startFreq * (2 / 3);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      /* Web Audio unavailable */
    }
  }, []);
}

/* --------------------------------------------------- useAudioAnalyser */

const FFT_SIZE = 256;

function useAudioAnalyser(
  audioRef: React.RefObject<HTMLAudioElement | null>
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array>(new Uint8Array(FFT_SIZE / 2));
  const connectedRef = useRef(false);

  const connect = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || connectedRef.current) return;
    try {
      const Ctor: AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: AudioCtor })
          .webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
      connectedRef.current = true;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {
      /* unavailable or already connected */
    }
  }, [audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.addEventListener('play', connect, { once: true });
    return () => audio.removeEventListener('play', connect);
  }, [audioRef, connect]);

  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  const getFrequencyData = useCallback((): Uint8Array | null => {
    const analyser = analyserRef.current;
    if (!analyser) return null;
    if (ctxRef.current?.state === 'suspended')
      ctxRef.current.resume().catch(() => {});
    analyser.getByteFrequencyData(dataRef.current);
    return dataRef.current;
  }, []);

  const getBandEnergy = useCallback(
    (startBin: number, endBin: number): number => {
      if (!analyserRef.current) return 0;
      const data = dataRef.current;
      const count = endBin - startBin;
      if (count <= 0) return 0;
      let sum = 0;
      for (let i = startBin; i < endBin && i < data.length; i++)
        sum += data[i];
      return sum / count / 255;
    },
    []
  );

  return { getFrequencyData, getBandEnergy };
}

/* ------------------------------------------------------ useAudioPlayer */

interface State {
  currentIndex: number;
  order: number[];
  shuffled: boolean;
  loopMode: LoopMode;
  isPlaying: boolean;
  direction: Direction;
}
type Action =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SET_TRACK'; index: number; direction: Direction }
  | { type: 'TOGGLE_SHUFFLE'; trackCount: number }
  | { type: 'CYCLE_LOOP' };

function shuffleOrder(pinFirst: number, count: number): number[] {
  const rest = Array.from({ length: count }, (_, i) => i).filter(
    (x) => x !== pinFirst
  );
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [pinFirst, ...rest];
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'PLAY':
      return { ...state, isPlaying: true };
    case 'PAUSE':
      return { ...state, isPlaying: false };
    case 'SET_TRACK':
      return {
        ...state,
        currentIndex: action.index,
        direction: action.direction,
      };
    case 'TOGGLE_SHUFFLE': {
      const shuffled = !state.shuffled;
      const order = shuffled
        ? shuffleOrder(state.currentIndex, action.trackCount)
        : Array.from({ length: action.trackCount }, (_, i) => i);
      return { ...state, shuffled, order };
    }
    case 'CYCLE_LOOP': {
      const next: LoopMode =
        state.loopMode === 'off'
          ? 'all'
          : state.loopMode === 'all'
          ? 'one'
          : 'off';
      return { ...state, loopMode: next };
    }
    default:
      return state;
  }
}

function useAudioPlayer(tracks: Track[]) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [state, dispatch] = useReducer(reducer, {
    currentIndex: 0,
    order: Array.from({ length: tracks.length }, (_, i) => i),
    shuffled: false,
    loopMode: 'off',
    isPlaying: false,
    direction: null,
  });

  const { getFrequencyData, getBandEnergy } = useAudioAnalyser(audioRef);
  const playTransitionSound = useTransitionSound();

  const loadTrack = useCallback(
    (index: number, autoplay: boolean, direction: Direction) => {
      const audio = audioRef.current;
      if (!audio) return;
      const bassEnergy = getBandEnergy(0, 4);
      playTransitionSound(bassEnergy);
      dispatch({ type: 'SET_TRACK', index, direction });
      audio.src = tracks[index].src;
      audio.load();
      if (autoplay) audio.play().catch(() => {});
    },
    [tracks, playTransitionSound, getBandEnergy]
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, []);

  const next = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const pos = state.order.indexOf(state.currentIndex);
    const np = pos + 1;
    if (np >= state.order.length) {
      if (state.loopMode === 'all')
        loadTrack(state.order[0], !audio.paused, 'next');
      else {
        audio.pause();
        audio.currentTime = 0;
      }
      return;
    }
    loadTrack(state.order[np], !audio.paused, 'next');
  }, [state.order, state.currentIndex, state.loopMode, loadTrack]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const pos = state.order.indexOf(state.currentIndex);
    const pp = pos - 1;
    if (pp < 0) {
      if (state.loopMode === 'all')
        loadTrack(state.order[state.order.length - 1], !audio.paused, 'prev');
      else audio.currentTime = 0;
      return;
    }
    loadTrack(state.order[pp], !audio.paused, 'prev');
  }, [state.order, state.currentIndex, state.loopMode, loadTrack]);

  const seek = useCallback((pct: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = pct * audio.duration;
  }, []);

  const toggleShuffle = useCallback(() => {
    dispatch({ type: 'TOGGLE_SHUFFLE', trackCount: tracks.length });
  }, [tracks.length]);

  const cycleLoop = useCallback(() => {
    dispatch({ type: 'CYCLE_LOOP' });
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => dispatch({ type: 'PLAY' });
    const onPause = () => dispatch({ type: 'PAUSE' });
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setDuration(audio.duration);
    };
    const onEnded = () => {
      if (state.loopMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else next();
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [state.loopMode, next]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = tracks[0].src;
    audio.load();
  }, [tracks]);

  return {
    audioRef,
    state,
    currentTime,
    duration,
    currentTrack: tracks[state.currentIndex],
    toggle,
    next,
    prev,
    seek,
    toggleShuffle,
    cycleLoop,
    getFrequencyData,
  };
}

/* ------------------------------------------------ useKeyboardShortcuts */

interface ShortcutActions {
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seekForward: () => void;
  seekBackward: () => void;
  toggleShuffle: () => void;
  cycleLoop: () => void;
}
function useKeyboardShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          actions.toggle();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) actions.next();
          else actions.seekForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) actions.prev();
          else actions.seekBackward();
          break;
        case 's':
        case 'S':
          actions.toggleShuffle();
          break;
        case 'l':
        case 'L':
          actions.cycleLoop();
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [actions]);
}

/* --------------------------------------------------------- ScalesMixer */

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
function partBCircle(
  time: number,
  col: number,
  row: number
): [number, number] {
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

function ScalesMixer({
  isPlaying,
  getFrequencyData,
}: {
  isPlaying: boolean;
  getFrequencyData?: () => Uint8Array | null;
}) {
  const maskId = useId().replace(/:/g, '_');
  const colRefs = useRef<(SVGGElement | null)[]>([]);
  const circleRefs = useRef<(SVGCircleElement | null)[][]>(
    Array.from({ length: COLS }, () => [])
  );
  const tRef = useRef(50);

  useRafLoop((_, dt) => {
    if (isPlaying) tRef.current += dt / 1000;
    const time = tRef.current;
    const freqData = getFrequencyData?.();
    for (let c = 0; c < COLS; c++) {
      let energy = 1.0;
      if (freqData) {
        const [binStart, binEnd] = BAND_RANGES[c];
        let sum = 0;
        for (let b = binStart; b < binEnd; b++) sum += freqData[b] ?? 0;
        energy = Math.sqrt(sum / (binEnd - binStart) / 255);
      }
      const bobGain = freqData ? 0.4 + energy : 1;
      const scaleGain = freqData ? 0.5 + energy : 1;
      const colEl = colRefs.current[c];
      if (colEl) {
        const ay = partAColumnY(time, c) * bobGain;
        colEl.style.transform = `translate(${c * 10}px, ${ay}px)`;
      }
      for (let r = 0; r < ROWS; r++) {
        const circle = circleRefs.current[c][r];
        if (!circle) continue;
        const [ty, s] = partBCircle(time, c, r);
        circle.style.transform = `translateY(${ty}px) scale(${
          s * scaleGain
        })`;
      }
    }
  });

  return (
    <svg className={cn("h-4 fill-white/80", !isPlaying && "opacity-40", isPlaying && "animate-pulse")} viewBox="0 0 98 108" aria-hidden="true" style={{ width: '40px' }}>
      <mask id={maskId}>
        <rect width="10" height="10" fill="#fff" />
      </mask>
      {Array.from({ length: COLS }, (_, c) => (
        <g
          key={c}
          ref={(el) => {
            colRefs.current[c] = el;
          }}
          style={{ transform: `translate(${c * 10}px, 0px)` }}
        >
          {Array.from({ length: ROWS }, (_, r) => (
            <g
              key={r}
              mask={`url(#${maskId})`}
              transform={`translate(0 ${r * 10})`}
            >
              <circle
                ref={(el) => {
                  circleRefs.current[c][r] = el;
                }}
                cx="5"
                cy="5"
                r="5"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
              />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------- Disc + layers */

const SPIN_MAX = 0.4375;
const BURST_DURATION = 620;

interface Layer {
  id: number;
  track: Track;
  dir: Direction;
}

function Disc({
  layers,
  isPlaying,
  trackKey,
  direction,
}: {
  layers: Layer[];
  isPlaying: boolean;
  trackKey: number;
  direction: Direction;
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
    if (isPlaying) velRef.current += (SPIN_MAX - velRef.current) * 0.2;
    else {
      velRef.current *= 0.96;
      if (velRef.current < 0.001) velRef.current = 0;
    }
    
    rotRef.current += velRef.current;
    
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
    <div className="relative w-full h-full rounded-full transition-transform duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-disc">
      <div 
        className="absolute inset-0 rounded-full overflow-hidden shadow-[0_12px_24px_rgba(0,0,0,0.4)] transition-shadow duration-300 ring-1 ring-white/5"
        ref={spinRef}
      >
        {layers.map((l, i) => {
          const isNewest = i === layers.length - 1;
          const cls = cn(
            "absolute inset-0 w-full h-full object-cover rounded-full",
            isNewest ? (l.dir ? "cover-enter" : "") : "cover-exit"
          );
          return (
            <img
              key={l.id}
              src={l.track.cover}
              alt={`${l.track.title} — ${l.track.artist}`}
              className={cls}
              draggable={false}
            />
          );
        })}
        {/* Inner CD/Vinyl texture rings - INSIDE spinRef so it spins */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[84px] h-[84px] rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.6)] flex items-center justify-center overflow-hidden bg-[#181818] ring-4 ring-[#111]">
           {/* Texture lines to clearly show spinning */}
           <div className="absolute inset-0 rounded-full opacity-30 border-[3px] border-dashed border-[#aaa]"></div>
           <div className="absolute inset-2 rounded-full border-[1px] border-dotted border-[#aaa] opacity-50"></div>
           {/* Off-center dot to make rotation obvious */}
           <div className="absolute w-1.5 h-1.5 bg-[#ccc] rounded-full top-2.5 left-1/2 -translate-x-1/2"></div>
           <div className="absolute w-1 h-1 bg-[#ccc] rounded-full bottom-3 left-1/4"></div>

           {/* The physical hole */}
           <div className="relative w-8 h-8 rounded-full bg-[#121212] shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)] border border-[#333]">
              <div className="absolute inset-0 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,1)]"></div>
           </div>
        </div>
      </div>
      
      {/* Light sweep overlays on the disc (doesn't rotate) */}
      <div className="absolute inset-0 rounded-full pointer-events-none opacity-[0.05] mix-blend-screen" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.8) 100%)' }}></div>
    </div>
  );
}

/* ------------------------------------------------------------ TrackInfo */

function MarqueeTitle({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        // add a small buffer completely to avoid rounding miscalculations 
        setIsOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth + 2);
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [text]);

  return (
    <div 
      ref={containerRef} 
      className={cn(
        "w-full max-w-[280px] overflow-hidden leading-tight mt-1",
        isOverflowing && "fade-edges"
      )}
    >
      <div 
        className={cn(
          "flex whitespace-nowrap", 
          isOverflowing ? "w-max animate-marquee" : "w-full justify-center"
        )}
      >
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

function TrackInfo({ layers }: { layers: Layer[] }) {
  return (
    <div className="relative w-full h-[64px] flex justify-center items-center overflow-hidden px-8 mb-4">
      {layers.map((l, i) => {
        const isNewest = i === layers.length - 1;
        const dx = l.dir === 'next' ? 14 : l.dir === 'prev' ? -14 : 0;
        const exitDx = -dx;
        const state = isNewest ? (l.dir ? 'ti-enter' : '') : 'ti-exit';
        const style = {
          ['--dx' as string]: `${isNewest ? dx : exitDx}px`,
        } as React.CSSProperties;
        return (
          <div
            key={l.id}
            className={cn("absolute inset-0 flex flex-col items-center justify-center text-center", !isNewest && "pointer-events-none")}
          >
            <p className={cn("text-gray-400 text-[11px] font-medium tracking-[0.2em] uppercase", state)} style={style}>
              {l.track.artist}
            </p>
            <div className={cn("w-full flex justify-center", state)} style={style}>
              <MarqueeTitle 
                text={l.track.title}
                className="text-white text-[24px] font-semibold tracking-tight"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- ProgressBar */

function fmt(s: number): string {
  if (!isFinite(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(
    2,
    '0'
  )}`;
}
function ProgressBar({
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
          onSeek(
            Math.max(
              0,
              Math.min(1, (e.clientX - rect.left) / rect.width)
            )
          );
        }}
      >
        <div 
          className="absolute left-0 top-0 bottom-0 bg-accent transition-all duration-100 group-hover/bar:h-1 group-hover/bar:-top-[1px]" 
          style={{ width: `${pct}%` }} 
        />
      </div>
      <div className="w-full flex justify-center items-center gap-3 text-gray-400 text-[13px] font-mono tracking-widest">
        <span>{fmt(currentTime)}</span>
        <span className="text-gray-600">/</span>
        <span>{fmt(duration)}</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Controls */

function Controls({
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
      <button
        className={cn("transition-colors duration-200", shuffled ? "text-accent hover:text-red-400" : "text-gray-500 hover:text-white")}
        onClick={onShuffle}
        aria-label="Shuffle"
      >
        <Shuffle size={18} strokeWidth={2.5} />
      </button>
      <button className="text-gray-400 hover:text-white transition-colors duration-200" onClick={onPrev} aria-label="Previous">
        <SkipBack size={20} fill="currentColor" />
      </button>
      <button
        className="relative w-[64px] h-[64px] bg-accent text-white hover:bg-red-500 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] shadow-lg"
        onClick={onToggle}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause size={24} fill="currentColor" />
        ) : (
          <Play size={24} fill="currentColor" className="ml-1" />
        )}
      </button>
      <button className="text-gray-400 hover:text-white transition-colors duration-200" onClick={onNext} aria-label="Next">
        <SkipForward size={20} fill="currentColor" />
      </button>
      <button
        className={cn("transition-colors duration-200", loopMode !== 'off' ? "text-accent hover:text-red-400" : "text-gray-500 hover:text-white")}
        onClick={onLoop}
        aria-label="Loop"
      >
        {loopMode === 'one' ? (
           <Repeat1 size={18} strokeWidth={2.5} />
        ) : (
           <Repeat size={18} strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
}

/* ----------------------------------------------------- MusicPlayer root */

export interface MusicPlayerProps {
  tracks: Track[];
  crossOrigin?: 'anonymous' | 'use-credentials';
}

export function MusicPlayer({ tracks, crossOrigin }: MusicPlayerProps) {
  const player = useAudioPlayer(tracks);

  const [layers, setLayers] = useState<Layer[]>(() => [
    { id: 0, track: tracks[0], dir: null },
  ]);
  const lastIndex = useRef(0);
  const idRef = useRef(1);

  useEffect(() => {
    if (player.state.currentIndex === lastIndex.current) return;
    lastIndex.current = player.state.currentIndex;
    const id = idRef.current++;
    setLayers((prev) => [
      ...prev,
      { id, track: player.currentTrack, dir: player.state.direction },
    ]);
    const t = setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.id === id));
    }, 760);
    return () => clearTimeout(t);
  }, [
    player.state.currentIndex,
    player.currentTrack,
    player.state.direction,
  ]);

  const seekForward = useCallback(() => {
    const a = player.audioRef.current;
    if (a) a.currentTime = Math.min(a.duration || 0, a.currentTime + 5);
  }, [player.audioRef]);
  const seekBackward = useCallback(() => {
    const a = player.audioRef.current;
    if (a) a.currentTime = Math.max(0, a.currentTime - 5);
  }, [player.audioRef]);

  const shortcuts = useMemo(
    () => ({
      toggle: player.toggle,
      next: player.next,
      prev: player.prev,
      seekForward,
      seekBackward,
      toggleShuffle: player.toggleShuffle,
      cycleLoop: player.cycleLoop,
    }),
    [
      player.toggle,
      player.next,
      player.prev,
      seekForward,
      seekBackward,
      player.toggleShuffle,
      player.cycleLoop,
    ]
  );
  useKeyboardShortcuts(shortcuts);

  return (
    <div
      className={cn(
        "relative w-[400px] h-[515px] mx-auto bg-[#121212] rounded-[32px] flex flex-col shadow-2xl border border-white/5 overflow-hidden select-none transition-shadow hover:shadow-[0_24px_64px_rgba(0,0,0,0.8)]",
      )}
    >
      <audio
        ref={player.audioRef}
        preload="metadata"
        crossOrigin={crossOrigin}
      />
      
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] z-10 group disc-wrapper cursor-pointer">
        <div className="w-full h-full transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-[24px]">
          <Disc
            layers={layers}
            isPlaying={player.state.isPlaying}
            trackKey={player.state.currentIndex}
            direction={player.state.direction}
          />
        </div>
      </div>

      <div className="flex-1" />
      
      <div className="relative z-20 flex flex-col items-center w-full pb-8">
        <div className="h-6 flex items-center justify-center mb-2">
          <ScalesMixer
            isPlaying={player.state.isPlaying}
            getFrequencyData={player.getFrequencyData}
          />
        </div>

        <TrackInfo layers={layers} />
        
        <ProgressBar
          currentTime={player.currentTime}
          duration={player.duration}
          onSeek={player.seek}
        />
        
        <Controls
          isPlaying={player.state.isPlaying}
          shuffled={player.state.shuffled}
          loopMode={player.state.loopMode}
          onToggle={player.toggle}
          onNext={player.next}
          onPrev={player.prev}
          onShuffle={player.toggleShuffle}
          onLoop={player.cycleLoop}
        />
      </div>
    </div>
  );
}

export default MusicPlayer;
