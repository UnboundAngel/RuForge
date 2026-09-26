import { useCallback, useEffect, useMemo, useState } from "react";

import { resolveOnboardingSteps } from "@/lib/onboardingSteps";
import {
  readOnboardingLastSeenVersion,
  semverGreater,
  writeOnboardingLastSeenVersion,
} from "@/lib/onboardingStorage";
import { OnboardingIsland } from "./OnboardingIsland";

type OnboardingFlowProps = {
  onComplete: () => void;
};

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const steps = useMemo(
    () => resolveOnboardingSteps(readOnboardingLastSeenVersion(), false),
    [],
  );
  const [stepIndex, setStepIndex] = useState(0);

  const current = steps[stepIndex];

  const advance = useCallback(() => {
    // Persist per step so a refresh mid-flow does not replay finished steps.
    const finished = steps[stepIndex];
    const lastSeen = readOnboardingLastSeenVersion();
    if (finished && (!lastSeen || semverGreater(finished.introducedIn, lastSeen))) {
      writeOnboardingLastSeenVersion(finished.introducedIn);
    }
    if (stepIndex >= steps.length - 1) {
      onComplete();
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, steps, onComplete]);

  useEffect(() => {
    if (steps.length === 0) {
      onComplete();
    }
  }, [steps.length, onComplete]);

  if (!current) return null;

  return <OnboardingIsland {...current} onDismiss={advance} />;
}

export function resolveActiveOnboardingSteps(): import("@/lib/onboardingSteps").OnboardingStep[] {
  return resolveOnboardingSteps(readOnboardingLastSeenVersion(), false);
}
