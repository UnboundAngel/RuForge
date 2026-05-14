import { invoke } from "@tauri-apps/api/core";
import { normalizeYoutubeRollingVttIfNeeded } from "./youtubeRollingVttNormalize";

export type SubtitleTrack = {
  label: string;
  lang: string;
  src: string;
};

export async function fetchSubtitleTracks(videoPath: string): Promise<SubtitleTrack[]> {
  return invoke<SubtitleTrack[]>("get_subtitle_tracks", { videoPath });
}

/**
 * `<track src>` is same-origin–sensitive: `convertFileSrc` → `http://asset.localhost/...` fails
 * when the UI runs on `http://localhost:1420` (dev) or a different bundled origin. Read bytes
 * in Rust and expose as `blob:` URLs so tracks load like the document.
 */
export async function subtitleTracksWithBlobSrc(tracks: SubtitleTrack[]): Promise<SubtitleTrack[]> {
  const out: SubtitleTrack[] = [];
  try {
    for (const t of tracks) {
      const text = normalizeYoutubeRollingVttIfNeeded(await invoke<string>("read_local_subtitle_vtt", { path: t.src }));
      const blob = new Blob([text], { type: "text/vtt;charset=utf-8" });
      out.push({ ...t, src: URL.createObjectURL(blob) });
    }
    return out;
  } catch (e) {
    revokeSubtitleBlobSrcs(out);
    throw e;
  }
}

export function revokeSubtitleBlobSrcs(tracks: SubtitleTrack[]): void {
  for (const t of tracks) {
    if (t.src.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(t.src);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Read persisted subtitle language tag from `ruforge-settings` (same store as other prefs). */
export function readSubtitlePreferredLang(): string | null {
  try {
    const raw = localStorage.getItem("ruforge-settings");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { subtitlePreferredLang?: unknown };
    const v = parsed.subtitlePreferredLang;
    if (typeof v === "string" && v.length > 0) return v;
    return null;
  } catch {
    return null;
  }
}

/** Merge into `ruforge-settings` so Mini Player stays in sync without App state. */
export function writeSubtitlePreferredLang(lang: string): void {
  try {
    const raw = localStorage.getItem("ruforge-settings");
    const parsed = raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const next = { ...parsed, subtitlePreferredLang: lang };
    localStorage.setItem("ruforge-settings", JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Keeps every `<track>` in `hidden` so Chromium never paints native captions; cues still parse for the TextTrack API. */
export function syncVideoTextTrackModes(
  video: HTMLVideoElement,
  _enabled: boolean,
  _selectedLang: string,
): void {
  for (let i = 0; i < video.textTracks.length; i++) {
    video.textTracks[i].mode = "hidden";
  }
}
