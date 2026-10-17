import { describe, expect, it, vi } from "vitest";

vi.mock("../store/ruforgeStore", () => ({ useRuforgeStore: { getState: () => ({}) } }));

import {
  PLAYER_SKIP_SECONDS,
  runPlayerHotkeyAction,
  type PlayerKeyboardShortcutHandlers,
} from "./usePlayerKeyboardShortcuts";

function handlers(over: Partial<PlayerKeyboardShortcutHandlers> = {}): PlayerKeyboardShortcutHandlers {
  return {
    volume: 0.5,
    togglePlay: vi.fn(),
    skip: vi.fn(),
    changeVolume: vi.fn(),
    setMuted: vi.fn(),
    ...over,
  };
}

describe("runPlayerHotkeyAction", () => {
  it("jumps chapters when the video has them", () => {
    const h = handlers({ hasChapters: true, jumpNextChapter: vi.fn(), jumpPrevChapter: vi.fn() });
    expect(runPlayerHotkeyAction("player.nextChapter", h)).toBe(true);
    expect(h.jumpNextChapter).toHaveBeenCalledOnce();
    expect(h.skip).not.toHaveBeenCalled();
  });

  it("falls back to a plain seek without chapters", () => {
    const h = handlers();
    expect(runPlayerHotkeyAction("player.prevChapter", h)).toBe(true);
    expect(h.skip).toHaveBeenCalledWith(-PLAYER_SKIP_SECONDS);
  });

  it("reports actions the player cannot do", () => {
    expect(runPlayerHotkeyAction("player.loop", handlers())).toBe(false);
    expect(runPlayerHotkeyAction("player.ghostMode", handlers())).toBe(false);
  });
});
