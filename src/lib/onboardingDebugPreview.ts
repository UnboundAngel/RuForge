import { useRuforgeStore } from "@/store/ruforgeStore";
import { forceNextOnboardingMock } from "./onboardingMock";
import { DISCORD_PRESENCE_ONBOARDING_ID, DISCORD_PRESENCE_PREVIEW_LAST_SEEN } from "./onboardingSteps";
import { clearOnboardingDoneSteps, writeOnboardingLastSeenVersion } from "./onboardingStorage";

/**
 * Same-window debug hooks for onboarding previews. Window events, not module variables, so a hot
 * reload of this module (it imports onboardingSteps) cannot drop App's handler.
 */

type PreviewFn = () => void;
type PreviewKind = "discord" | "playlists" | "replay";

const eventName = (kind: PreviewKind) => `ruforge-onboarding-preview-${kind}`;

function registerPreview(kind: PreviewKind, fn: PreviewFn): () => void {
  const handler = () => fn();
  window.addEventListener(eventName(kind), handler);
  return () => window.removeEventListener(eventName(kind), handler);
}

function requestPreview(kind: PreviewKind): void {
  window.dispatchEvent(new Event(eventName(kind)));
}

export const PLAYLISTS_ONBOARDING_ID = "video-playlists";
/** Just below the step's introducedIn, so only it runs. */
export const PLAYLISTS_PREVIEW_LAST_SEEN = "0.9.9";

/**
 * Resets whatever one step needs to run again. Returns false when debugging is off; the caller
 * opens the island only on true.
 */
export function prepareFeaturePreview(kind: "discord" | "playlists"): boolean {
  const store = useRuforgeStore.getState();
  if (store.settings.showDebuggingSettings !== true) return false;
  if (kind === "discord") {
    writeOnboardingLastSeenVersion(DISCORD_PRESENCE_PREVIEW_LAST_SEEN);
    clearOnboardingDoneSteps([DISCORD_PRESENCE_ONBOARDING_ID]);
    void store.updateSetting("discordPresenceEnabled", false);
    return true;
  }
  writeOnboardingLastSeenVersion(PLAYLISTS_PREVIEW_LAST_SEEN);
  clearOnboardingDoneSteps([PLAYLISTS_ONBOARDING_ID]);
  // The island starts the mock itself; this makes that start show the demo even over real playlists.
  forceNextOnboardingMock("video-playlists");
  return true;
}

export const registerDiscordOnboardingPreview = (fn: PreviewFn) => registerPreview("discord", fn);
export const registerPlaylistsOnboardingPreview = (fn: PreviewFn) => registerPreview("playlists", fn);
export const registerReplayOnboardingPreview = (fn: PreviewFn) => registerPreview("replay", fn);

export const requestDiscordOnboardingPreview = () => requestPreview("discord");
export const requestPlaylistsOnboardingPreview = () => requestPreview("playlists");
export const requestReplayOnboardingPreview = () => requestPreview("replay");
