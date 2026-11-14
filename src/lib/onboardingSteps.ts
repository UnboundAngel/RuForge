import altRadialDemoGif from "@/assets/onboarding/alt-radial-demo.gif";
import discordSettingsDemoGif from "@/assets/onboarding/discord-settings-demo.gif";
import discordSettingsDemoMp4 from "@/assets/onboarding/discord-settings-demo.mp4";
import playlistsOpenMp4 from "@/assets/onboarding/playlists-open.mp4";
import playlistsOpenPoster from "@/assets/onboarding/playlists-open-poster.webp";
import playlistsReorderMp4 from "@/assets/onboarding/playlists-reorder.mp4";
import playlistsReorderPoster from "@/assets/onboarding/playlists-reorder-poster.webp";

import { GripVertical, ListVideo, type LucideIcon } from "lucide-react";

import type { OnboardingCondition } from "./onboardingConditions";
import {
  markOnboardingStepDone,
  readOnboardingDoneSteps,
  readOnboardingLastSeenVersion,
  semverGreater,
  writeOnboardingLastSeenVersion,
} from "./onboardingStorage";

export type OnboardingGuideCompleteWhen = OnboardingCondition;

export type OnboardingGuidePhase = {
  id: string;
  /** Compact pill title. */
  compact: string;
  /** Expanded instruction for this beat. */
  expandedCaption: string;
  /** Skip this phase if already true when the guide reaches it. */
  skipWhen?: OnboardingGuideCompleteWhen;
  /** Auto-advance when this becomes true while the phase is active. */
  completeWhen?: OnboardingGuideCompleteWhen;
  /** Shown in the pill, the expanded card and the checklist row for this beat. */
  icon?: LucideIcon;
  /** Shorter line the pill shows while the user is mid-action (drag started, tab open). */
  progressHint?: string;
  /** While true and the beat is not complete yet, the pill shows `progressHint`. */
  progressWhen?: OnboardingGuideCompleteWhen;
  /** Looping muted clip shown at the top of the expanded card, with a still for reduced motion. */
  clip?: { src: string; poster: string };
};

export type OnboardingIslandStep = {
  kind: "island";
  id: string;
  introducedIn: string;
  compactPurpose: string;
  /** Second compact carousel line (rendered with RuForge icon). Alt-hold steps only. */
  compactFollowUp: string;
  /**
   * Compact pill behavior. `alt-hold` is the mode-switch tutorial.
   * `tap-settings` shows a settings path demo, then optional guided phases.
   */
  compactVariant?: "alt-hold" | "tap-settings";
  expandedCaption: string;
  /** Without media, clicking the pill goes straight to the guide phases. */
  mediaSrc?: string;
  mediaAlt?: string;
  mediaObjectFit?: "cover" | "contain";
  /** Wait for this before showing; later steps whose condition holds may go first. */
  showWhen?: OnboardingCondition;
  /** The step counts as finished once this holds: skipped if already true, ended early if it turns true. */
  doneWhen?: OnboardingCondition;
  /** Larger center popup media (mp4/gif). Click island media to open. */
  mediaLightboxSrc?: string;
  /** After the demo, walk the user through these beats (tap-settings). */
  guidePhases?: readonly OnboardingGuidePhase[];
  defaultExpanded?: boolean;
  /** Spoken after the step's last beat instead of "nice!". */
  doneLabel?: string;
  /** Temporary demo content shown while the step runs when the user has no real data. */
  mockData?: "video-playlists";
};

export type OnboardingStep = OnboardingIslandStep;

export const DISCORD_PRESENCE_ONBOARDING_ID = "discord-presence";

/** last-seen just below Discord's introducedIn so only that step runs (debug preview). */
export const DISCORD_PRESENCE_PREVIEW_LAST_SEEN = "0.3.1";

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    kind: "island",
    id: "alt-radial",
    introducedIn: "0.1.11",
    compactPurpose: "Switch app modes",
    compactFollowUp: "to change modes",
    compactVariant: "alt-hold",
    expandedCaption:
      "Hold Alt to navigate around the app. It's the only way to access different modes.",
    mediaSrc: altRadialDemoGif,
    mediaAlt: "Alt radial navigation demo",
    defaultExpanded: true,
  },
  {
    kind: "island",
    id: DISCORD_PRESENCE_ONBOARDING_ID,
    introducedIn: "0.4.0",
    compactPurpose: "Discord integration",
    compactFollowUp: "to continue",
    compactVariant: "tap-settings",
    expandedCaption: "Discord integration is here.",
    mediaSrc: discordSettingsDemoGif,
    mediaAlt: "Turning on Discord activity in RuForge Settings",
    mediaObjectFit: "cover",
    mediaLightboxSrc: discordSettingsDemoMp4,
    defaultExpanded: true,
    guidePhases: [
      {
        id: "open-settings",
        compact: "Go to Settings",
        expandedCaption: "Open Settings from the sidebar gear.",
        skipWhen: "on-settings",
        completeWhen: "on-settings",
      },
      {
        id: "open-general",
        compact: "General → Discord",
        expandedCaption:
          "Open General, then scroll to the Discord section.",
        skipWhen: "on-general",
        completeWhen: "on-general",
      },
      {
        id: "enable-discord",
        compact: "Turn on Discord",
        expandedCaption:
          "Turn on Show activity on Discord. Turn on Include browsing status too if you want friends to see you in the library when nothing is playing.",
        skipWhen: "discord-on",
        completeWhen: "discord-on",
      },
    ],
  },
  {
    kind: "island",
    id: "follow-creators",
    introducedIn: "0.5.0",
    compactPurpose: "Follow creators",
    compactFollowUp: "to continue",
    compactVariant: "tap-settings",
    expandedCaption: "Follow creators to see their new uploads.",
    showWhen: "library-home-ready",
    doneWhen: "follows-someone",
    guidePhases: [
      {
        id: "follow",
        compact: "Follow a creator",
        expandedCaption:
          "Right-click a video and pick Follow, or open a creator's page and click Follow.",
        skipWhen: "follows-someone",
        completeWhen: "follows-someone",
      },
      {
        id: "auto-download",
        compact: "Turn on auto-download",
        expandedCaption:
          "Open the bell, then Channels, and turn on Auto-download to save their new uploads on their own.",
        skipWhen: "auto-download-on",
        completeWhen: "auto-download-on",
      },
    ],
  },
  {
    kind: "island",
    id: "playlist-import",
    introducedIn: "0.5.0",
    compactPurpose: "Bring your playlists over",
    compactFollowUp: "to continue",
    compactVariant: "tap-settings",
    expandedCaption: "Import a playlist from another app with a few screenshots.",
    showWhen: "music-mode",
    doneWhen: "music-playlist-made",
    guidePhases: [
      {
        id: "open-import",
        compact: "Open import",
        expandedCaption: "Click + in the sidebar, then Import from screenshots.",
        skipWhen: "import-open",
        completeWhen: "import-open",
      },
      {
        id: "copy-prompt",
        compact: "Copy the prompt",
        expandedCaption:
          "Screenshot a playlist in another app. Click Copy prompt, then paste it and your screenshots into any chatbot.",
        skipWhen: "import-prompt-copied",
        completeWhen: "import-prompt-copied",
      },
      {
        id: "paste-reply",
        compact: "Paste the reply",
        expandedCaption: "Paste the chatbot's reply into the box and click Continue.",
        skipWhen: "import-review",
        completeWhen: "import-review",
      },
      {
        id: "review-save",
        compact: "Review and save",
        expandedCaption: "Check the matches, untick any you don't want, then click Save.",
        completeWhen: "music-playlist-made",
      },
    ],
  },
  {
    kind: "island",
    id: "video-playlists",
    introducedIn: "0.10.0",
    compactPurpose: "Playlists got an overhaul",
    compactFollowUp: "to continue",
    compactVariant: "tap-settings",
    expandedCaption:
      "New playlist page: resume where you left off, drag to reorder, and find videos you don't have yet.",
    defaultExpanded: true,
    doneLabel: "Playlists tour done",
    mockData: "video-playlists",
    showWhen: "video-library-ready",
    doneWhen: "video-playlist-suggested-seen",
    guidePhases: [
      {
        id: "open-playlist",
        icon: ListVideo,
        compact: "Open a playlist",
        expandedCaption: "Click Playlists at the top, then open a playlist.",
        progressWhen: "video-playlists-tab",
        progressHint: "Now open a playlist",
        skipWhen: "video-playlist-open",
        completeWhen: "video-playlist-open",
        clip: { src: playlistsOpenMp4, poster: playlistsOpenPoster },
      },
      {
        id: "reorder-suggested",
        icon: GripVertical,
        compact: "Reorder, then find more",
        expandedCaption:
          "Drag a row to reorder. Then scroll down to Suggested for videos you don't have yet.",
        progressWhen: "video-playlist-reordered",
        progressHint: "Now scroll down to Suggested",
        completeWhen: "video-playlist-suggested-seen",
        clip: { src: playlistsReorderMp4, poster: playlistsReorderPoster },
      },
    ],
  },
];

/**
 * Steps sharing a version finish independently, so the version marker only
 * moves once every step up to it is done.
 */
export function markOnboardingStepFinished(id: string): void {
  markOnboardingStepDone(id);
  const done = readOnboardingDoneSteps();
  const lastSeen = readOnboardingLastSeenVersion();
  const versions = [...new Set(ONBOARDING_STEPS.map((s) => s.introducedIn))]
    .filter((v) => !lastSeen || semverGreater(v, lastSeen))
    .sort((a, b) => (semverGreater(a, b) ? 1 : semverGreater(b, a) ? -1 : 0));
  let reached: string | null = null;
  for (const version of versions) {
    const open = ONBOARDING_STEPS.some((s) => s.introducedIn === version && !done.has(s.id));
    if (open) break;
    reached = version;
  }
  if (reached) writeOnboardingLastSeenVersion(reached);
}

export function resolveOnboardingSteps(
  lastSeen: string | null,
  devReplayAll: boolean,
): OnboardingStep[] {
  const done = readOnboardingDoneSteps();
  return ONBOARDING_STEPS.filter((step) => {
    if (devReplayAll) return true;
    if (done.has(step.id)) return false;
    if (!lastSeen) return true;
    return semverGreater(step.introducedIn, lastSeen);
  });
}