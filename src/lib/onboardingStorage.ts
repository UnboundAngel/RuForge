const LAST_SEEN_KEY = "ruforge-onboarding-last-seen-version";

export function readOnboardingLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function writeOnboardingLastSeenVersion(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, version);
  } catch {
    /* ignore quota / private mode */
  }
}

const DONE_STEPS_KEY = "ruforge-onboarding-done-steps";

export function readOnboardingDoneSteps(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DONE_STEPS_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeOnboardingDoneSteps(done: Set<string>): void {
  try {
    localStorage.setItem(DONE_STEPS_KEY, JSON.stringify([...done]));
  } catch {
    /* ignore quota / private mode */
  }
}

export function markOnboardingStepDone(id: string): void {
  const done = readOnboardingDoneSteps();
  if (done.has(id)) return;
  done.add(id);
  writeOnboardingDoneSteps(done);
}

/** No ids clears every step (full replay). */
export function clearOnboardingDoneSteps(ids?: readonly string[]): void {
  if (!ids) {
    writeOnboardingDoneSteps(new Set());
    return;
  }
  const done = readOnboardingDoneSteps();
  for (const id of ids) done.delete(id);
  writeOnboardingDoneSteps(done);
}

export function semverGreater(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return true;
    if (da < db) return false;
  }
  return false;
}
