import { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import { Music } from "lucide-react";
import {
  acquireAnalyserGraph,
  readSmoothedLoudness,
  reconnectAnalyserPlaybackRoute,
  releaseAnalyserGraph,
  type AnalyserGraph,
} from "../../audioAnalyserGraph";
import type { IslandSkipDir } from "@/components/island/islandSkipMotion";

/** Seconds per full revolution. */
const SPIN_DURATION = 3;

/** Ease into the jacket (no overshoot). */
const SLEEVE_IN_EASE = [0.4, 0, 0.2, 1] as const;
/** Ease out of the jacket (decelerate to rest, no bounce). */
const SLEEVE_OUT_EASE = [0.33, 1, 0.68, 1] as const;
const SLEEVE_IN_SEC = 0.42;
const SLEEVE_OUT_SEC = 0.48;
/** Fully under the cover (pause tuck is ~30%). */
const SLEEVE_TUCK_X = "58%";
const PAUSE_TUCK_X = "30%";

type Props = {
  coverSrc: string | null;
  audioEl: HTMLAudioElement | null;
  connectKey: string;
  isPaused: boolean;
  isMuted: boolean;
  /** 1 = next / forward, -1 = previous. Mirrors the sleeve pocket for reverse. */
  skipDir?: IslandSkipDir;
  /** background = blurred cover only; foreground = vinyl + art; full = both (default). */
  layer?: "full" | "background" | "foreground";
  onTogglePlay?: () => void;
};

function VinylDisc({ coverSrc }: { coverSrc: string | null }) {
  const uid = useId().replace(/:/g, "");
  const labelClipId = `rf-vinyl-label-${uid}`;
  const sheenId = `rf-vinyl-sheen-${uid}`;

  const grooves: React.ReactElement[] = [];
  for (let i = 0; i < 28; i++) {
    const r = 76 + i * 4.2;
    if (r >= 194) break;
    grooves.push(
      <circle
        key={i}
        cx="200"
        cy="200"
        r={r}
        fill="none"
        stroke={i % 3 === 0 ? "rgba(55,55,55,0.35)" : "rgba(30,30,30,0.25)"}
        strokeWidth="0.5"
      />,
    );
  }

  return (
    <svg
      viewBox="0 0 400 400"
      className="h-full w-full"
      aria-hidden
    >
      <defs>
        {coverSrc && (
          <clipPath id={labelClipId}>
            <circle cx="200" cy="200" r="50" />
          </clipPath>
        )}
        <radialGradient id={sheenId} cx="30%" cy="30%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <circle cx="200" cy="200" r="198" fill="#0d0d0d" />
      <circle cx="200" cy="200" r="196" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

      {grooves}

      <circle cx="200" cy="200" r="195" fill={`url(#${sheenId})`} />

      <circle cx="200" cy="200" r="54" fill="#1a1510" />
      <circle cx="200" cy="200" r="53" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />

      {coverSrc ? (
        <image
          href={coverSrc}
          x="150"
          y="150"
          width="100"
          height="100"
          clipPath={`url(#${labelClipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <circle cx="200" cy="200" r="50" fill="#221a12" />
      )}

      <circle cx="200" cy="200" r="7" fill="#000" />
      <circle cx="200" cy="200" r="8.5" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
    </svg>
  );
}

function HeroBackground({ coverSrc }: { coverSrc: string | null }) {
  if (coverSrc) {
    return (
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
    );
  }
  return (
    <div
      className="absolute inset-0 bg-gradient-to-br from-stone-950 via-[#0c0a09] to-black"
      aria-hidden
    />
  );
}

function CoverFace({
  coverSrc,
  isPaused,
  onTogglePlay,
}: {
  coverSrc: string | null;
  isPaused: boolean;
  onTogglePlay?: () => void;
}) {
  const inner = coverSrc ? (
    <img
      src={coverSrc}
      alt=""
      className="block h-full w-full object-cover"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-white/5">
      <Music
        className="w-24 h-24 text-[color:var(--accent)] opacity-35"
        strokeWidth={1}
        aria-hidden
      />
    </div>
  );

  if (onTogglePlay) {
    return (
      <button
        type="button"
        onClick={onTogglePlay}
        data-audio-hero-art
        className="relative z-10 block h-full w-full cursor-pointer rounded-2xl overflow-hidden border border-white/15 bg-black p-0 text-left shadow-2xl ring-1 ring-white/10 pointer-events-auto"
        aria-label={isPaused ? "Play" : "Pause"}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      data-audio-hero-art
      className="relative z-10 h-full w-full overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl ring-1 ring-white/10"
    >
      {inner}
    </div>
  );
}

/**
 * Persistent foreground: on track change the disc slides into the jacket,
 * the cover (and label) swap, then the disc slides back out.
 * Tweened (no spring) so the pocket does not bounce.
 */
function HeroForeground({
  coverSrc,
  connectKey,
  audioEl,
  isPaused,
  isMuted,
  reduceMotion,
  graphRef,
  onTogglePlay,
}: {
  coverSrc: string | null;
  connectKey: string;
  audioEl: HTMLAudioElement | null;
  isPaused: boolean;
  isMuted: boolean;
  reduceMotion: boolean;
  graphRef: React.RefObject<AnalyserGraph | null>;
  onTogglePlay?: () => void;
}) {
  const vinylRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const rotationRef = useRef(0);
  const prevKeyRef = useRef(connectKey);
  const sleeveBusyRef = useRef(false);
  const discControls = useAnimationControls();
  const [visualCover, setVisualCover] = useState(coverSrc);
  const [visualKey, setVisualKey] = useState(connectKey);
  const [sleeved, setSleeved] = useState(false);
  const artSize = "min(38vmin, 420px, calc(100vw - 160px))";

  const restX = isPaused ? PAUSE_TUCK_X : "0%";
  const restOpacity = isPaused ? 0.5 : 1;
  const restXRef = useRef(restX);
  const restOpacityRef = useRef(restOpacity);
  restXRef.current = restX;
  restOpacityRef.current = restOpacity;

  // Idle pause / play tuck when not mid-sleeve.
  useEffect(() => {
    if (sleeveBusyRef.current || reduceMotion) return;
    void discControls.start({
      x: restX,
      opacity: restOpacity,
      transition: { type: "tween", duration: 0.7, ease: SLEEVE_IN_EASE },
    });
  }, [restX, restOpacity, discControls, reduceMotion]);

  useEffect(() => {
    if (connectKey === prevKeyRef.current) {
      setVisualCover(coverSrc);
      return;
    }
    prevKeyRef.current = connectKey;

    if (reduceMotion) {
      setVisualCover(coverSrc);
      setVisualKey(connectKey);
      setSleeved(false);
      sleeveBusyRef.current = false;
      rotationRef.current = 0;
      if (vinylRef.current) vinylRef.current.style.transform = "rotate(0deg)";
      void discControls.set({
        x: restXRef.current,
        opacity: restOpacityRef.current,
      });
      return;
    }

    let cancelled = false;
    sleeveBusyRef.current = true;
    setSleeved(true);

    void (async () => {
      await discControls.start({
        x: SLEEVE_TUCK_X,
        opacity: 0.35,
        transition: { type: "tween", duration: SLEEVE_IN_SEC, ease: SLEEVE_IN_EASE },
      });
      if (cancelled) return;

      setVisualCover(coverSrc);
      setVisualKey(connectKey);
      rotationRef.current = 0;
      if (vinylRef.current) vinylRef.current.style.transform = "rotate(0deg)";

      await discControls.start({
        x: restXRef.current,
        opacity: restOpacityRef.current,
        transition: { type: "tween", duration: SLEEVE_OUT_SEC, ease: SLEEVE_OUT_EASE },
      });
      if (cancelled) return;

      sleeveBusyRef.current = false;
      setSleeved(false);
    })();

    return () => {
      cancelled = true;
      sleeveBusyRef.current = false;
      discControls.stop();
    };
  }, [connectKey, coverSrc, reduceMotion, discControls]);

  useEffect(() => {
    let alive = true;
    let lastTime = performance.now();

    const tick = (now: number) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(tick);

      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const vinyl = vinylRef.current;
      if (!isPaused && vinyl) {
        rotationRef.current =
          (rotationRef.current + dt * (360 / SPIN_DURATION)) % 360;
        vinyl.style.transform = `rotate(${rotationRef.current}deg)`;
      }

      const glow = glowRef.current;
      if (!glow || !audioEl) return;

      const graph = graphRef.current;
      const mediaPaused = audioEl.paused;

      if (!graph || mediaPaused || isPaused || sleeved) {
        const cur = parseFloat(glow.dataset.energy || "0");
        const next = cur * 0.92;
        glow.dataset.energy = String(next);
        glow.style.background = `radial-gradient(circle, rgba(158,118,68,${next * 0.3}) 0%, transparent 65%)`;
        glow.style.opacity = next > 0.03 ? "1" : "0";
        return;
      }

      const volGain = !isMuted ? audioEl.volume : 0;
      const gain = (isMuted ? 0.35 : 1) * (0.8 + volGain * 0.35);
      const energy = readSmoothedLoudness(graph, gain);
      glow.dataset.energy = String(energy);
      glow.style.background = `radial-gradient(circle, rgba(158,118,68,${energy * 0.3}) 0%, transparent 65%)`;
      glow.style.opacity = energy > 0.03 ? "1" : "0";
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [audioEl, isPaused, isMuted, graphRef, sleeved]);

  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
      {/*
        Clip to the cover box on the right/top/bottom so a tucked disc cannot
        poke out past the jacket. Negative left inset keeps the resting peek visible.
      */}
      <div
        className="relative"
        style={{
          width: artSize,
          height: artSize,
          clipPath: "inset(0 0 0 -62%)",
        }}
      >
        <div
          className="absolute z-0 pointer-events-none"
          style={{
            width: "100%",
            height: "100%",
            top: "50%",
            left: "-48%",
            transform: "translateY(-50%)",
          }}
          aria-hidden
        >
          <motion.div
            className="h-full w-full"
            initial={false}
            animate={discControls}
          >
            <div
              ref={glowRef}
              className="absolute inset-[-12%] rounded-full pointer-events-none"
              data-energy="0"
              style={{ transition: "opacity 0.3s" }}
            />
            <div ref={vinylRef} className="h-full w-full rounded-full overflow-hidden">
              <VinylDisc coverSrc={visualCover} />
            </div>
          </motion.div>
        </div>

        <div className="relative z-10 h-full w-full">
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              key={visualKey || "empty-cover"}
              className="absolute inset-0"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            >
              <CoverFace
                coverSrc={visualCover}
                isPaused={isPaused}
                onTogglePlay={onTogglePlay}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/**
 * Audio-only hero: vinyl record + centered album art.
 * The vinyl spins during playback (JS-driven RAF), freezes at current
 * angle on pause, and slides partially behind the album art when paused.
 * Track changes pocket the disc into the cover, swap art, then slide it out
 * (mirrored for previous).
 */
export function AudioHeroStage({
  coverSrc,
  audioEl,
  connectKey,
  isPaused,
  isMuted,
  skipDir: _skipDir = 1,
  layer = "full",
  onTogglePlay,
}: Props) {
  const showBackground = layer === "full" || layer === "background";
  const showForeground = layer === "full" || layer === "foreground";
  const reduceMotion = useReducedMotion();
  const graphRef = useRef<AnalyserGraph | null>(null);

  useEffect(() => {
    if (!showForeground || !audioEl) {
      graphRef.current = null;
      return;
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
      reconnectAnalyserPlaybackRoute(audioEl);
      graphRef.current = null;
    };
  }, [audioEl, connectKey, showForeground]);

  useEffect(() => {
    return () => {
      if (showForeground && audioEl) releaseAnalyserGraph(audioEl, true);
    };
  }, [connectKey, audioEl, showForeground]);

  const fadeOnly = Boolean(reduceMotion);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {showBackground && (
        <div className="absolute inset-0">
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              key={connectKey || "empty-bg"}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: fadeOnly ? 0.15 : 0.45, ease: "easeOut" }}
            >
              <HeroBackground coverSrc={coverSrc} />
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {showForeground && (
        <HeroForeground
          coverSrc={coverSrc}
          connectKey={connectKey}
          audioEl={audioEl}
          isPaused={isPaused}
          isMuted={isMuted}
          reduceMotion={fadeOnly}
          graphRef={graphRef}
          onTogglePlay={onTogglePlay}
        />
      )}
    </div>
  );
}
