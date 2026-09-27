import { createContext, useContext, type Context } from "react";

import type { useMusicPlayback } from "@/components/music/useMusicPlayback";

/**
 * Everything but the playhead. The time lives in its own context so the ~4Hz ticks only
 * re-render the few components that draw it, not every play button in Music mode.
 */
export type MainAudioPlaybackValue = Omit<ReturnType<typeof useMusicPlayback>, "currentTime">;

const CONTEXT_KEY = Symbol.for("ruforge.MainAudioPlaybackContext");
const TIME_CONTEXT_KEY = Symbol.for("ruforge.MainAudioTimeContext");

/** Singleton context survives Vite Fast Refresh without splitting provider/consumer modules. */
function getSingletonContext<T>(key: symbol): Context<T | null> {
  const g = globalThis as typeof globalThis & {
    [key: symbol]: Context<T | null>;
  };
  if (!g[key]) {
    g[key] = createContext<T | null>(null);
  }
  return g[key];
}

export const MainAudioPlaybackContext = getSingletonContext<MainAudioPlaybackValue>(CONTEXT_KEY);
export const MainAudioTimeContext = getSingletonContext<number>(TIME_CONTEXT_KEY);

export function useMainAudioPlayback(): MainAudioPlaybackValue {
  const ctx = useContext(MainAudioPlaybackContext);
  if (!ctx) {
    throw new Error("useMainAudioPlayback must be used within MainPlaybackHost");
  }
  return ctx;
}

export function useOptionalMainAudioPlayback(): MainAudioPlaybackValue | null {
  return useContext(MainAudioPlaybackContext);
}

/** Playhead of the main player in seconds; re-renders on every time tick. */
export function useMainAudioCurrentTime(): number {
  const t = useContext(MainAudioTimeContext);
  if (t == null) {
    throw new Error("useMainAudioCurrentTime must be used within MainPlaybackHost");
  }
  return t;
}

export function useOptionalMainAudioCurrentTime(): number | null {
  return useContext(MainAudioTimeContext);
}
