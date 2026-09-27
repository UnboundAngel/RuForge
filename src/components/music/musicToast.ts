import { create } from "zustand";

export type MusicToastAction = { label: string; run: () => void };

export type MusicToast = {
  id: number;
  message: string;
  tone: "info" | "warning" | "error";
  action?: MusicToastAction;
};

type MusicToastState = { toasts: MusicToast[] };

export const useMusicToasts = create<MusicToastState>(() => ({ toasts: [] }));

let nextId = 1;
const TOAST_MS = 4200;
/** Long enough to reach Undo without the pill vanishing under the cursor. */
const ACTION_TOAST_MS = 6000;

export function dismissMusicToast(id: number): void {
  useMusicToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/**
 * App toasts are hidden in music mode, so music actions that must report back
 * (m3u8 import and export) use this Spotify-style pill instead.
 */
export function showMusicToast(
  message: string,
  tone: MusicToast["tone"] = "info",
  action?: MusicToastAction,
): void {
  const id = nextId++;
  useMusicToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone, action }] }));
  window.setTimeout(() => dismissMusicToast(id), action ? ACTION_TOAST_MS : TOAST_MS);
}
