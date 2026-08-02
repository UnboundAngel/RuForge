import { useEffect, useRef, useState } from "react";

import { ISLAND_WAVEFORM_BAR_COUNT } from "@/lib/islandWaveformLevels";

const IDLE = 0.18;
const STIFFNESS = 380;
const DAMPING = 20;
const DT = 1 / 60;

/**
 * Overlay webview owns a visible rAF loop. Springs toward remote analyser
 * levels from main; if those freeze while playing (minimized rAF throttle),
 * synthesizes independent bar motion so the pill stays alive.
 */
export function useOverlayWaveformLevels(
  paused: boolean,
  remoteLevels: readonly number[],
): readonly number[] {
  const [levels, setLevels] = useState<readonly number[]>(() =>
    Array.from({ length: ISLAND_WAVEFORM_BAR_COUNT }, (_, i) => remoteLevels[i] ?? IDLE),
  );
  const remoteRef = useRef(remoteLevels);
  remoteRef.current = remoteLevels;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const local = Array.from({ length: ISLAND_WAVEFORM_BAR_COUNT }, (_, i) => remoteLevels[i] ?? IDLE);
    const vel = Array.from({ length: ISLAND_WAVEFORM_BAR_COUNT }, () => 0);
    let raf = 0;

    const frame = (now: number) => {
      const rem = remoteRef.current;
      const isPaused = pausedRef.current;
      let remoteEnergy = 0;
      for (let i = 0; i < ISLAND_WAVEFORM_BAR_COUNT; i++) {
        remoteEnergy += Math.abs((rem[i] ?? IDLE) - IDLE);
      }
      const remoteFlat = remoteEnergy < 0.08;

      let changed = false;
      for (let i = 0; i < ISLAND_WAVEFORM_BAR_COUNT; i++) {
        let target = IDLE;
        if (!isPaused) {
          if (remoteFlat) {
            const phase = now / 220 + i * 1.35;
            const beat = now / 520;
            target =
              0.22 +
              0.5 * (0.5 + 0.5 * Math.sin(phase)) +
              0.28 * (0.5 + 0.5 * Math.sin(beat + i * 0.9));
            target = Math.min(1, Math.max(IDLE, target));
          } else {
            target = rem[i] ?? IDLE;
          }
        }

        const accel = STIFFNESS * (target - local[i]) - DAMPING * vel[i];
        vel[i] += accel * DT;
        const next = local[i] + vel[i] * DT;
        if (Math.abs(next - local[i]) > 0.0008) changed = true;
        local[i] = next;
      }

      if (changed) setLevels([...local]);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return levels;
}
