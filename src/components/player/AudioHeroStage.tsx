import { useEffect, useMemo, useRef } from "react";
import { Music } from "lucide-react";
import {
  acquireAnalyserGraph,
  readSmoothedLoudness,
  releaseAnalyserGraph,
  type AnalyserGraph,
} from "../../audioAnalyserGraph";

const BAR_COUNT = 90;
const BAR_GAP = 3;
const BAR_W_MAX = 4;
const ATTACK = 0.4;
const RELEASE = 0.12;
const RETARGET_HZ = 18;
/** Max bar half-height as a fraction of canvas half-height */
const AMP_CAP = 0.5;
const ENERGY_SCALE = 0.62;
const TARGET_MAX = 0.88;

const RAMP_STOPS = ["#9E7644", "#C4AD86", "#D48E4C", "#B05A38"] as const;

type Props = {
  coverSrc: string | null;
  audioEl: HTMLAudioElement | null;
  connectKey: string;
  isPaused: boolean;
  isMuted: boolean;
};

type BarDef = {
  rest: number;
  excite: number;
  phase: number;
  freq: number;
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededUnit(seed: number, index: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function buildBarDefs(seedKey: string): BarDef[] {
  const seed = hashSeed(seedKey);
  return Array.from({ length: BAR_COUNT }, (_, i) => ({
    rest: 0.07 + seededUnit(seed, i) * 0.06,
    excite: 0.48 + seededUnit(seed, i + 50) * 0.32,
    freq: 0.7 + seededUnit(seed, i + 100) * 1.4,
    phase: seededUnit(seed, i + 150) * Math.PI * 2,
  }));
}

function rampColor(frac: number): string {
  const t = Math.max(0, Math.min(1, frac));
  const seg = t * (RAMP_STOPS.length - 1);
  const i = Math.min(RAMP_STOPS.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = RAMP_STOPS[i];
  const b = RAMP_STOPS[i + 1];
  const parse = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const c1 = parse(a);
  const c2 = parse(b);
  const r = Math.round(c1.r + (c2.r - c1.r) * f);
  const g = Math.round(c1.g + (c2.g - c1.g) * f);
  const bch = Math.round(c1.b + (c2.b - c1.b) * f);
  return `rgb(${r},${g},${bch})`;
}

/**
 * Audio-only hero: full-canvas symmetrical dancing equalizer (Whispers-style).
 * All bars always visible; loudness + per-bar random targets, not frequency bins.
 */
export function AudioHeroStage({
  coverSrc,
  audioEl,
  connectKey,
  isPaused,
  isMuted,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<AnalyserGraph | null>(null);
  const heightsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0.12));
  const targetsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0.12));
  const retargetTickRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const barDefs = useMemo(() => buildBarDefs(connectKey), [connectKey]);

  useEffect(() => {
    const defs = barDefs;
    const heights = heightsRef.current;
    const targets = targetsRef.current;
    for (let i = 0; i < BAR_COUNT; i++) {
      heights[i] = defs[i].rest;
      targets[i] = defs[i].rest;
    }
    retargetTickRef.current = 0;
  }, [connectKey, barDefs]);

  useEffect(() => {
    if (!audioEl) {
      graphRef.current = null;
      return undefined;
    }

    const attach = () => {
      const graph = acquireAnalyserGraph(audioEl);
      graphRef.current = graph;
      if (graph) void graph.ctx.resume();
    };

    const onPlaying = () => {
      if (!graphRef.current) attach();
      else void graphRef.current.ctx.resume();
    };

    audioEl.addEventListener("play", onPlaying);
    audioEl.addEventListener("playing", onPlaying);
    if (!audioEl.paused) onPlaying();

    return () => {
      audioEl.removeEventListener("play", onPlaying);
      audioEl.removeEventListener("playing", onPlaying);
      releaseAnalyserGraph(audioEl, false);
      graphRef.current = null;
    };
  }, [audioEl, connectKey]);

  useEffect(() => {
    return () => {
      if (audioEl) releaseAnalyserGraph(audioEl, true);
    };
  }, [connectKey, audioEl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const heights = heightsRef.current;
    const targets = targetsRef.current;
    const defs = barDefs;
    let alive = true;
    let sizeW = 0;
    let sizeH = 0;

    const draw = () => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(draw);
      const graph = graphRef.current;
      if (graph?.ctx.state === "suspended") void graph.ctx.resume();

      const mediaPaused = audioEl?.paused ?? true;
      const idle = mediaPaused || isPaused;
      const volGain = audioEl && !isMuted ? audioEl.volume : 0;
      const gain = (isMuted ? 0.35 : 1) * (0.8 + volGain * 0.35);

      const t = performance.now() / 1000;
      const retargetSlot = Math.floor(t * RETARGET_HZ);

      if (retargetSlot !== retargetTickRef.current) {
        retargetTickRef.current = retargetSlot;
        const energy = graph && !idle ? readSmoothedLoudness(graph, gain) : 0;

        for (let i = 0; i < BAR_COUNT; i++) {
          const d = defs[i];
          if (idle) {
            targets[i] =
              d.rest + 0.04 * Math.sin(t * d.freq + d.phase);
          } else {
            const jitter = Math.random() * 0.5 + 0.5;
            targets[i] = Math.min(
              TARGET_MAX,
              d.rest + energy * ENERGY_SCALE * d.excite * jitter,
            );
          }
        }
      }

      for (let i = 0; i < BAR_COUNT; i++) {
        const tgt = Math.max(defs[i].rest * 0.85, targets[i]);
        const cur = heights[i];
        const rate = tgt > cur ? ATTACK : RELEASE;
        heights[i] = cur + (tgt - cur) * rate;
      }

      const parent = canvas.parentElement;
      const cw = parent?.clientWidth ?? canvas.clientWidth;
      const ch = parent?.clientHeight ?? canvas.clientHeight;
      if (cw !== sizeW || ch !== sizeH) {
        sizeW = cw;
        sizeH = ch;
      }
      paintWaveform(canvas, sizeW, sizeH, heights, defs);
    };

    draw();
    return () => {
      alive = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [audioEl, isPaused, isMuted, connectKey, barDefs]);

  const artSize = "min(42vmin, 480px, calc(100vw - 120px))";

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {coverSrc ? (
        <>
          <img
            src={coverSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-[64px] opacity-62 saturate-[1.08]"
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/55"
            aria-hidden
          />
        </>
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-stone-950 via-[#0c0a09] to-black"
          aria-hidden
        />
      )}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        aria-hidden
      />

      <div className="absolute inset-0 flex items-center justify-center px-4 z-10">
        <div
          data-audio-hero-art
          className="shrink-0 rounded-2xl overflow-hidden shadow-2xl border border-white/15 ring-1 ring-white/10 bg-black/40"
          style={{ width: artSize, height: artSize }}
        >
          {coverSrc ? (
            <img src={coverSrc} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="flex w-full h-full items-center justify-center bg-white/5">
              <Music
                className="w-24 h-24 text-[color:var(--accent)] opacity-35"
                strokeWidth={1}
                aria-hidden
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function paintWaveform(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  heights: number[],
  defs: BarDef[],
): void {
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.max(1, cssWidth);
  const ch = Math.max(1, cssHeight);
  const w = Math.floor(cw * dpr);
  const h = Math.floor(ch * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const cy = ch / 2;
  const maxHalf = (cy - 12) * AMP_CAP;
  const totalGap = (BAR_COUNT - 1) * BAR_GAP;
  const barW = Math.min(
    BAR_W_MAX,
    Math.max(2, (cw - totalGap) / BAR_COUNT),
  );
  const startX = (cw - (BAR_COUNT * barW + totalGap)) / 2;
  const centerIdx = (BAR_COUNT - 1) / 2;
  const centerFadeRadius = BAR_COUNT * 0.28;

  const SEG_H = 3;
  const SEG_GAP = 1;

  for (let i = 0; i < BAR_COUNT; i++) {
    const level = Math.max(
      defs[i].rest * 0.9,
      Math.min(TARGET_MAX, heights[i]),
    );
    const halfH = level * maxHalf;
    const bx = startX + i * (barW + BAR_GAP);
    const frac =
      (level - defs[i].rest) / Math.max(0.01, TARGET_MAX - defs[i].rest);

    const distCenter = Math.abs(i - centerIdx) / centerFadeRadius;
    const centerDim =
      distCenter < 1 ? 0.78 + distCenter * 0.22 : 1;
    ctx.globalAlpha = (0.36 + frac * 0.34) * centerDim;

    const maxSegs = Math.ceil(maxHalf / (SEG_H + SEG_GAP));
    const numSegs = Math.round(halfH / (SEG_H + SEG_GAP));

    for (let j = 0; j < numSegs; j++) {
      const segFrac = j / Math.max(1, maxSegs - 1);
      ctx.fillStyle = rampColor(segFrac);

      const offset = SEG_GAP / 2 + j * (SEG_H + SEG_GAP);

      // Top segment
      ctx.fillRect(bx, cy - offset - SEG_H, barW, SEG_H);

      // Bottom segment
      ctx.fillRect(bx, cy + offset, barW, SEG_H);
    }
  }

  ctx.globalAlpha = 1;
}
