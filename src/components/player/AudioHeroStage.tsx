import { useEffect, useRef } from "react";
import { Music } from "lucide-react";
import {
  acquireAnalyserGraph,
  readSmoothedLoudness,
  releaseAnalyserGraph,
  type AnalyserGraph,
} from "../../audioAnalyserGraph";

/** Seconds per full revolution. */
const SPIN_DURATION = 3;

type Props = {
  coverSrc: string | null;
  audioEl: HTMLAudioElement | null;
  connectKey: string;
  isPaused: boolean;
  isMuted: boolean;
  /** background = blurred cover only; foreground = vinyl + art; full = both (default). */
  layer?: "full" | "background" | "foreground";
  onTogglePlay?: () => void;
};

function VinylDisc({ coverSrc }: { coverSrc: string | null }) {
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
          <clipPath id="rf-vinyl-label">
            <circle cx="200" cy="200" r="50" />
          </clipPath>
        )}
        <radialGradient id="rf-vinyl-sheen" cx="30%" cy="30%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      {/* Disc body */}
      <circle cx="200" cy="200" r="198" fill="#0d0d0d" />
      <circle cx="200" cy="200" r="196" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

      {grooves}

      {/* Sheen */}
      <circle cx="200" cy="200" r="195" fill="url(#rf-vinyl-sheen)" />

      {/* Label ring */}
      <circle cx="200" cy="200" r="54" fill="#1a1510" />
      <circle cx="200" cy="200" r="53" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />

      {coverSrc ? (
        <image
          href={coverSrc}
          x="150"
          y="150"
          width="100"
          height="100"
          clipPath="url(#rf-vinyl-label)"
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <circle cx="200" cy="200" r="50" fill="#221a12" />
      )}

      {/* Spindle hole */}
      <circle cx="200" cy="200" r="7" fill="#000" />
      <circle cx="200" cy="200" r="8.5" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
    </svg>
  );
}

/**
 * Audio-only hero: vinyl record + centered album art.
 * The vinyl spins during playback (JS-driven RAF), freezes at current
 * angle on pause, and slides partially behind the album art when paused.
 * Audio analyser drives a subtle radial glow around the disc.
 */
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

export function AudioHeroStage({
  coverSrc,
  audioEl,
  connectKey,
  isPaused,
  isMuted,
  layer = "full",
  onTogglePlay,
}: Props) {
  const showBackground = layer === "full" || layer === "background";
  const showForeground = layer === "full" || layer === "foreground";
  const vinylRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<AnalyserGraph | null>(null);
  const rafRef = useRef<number | null>(null);
  const rotationRef = useRef(0);

  useEffect(() => {
    rotationRef.current = 0;
    if (vinylRef.current) vinylRef.current.style.transform = "rotate(0deg)";
  }, [connectKey]);

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
      releaseAnalyserGraph(audioEl, false);
      graphRef.current = null;
    };
  }, [audioEl, connectKey, showForeground]);

  useEffect(() => {
    return () => {
      if (showForeground && audioEl) releaseAnalyserGraph(audioEl, true);
    };
  }, [connectKey, audioEl, showForeground]);

  useEffect(() => {
    if (!showForeground) return;
    let alive = true;
    let lastTime = performance.now();

    const tick = (now: number) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(tick);

      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (!isPaused && vinylRef.current) {
        rotationRef.current =
          (rotationRef.current + dt * (360 / SPIN_DURATION)) % 360;
        vinylRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
      }

      const glow = glowRef.current;
      if (!glow || !audioEl) return;

      const graph = graphRef.current;
      const mediaPaused = audioEl.paused;

      if (!graph || mediaPaused || isPaused) {
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
  }, [audioEl, isPaused, isMuted, showForeground]);

  const artSize = "min(38vmin, 420px, calc(100vw - 160px))";

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {showBackground && <HeroBackground coverSrc={coverSrc} />}

      {showForeground && (
      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
        <div className="relative" style={{ width: artSize, height: artSize }}>
          <div
            className="absolute z-0 transition-all duration-700 ease-out pointer-events-none"
            style={{
              width: "100%",
              height: "100%",
              top: "50%",
              left: "-48%",
              transform: `translateY(-50%) translateX(${isPaused ? "30%" : "0"})`,
              opacity: isPaused ? 0.5 : 1,
            }}
            aria-hidden
          >
            <div
              ref={glowRef}
              className="absolute inset-[-12%] rounded-full pointer-events-none"
              data-energy="0"
              style={{ transition: "opacity 0.3s" }}
            />
            <div ref={vinylRef} className="h-full w-full rounded-full overflow-hidden">
              <VinylDisc coverSrc={coverSrc} />
            </div>
          </div>

          {onTogglePlay ? (
            <button
              type="button"
              onClick={onTogglePlay}
              data-audio-hero-art
              className="relative z-10 block h-full w-full cursor-pointer rounded-2xl overflow-hidden border border-white/15 bg-black p-0 text-left shadow-2xl ring-1 ring-white/10 pointer-events-auto"
              aria-label={isPaused ? "Play" : "Pause"}
            >
              {coverSrc ? (
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
              )}
            </button>
          ) : (
            <div
              data-audio-hero-art
              className="relative z-10 h-full w-full overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl ring-1 ring-white/10"
            >
              {coverSrc ? (
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
              )}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
