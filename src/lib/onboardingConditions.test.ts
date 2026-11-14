import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The store reads localStorage while it loads, which is before any later stub runs.
vi.hoisted(() => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});

import {
  SUGGESTED_SEEN_DELAY_MS,
  isOnboardingConditionMet,
  noteOnboardingEvent,
  noteSuggestedShelfVisible,
  resetOnboardingEventsForTest,
} from "./onboardingConditions";
import { useCreatorPage } from "@/components/library/creatorPageStore";
import { useRuforgeStore } from "@/store/ruforgeStore";

const seen = () => isOnboardingConditionMet("video-playlist-suggested-seen");

describe("Suggested shelf sighting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetOnboardingEventsForTest();
  });
  afterEach(() => {
    resetOnboardingEventsForTest();
    vi.useRealTimers();
  });

  it("does not count before a reorder", () => {
    noteSuggestedShelfVisible(true);
    expect(seen()).toBe(false);
  });

  it("counts a shelf already in view a few seconds after the reorder", () => {
    noteSuggestedShelfVisible(true);
    noteOnboardingEvent("video-playlist-reordered");
    expect(seen()).toBe(false);
    vi.advanceTimersByTime(SUGGESTED_SEEN_DELAY_MS);
    expect(seen()).toBe(true);
  });

  it("counts the shelf entering view after a reorder at once", () => {
    noteOnboardingEvent("video-playlist-reordered");
    noteSuggestedShelfVisible(true);
    expect(seen()).toBe(true);
  });

  it("drops the delayed sighting if the shelf leaves view first", () => {
    noteSuggestedShelfVisible(true);
    noteOnboardingEvent("video-playlist-reordered");
    noteSuggestedShelfVisible(false);
    vi.advanceTimersByTime(SUGGESTED_SEEN_DELAY_MS);
    expect(seen()).toBe(false);
  });
});

describe("video playlist tour conditions", () => {
  beforeEach(() => resetOnboardingEventsForTest());
  afterEach(() => {
    useRuforgeStore.setState({ settingsOpen: false, navMode: "default", activeTab: "media", galleryFilter: "all", searchValue: "", selectedPlaylist: null });
    useCreatorPage.setState({ creator: null, tagId: null });
    resetOnboardingEventsForTest();
  });
  const ready = () => isOnboardingConditionMet("video-library-ready");
  const tab = () => isOnboardingConditionMet("video-playlists-tab");

  it("library is ready without any video count, on any filter", () => {
    useRuforgeStore.setState({ settingsOpen: false, navMode: "default", activeTab: "media", entries: [], galleryFilter: "playlists", searchValue: "" });
    expect(ready()).toBe(true);
  });

  it("library is not ready in settings, search or a creator page", () => {
    useRuforgeStore.setState({ settingsOpen: true });
    expect(ready()).toBe(false);
    useRuforgeStore.setState({ settingsOpen: false, searchValue: "x" });
    expect(ready()).toBe(false);
    useRuforgeStore.setState({ searchValue: "" });
    useCreatorPage.setState({ tagId: "t" });
    expect(ready()).toBe(false);
  });

  it("playlists tab holds on the Playlists filter or with a playlist open", () => {
    useRuforgeStore.setState({ galleryFilter: "all", selectedPlaylist: null });
    expect(tab()).toBe(false);
    useRuforgeStore.setState({ galleryFilter: "playlists" });
    expect(tab()).toBe(true);
    useRuforgeStore.setState({
      galleryFilter: "all",
      selectedPlaylist: { kind: "playlist", title: "p", path: "p", itemCount: 0, combinedDuration: 0, stackThumbnailPath: null, items: [] },
    });
    expect(tab()).toBe(true);
  });

  it("playlist-open is true only while the detail page is showing", () => {
    const open = () => isOnboardingConditionMet("video-playlist-open");
    const p = { kind: "playlist" as const, title: "p", path: "p", itemCount: 0, combinedDuration: 0, stackThumbnailPath: null, items: [] };
    useRuforgeStore.setState({ galleryFilter: "playlists", selectedPlaylist: null });
    expect(open()).toBe(false);
    useRuforgeStore.setState({ selectedPlaylist: p });
    expect(open()).toBe(true);
    useRuforgeStore.setState({ activeTab: "music" as never });
    expect(open()).toBe(false);
    useRuforgeStore.setState({ activeTab: "media" });
    useCreatorPage.setState({ tagId: "t" });
    expect(open()).toBe(false);
  });
});
