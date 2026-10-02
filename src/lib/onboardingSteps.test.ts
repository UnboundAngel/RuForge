import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ONBOARDING_STEPS,
  markOnboardingStepFinished,
  resolveOnboardingSteps,
} from "./onboardingSteps";
import {
  clearOnboardingDoneSteps,
  readOnboardingDoneSteps,
  readOnboardingLastSeenVersion,
  writeOnboardingLastSeenVersion,
} from "./onboardingStorage";

let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
});

const ids = (steps: { id: string }[]) => steps.map((s) => s.id);

describe("onboarding step persistence", () => {
  beforeEach(() => {
    store = {};
  });

  it("an upgrade from 0.4.0 offers only the 0.5.0 tips", () => {
    writeOnboardingLastSeenVersion("0.4.0");
    expect(ids(resolveOnboardingSteps(readOnboardingLastSeenVersion(), false))).toEqual([
      "follow-creators",
      "playlist-import",
    ]);
  });

  it("finishing one 0.5.0 tip keeps the other pending and holds the version marker", () => {
    writeOnboardingLastSeenVersion("0.4.0");
    markOnboardingStepFinished("playlist-import");
    expect(readOnboardingLastSeenVersion()).toBe("0.4.0");
    expect(ids(resolveOnboardingSteps(readOnboardingLastSeenVersion(), false))).toEqual([
      "follow-creators",
    ]);
    markOnboardingStepFinished("follow-creators");
    expect(readOnboardingLastSeenVersion()).toBe("0.5.0");
    expect(resolveOnboardingSteps(readOnboardingLastSeenVersion(), false)).toEqual([]);
  });

  it("a fresh install advances the marker one finished version at a time", () => {
    markOnboardingStepFinished(ONBOARDING_STEPS[0]!.id);
    expect(readOnboardingLastSeenVersion()).toBe(ONBOARDING_STEPS[0]!.introducedIn);
    markOnboardingStepFinished("follow-creators");
    expect(readOnboardingLastSeenVersion()).toBe(ONBOARDING_STEPS[0]!.introducedIn);
  });

  it("replay clears done steps so every tip comes back", () => {
    for (const s of ONBOARDING_STEPS) markOnboardingStepFinished(s.id);
    writeOnboardingLastSeenVersion("0.0.0");
    clearOnboardingDoneSteps();
    expect(readOnboardingDoneSteps().size).toBe(0);
    expect(resolveOnboardingSteps(readOnboardingLastSeenVersion(), false)).toHaveLength(
      ONBOARDING_STEPS.length,
    );
  });

  it("the new tips wait for their trigger and finish on their own condition", () => {
    const follow = ONBOARDING_STEPS.find((s) => s.id === "follow-creators")!;
    const imp = ONBOARDING_STEPS.find((s) => s.id === "playlist-import")!;
    expect([follow.showWhen, follow.doneWhen]).toEqual(["library-home-ready", "follows-someone"]);
    expect([imp.showWhen, imp.doneWhen]).toEqual(["music-mode", "music-playlist-made"]);
  });

  it("tip copy has no em dashes", () => {
    const text = JSON.stringify(ONBOARDING_STEPS);
    expect(text).not.toContain("\u2014");
  });
});
