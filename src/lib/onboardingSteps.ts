import altRadialDemoGif from "@/assets/onboarding/alt-radial-demo.gif";
import discordSettingsDemoGif from "@/assets/onboarding/discord-settings-demo.gif";
import discordSettingsDemoMp4 from "@/assets/onboarding/discord-settings-demo.mp4";

import { semverGreater } from "./onboardingStorage";

export type OnboardingGuideCompleteWhen =
  | "on-settings"
  | "on-general"
  | "discord-on";

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
  mediaSrc: string;
  mediaAlt: string;
  mediaObjectFit?: "cover" | "contain";
  /** Larger center popup media (mp4/gif). Click island media to open. */
  mediaLightboxSrc?: string;
  /** After the demo, walk the user through these beats (tap-settings). */
  guidePhases?: readonly OnboardingGuidePhase[];
  defaultExpanded?: boolean;
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
          "Turn on Show activity on Discord.",
        completeWhen: "discord-on",
      },
    ],
  },
];

export function resolveOnboardingSteps(
  lastSeen: string | null,
  devReplayAll: boolean,
): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => {
    if (devReplayAll) return true;
    if (!lastSeen) return true;
    return semverGreater(step.introducedIn, lastSeen);
  });
}

export function maxIntroducedIn(steps: readonly OnboardingStep[]): string | null {
  if (steps.length === 0) return null;
  return steps.reduce(
    (max, step) => (semverGreater(step.introducedIn, max) ? step.introducedIn : max),
    steps[0].introducedIn,
  );
}
