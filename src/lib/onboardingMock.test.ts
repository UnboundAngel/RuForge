import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOnboardingMock,
  endOnboardingMock,
  getOnboardingMock,
  registerOnboardingMockHold,
  releaseOnboardingMockHold,
  startOnboardingMock,
} from "./onboardingMock";

describe("onboarding mock hold", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    clearOnboardingMock();
    vi.useRealTimers();
  });

  it("clears after the short backstop when nothing holds it", () => {
    startOnboardingMock("video-playlists");
    endOnboardingMock();
    vi.advanceTimersByTime(2600);
    expect(getOnboardingMock().kind).toBeNull();
  });

  it("keeps a held demo up until the hold timeout", () => {
    const off = registerOnboardingMockHold(() => true);
    startOnboardingMock("video-playlists");
    endOnboardingMock();
    vi.advanceTimersByTime(7000);
    expect(getOnboardingMock().kind).toBe("video-playlists");
    vi.advanceTimersByTime(1100);
    expect(getOnboardingMock().kind).toBeNull();
    off();
  });

  it("shortens to the normal window once the held page is left", () => {
    const off = registerOnboardingMockHold(() => true);
    startOnboardingMock("video-playlists");
    endOnboardingMock();
    vi.advanceTimersByTime(3000);
    releaseOnboardingMockHold();
    vi.advanceTimersByTime(2600);
    expect(getOnboardingMock().kind).toBeNull();
    off();
  });
});
