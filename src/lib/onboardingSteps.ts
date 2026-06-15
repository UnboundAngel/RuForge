import altRadialDemoGif from "@/assets/onboarding/alt-radial-demo.gif";

import { semverGreater } from "./onboardingStorage";

export type OnboardingIslandStep = {
  kind: "island";
  id: string;
  introducedIn: string;
  compactPurpose: string;
  /** Second compact carousel line (rendered with RuForge icon). */
  compactFollowUp: string;
  expandedCaption: string;
  mediaSrc: string;
  mediaAlt: string;
  defaultExpanded?: boolean;
};

export type OnboardingStep = OnboardingIslandStep;

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    kind: "island",
    id: "alt-radial",
    introducedIn: "0.1.11",
    compactPurpose: "Switch app modes",
    compactFollowUp: "to change modes",
    expandedCaption:
      "Hold Alt to navigate around the app. It's the only way to access different modes.",
    mediaSrc: altRadialDemoGif,
    mediaAlt: "Alt radial navigation demo",
    defaultExpanded: true,
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
