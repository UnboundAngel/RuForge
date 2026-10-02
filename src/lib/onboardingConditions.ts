import { useCreatorPage } from "@/components/library/creatorPageStore";
import { musicPlaylistRecords } from "@/components/music/musicPlaylists";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { isAudioOnlyPath } from "@/mediaKind";
import { useImportSession } from "@/playlistImport/importSession";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { useWatchlistStore } from "@/watchlist/watchlistStore";

export type OnboardingCondition =
  | "on-settings"
  | "on-general"
  | "discord-on"
  | "library-home-ready"
  | "music-mode"
  | "follows-someone"
  | "auto-download-on"
  | "import-open"
  | "import-prompt-copied"
  | "import-review"
  | "music-playlist-made";

export type OnboardingEvent = "import-prompt-copied" | "import-saved";

/** Videos on disk before the follow tip is worth showing. */
export const FOLLOW_TIP_MIN_VIDEOS = 3;

const events = new Set<OnboardingEvent>();
const eventListeners = new Set<() => void>();

export function noteOnboardingEvent(event: OnboardingEvent): void {
  if (events.has(event)) return;
  events.add(event);
  for (const fn of eventListeners) fn();
}

const videoCountCache = new WeakMap<object, number>();

function downloadedVideoCount(entries: object): number {
  let n = videoCountCache.get(entries);
  if (n === undefined) {
    n = flattenGalleryScanToMediaFiles(entries).filter((f) => !isAudioOnlyPath(f.path)).length;
    videoCountCache.set(entries, n);
  }
  return n;
}

export function isOnboardingConditionMet(condition: OnboardingCondition): boolean {
  const s = useRuforgeStore.getState();
  switch (condition) {
    case "on-settings":
      return s.settingsOpen;
    case "on-general":
      return s.settingsOpen && s.settingsTab === "general";
    case "discord-on":
      return s.settings.discordPresenceEnabled === true;
    case "library-home-ready":
      return (
        !s.settingsOpen &&
        s.navMode === "default" &&
        s.activeTab === "media" &&
        s.galleryFilter === "all" &&
        !s.searchValue.trim() &&
        !useCreatorPage.getState().creator &&
        useWatchlistStore.getState().snapshot !== null &&
        downloadedVideoCount(s.entries) >= FOLLOW_TIP_MIN_VIDEOS
      );
    case "music-mode":
      return !s.settingsOpen && s.navMode === "music";
    case "follows-someone":
      return (useWatchlistStore.getState().snapshot?.channels.length ?? 0) > 0;
    case "auto-download-on":
      return useWatchlistStore.getState().snapshot?.channels.some((c) => c.autoDownload) === true;
    case "import-open":
      return useImportSession.getState().open;
    case "import-prompt-copied":
      return events.has("import-prompt-copied");
    case "import-review":
      return useImportSession.getState().phase === "review";
    case "music-playlist-made":
      return events.has("import-saved") || musicPlaylistRecords(s.virtualPlaylistRecords).length > 0;
  }
}

/** Fires on any change that could flip a condition; callers re-check the ones they care about. */
export function subscribeOnboardingConditions(onChange: () => void): () => void {
  eventListeners.add(onChange);
  const unsubs = [
    useRuforgeStore.subscribe(onChange),
    useWatchlistStore.subscribe(onChange),
    useImportSession.subscribe(onChange),
    useCreatorPage.subscribe(onChange),
  ];
  return () => {
    eventListeners.delete(onChange);
    for (const u of unsubs) u();
  };
}
