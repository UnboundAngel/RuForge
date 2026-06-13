import { createContext, useContext, type Context } from "react";

import type { useMusicPlayback } from "@/components/music/useMusicPlayback";

export type MainAudioPlaybackValue = ReturnType<typeof useMusicPlayback> & {
  audioEl: HTMLAudioElement | null;
};

const CONTEXT_KEY = Symbol.for("ruforge.MainAudioPlaybackContext");

/** Singleton context survives Vite Fast Refresh without splitting provider/consumer modules. */
function getMainAudioPlaybackContext(): Context<MainAudioPlaybackValue | null> {
  const g = globalThis as typeof globalThis & {
    [key: symbol]: Context<MainAudioPlaybackValue | null>;
  };
  if (!g[CONTEXT_KEY]) {
    g[CONTEXT_KEY] = createContext<MainAudioPlaybackValue | null>(null);
  }
  return g[CONTEXT_KEY];
}

export const MainAudioPlaybackContext = getMainAudioPlaybackContext();

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
