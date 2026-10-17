export type DraftRelease = { version: string; body: string };

/** Mirrors a real `updater.json` body for the Settings > Debugging What's New preview. */
export const MOCK_POST_INSTALL_JSON = JSON.stringify({
  notes: [
    "# Follow your channels",
    "- **Library**: A YouTube-style home with your feed, channel shelves and creator pages.",
    "- **Follow**: Follow channels, get new uploads in a notification center, and auto-download them if you like.",
    "- **Music**: Playlists, YouTube Music recommendations with previews, one search bar, and import from screenshots.",
    "- **Island**: Downloads and notices show at the top of your screen while RuForge is in the background.",
    "- **Downloads**: Playlists list in seconds, storage is checked before a download starts, and errors say what to fix.",
    "- **Fixes**: Steadier playback, downloads that clean up after themselves, and yt-dlp and ffmpeg that close with RuForge.",
  ].join("\n"),
});

/**
 * Newest `docs/agents/release/notes-<version>.json` draft, in the shape `updater.json` carries.
 * Dev only: the glob sits behind the DEV guard so production bundles never contain the draft.
 */
export async function loadDraftRelease(): Promise<DraftRelease | null> {
  if (!import.meta.env.DEV) return null;
  const files = import.meta.glob<string>("../../docs/agents/release/notes-*.json", {
    query: "?raw",
    import: "default",
  });
  const entries = Object.entries(files)
    .map(([path, load]) => ({ version: /notes-(.+)\.json$/.exec(path)?.[1] ?? "", load }))
    .filter((e) => e.version)
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
  const newest = entries[entries.length - 1];
  if (!newest) return null;
  return { version: newest.version, body: await newest.load() };
}
