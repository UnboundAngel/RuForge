import { useEffect, useState } from "react";

import {
  isOnboardingConditionMet,
  subscribeOnboardingConditions,
  type OnboardingCondition,
} from "@/lib/onboardingConditions";

/** Live level of a condition, true from mount if it already holds (the guide watcher is edge-only). */
export function useConditionLevel(
  condition: OnboardingCondition | undefined,
  enabled: boolean,
): boolean {
  const [met, setMet] = useState(false);
  useEffect(() => {
    if (!condition || !enabled) {
      setMet(false);
      return;
    }
    setMet(isOnboardingConditionMet(condition));
    return subscribeOnboardingConditions(() => setMet(isOnboardingConditionMet(condition)));
  }, [condition, enabled]);
  return met;
}
