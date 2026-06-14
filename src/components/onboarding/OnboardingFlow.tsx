import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  maxIntroducedIn,
  resolveOnboardingSteps,
} from "@/lib/onboardingSteps";
import {
  readOnboardingLastSeenVersion,
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
    if (stepIndex >= steps.length - 1) {
      const maxVersion = maxIntroducedIn(steps);
      if (maxVersion) writeOnboardingLastSeenVersion(maxVersion);
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
