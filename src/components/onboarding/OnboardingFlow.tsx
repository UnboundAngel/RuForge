import { useCallback, useEffect, useState } from "react";

import {
  isOnboardingConditionMet,
  subscribeOnboardingConditions,
} from "@/lib/onboardingConditions";
import {
  markOnboardingStepFinished,
  resolveOnboardingSteps,
  type OnboardingStep,
} from "@/lib/onboardingSteps";
import { readOnboardingLastSeenVersion } from "@/lib/onboardingStorage";
import { OnboardingIsland } from "./OnboardingIsland";

type OnboardingFlowProps = {
  onComplete: () => void;
};

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [pending, setPending] = useState<OnboardingStep[]>(resolveActiveOnboardingSteps);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    if (pending.length === 0) {
      onComplete();
      return;
    }
    if (currentId) return;

    const pick = (): boolean => {
      const alreadyDone = pending.filter(
        (s) => s.doneWhen && isOnboardingConditionMet(s.doneWhen),
      );
      if (alreadyDone.length > 0) {
        for (const s of alreadyDone) markOnboardingStepFinished(s.id);
        setPending((list) => list.filter((s) => !alreadyDone.includes(s)));
        return true;
      }
      const next = pending.find((s) => !s.showWhen || isOnboardingConditionMet(s.showWhen));
      if (!next) return false;
      setCurrentId(next.id);
      return true;
    };

    if (pick()) return;
    let picked = false;
    const unsubscribe = subscribeOnboardingConditions(() => {
      if (!picked) picked = pick();
    });
    return unsubscribe;
  }, [pending, currentId, onComplete]);

  const current = currentId ? pending.find((s) => s.id === currentId) : undefined;

  const finishCurrent = useCallback(() => {
    if (current) markOnboardingStepFinished(current.id);
  }, [current]);

  const advance = useCallback(() => {
    if (!current) return;
    markOnboardingStepFinished(current.id);
    setPending((list) => list.filter((s) => s.id !== current.id));
    setCurrentId(null);
  }, [current]);

  if (!current) return null;

  return (
    <OnboardingIsland
      key={current.id}
      {...current}
      onDismiss={advance}
      onDone={finishCurrent}
    />
  );
}

export function resolveActiveOnboardingSteps(): OnboardingStep[] {
  return resolveOnboardingSteps(readOnboardingLastSeenVersion(), false);
}
