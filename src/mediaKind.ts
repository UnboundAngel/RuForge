/**
 * Detect formats handled as music-first in RuForge (`scan_gallery` uses same list in Rust).
 */

/**
 * #### Phase 2 (WebView/Chromium playback) — **[done]**
 * - Codec/bitrate string from yt-dlp `.info.json` is still attached on `MediaFile.download_metadata_hint` for potential future use; **player UI no longer shows it** (or ffprobe summaries).
 * - Windows: Settings → Sound deep link (`open_windows_sound_settings`); WASAPI/output stays OS/driver.
 *
 * #### Phase 3 — **[done / documented]**
 * - **[done]** Folder-ordered playlist for mp3/m4a/flac: auto-advance (optional, Settings), prev/next in main player when `scan_gallery` lists multiple audio files in the same directory as the current track; Mini Player advances along sorted audio subset of its strip.
 * - **[done]** Hidden second `<audio preload="auto">` to prefetch next track URL (shrinks gaps; not true gapless — decoder still restarts).
 * - **UI:** Codec/ffprobe text is hidden during playback; `probe_local_media_ffprobe` still runs to populate disk cache / for future callers.
 * - **Skipped:** Web Audio ReplayGain/normalization — too unreliable in plain WebView2 for this codebase without native sink.
 * **Still deferred:** crossfade curves, draggable queue/editor, Mediabunny-style gapless preload windows.
 *
 * #### Phase 4 — **backlog**
 * - Experimental native decode/output path (`symphonia` / rodio / cpal or OS media session) guarded by explicit opt-in flag; preserve default Chromium `<audio>` / `<video>`.
 * - Optional ffmpeg loudnorm / ReplayGain post-read from tags.
 * - Deeper prefetch (MediaSource/worklet) **only if** native path rejects.
 */

const AUDIO_ONLY_EXTENSIONS = new Set(["mp3", "m4a", "flac", "opus", "ogg", "wav"]);

export function isAudioOnlyPath(filePath: string): boolean {
  const name = filePath.replace(/^.*[/\\]/, "");
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return AUDIO_ONLY_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * Best cover art path for a media file. Prefers embedded cover, then thumbnail, then poster.
 */
export function bestCoverPath(file: {
  embeddedCoverPath?: string | null;
  thumbnailPath?: string | null;
  ruforgePosterPath?: string | null;
}): string | null {
  return file.embeddedCoverPath ?? file.thumbnailPath ?? file.ruforgePosterPath ?? null;
}
