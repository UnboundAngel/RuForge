import { create } from "zustand";

export type MusicToast = { id: number; message: string; tone: "info" | "warning" | "error" };

type MusicToastState = { toasts: MusicToast[] };

export const useMusicToasts = create<MusicToastState>(() => ({ toasts: [] }));

let nextId = 1;
const TOAST_MS = 4200;

/**
 * App toasts are hidden in music mode, so music actions that must report back
 * (m3u8 import and export) use this Spotify-style pill instead.
 */
export function showMusicToast(message: string, tone: MusicToast["tone"] = "info"): void {
  const id = nextId++;
  useMusicToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }));
  window.setTimeout(() => {
    useMusicToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, TOAST_MS);
}
