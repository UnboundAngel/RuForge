import { describe, expect, it } from "vitest";
import {
  chordFitsScope,
  chordFromEvent,
  chordToAccelerator,
  findHotkeyConflicts,
  formatChord,
  GHOST_PLAYBACK_ACTIONS,
  hotkeyAction,
  HOTKEY_ACTIONS,
  isBindingCustomized,
  normalizeChord,
  normalizeHotkeyOverrides,
  registerGamesHotkeyDefs,
  resolveBindings,
  scopesOverlap,
  type HotkeyAction,
} from "./hotkeys";

/** Fixture mirror of `@games` GAMES_HOTKEY_DEFS so this file stays public-build safe. */
const TEST_GAMES_HOTKEY_DEFS: readonly HotkeyAction[] = [
  {
    id: "library.goGames",
    label: "Go to Games",
    description: "Opens your games, their videos and guides.",
    group: "library",
    scope: "library",
    defaults: ["Alt+Digit3"],
  },
  {
    id: "games.openPinnedGlance",
    label: "Open pinned glance",
    description: "Opens or closes the guide you pinned for the game in front.",
    group: "games",
    scope: "system",
    defaults: ["Mod+Alt+KeyP"],
  },
  {
    id: "overlay.toggle",
    label: "In-game overlay",
    description: "Shows or hides the RuForge overlay over whatever app is in front.",
    group: "games",
    scope: "system",
    defaults: ["Mod+Alt+KeyO"],
  },
];

registerGamesHotkeyDefs(TEST_GAMES_HOTKEY_DEFS);

const ev = (code: string, mods: Partial<Record<"ctrl" | "meta" | "alt" | "shift", boolean>> = {}) => ({
  code,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe("chordFromEvent", () => {
  it("orders modifiers and keeps the physical code", () => {
    expect(chordFromEvent(ev("KeyK", { ctrl: true, shift: true, alt: true }))).toBe(
      "Mod+Alt+Shift+KeyK",
    );
    expect(chordFromEvent(ev("Digit1", { alt: true }))).toBe("Alt+Digit1");
  });

  it("ignores lone modifiers and the Windows key", () => {
    expect(chordFromEvent(ev("ShiftLeft", { shift: true }))).toBeNull();
    expect(chordFromEvent(ev("KeyD", { meta: true }))).toBeNull();
  });
});

describe("normalize", () => {
  it("reorders modifiers and rejects junk", () => {
    expect(normalizeChord("Shift+Mod+KeyK")).toBe("Mod+Shift+KeyK");
    expect(normalizeChord("Hyper+KeyK")).toBeNull();
    expect(normalizeChord("Mod+ControlLeft")).toBeNull();
    expect(normalizeChord(42)).toBeNull();
  });

  it("keeps orphan action ids, dedupes and caps at two", () => {
    const out = normalizeHotkeyOverrides({
      "player.mute": ["KeyM", "KeyM", "KeyN", "KeyO"],
      "nope.action": ["KeyX"],
      "player.loop": "KeyL",
    });
    expect(out).toEqual({
      "player.mute": ["KeyM", "KeyN"],
      "nope.action": ["KeyX"],
    });
  });

  it("keeps an explicitly cleared action as empty", () => {
    expect(normalizeHotkeyOverrides({ "player.mute": [] })).toEqual({ "player.mute": [] });
    expect(resolveBindings("player.mute", { "player.mute": [] })).toEqual([]);
  });
});

describe("defaults", () => {
  it("have no conflicts inside overlapping scopes", () => {
    for (const action of HOTKEY_ACTIONS) {
      for (const chord of action.defaults) {
        expect(findHotkeyConflicts(chord, action.id, {}), `${action.id} ${chord}`).toEqual([]);
      }
    }
  });

  it("are all already normalized", () => {
    for (const action of HOTKEY_ACTIONS) {
      for (const chord of action.defaults) expect(normalizeChord(chord)).toBe(chord);
    }
  });
});

describe("conflicts", () => {
  it("lets Videos and Music share a key", () => {
    expect(scopesOverlap("library", "music")).toBe(false);
    expect(findHotkeyConflicts("Alt+Digit1", "music.goHome", {})).toEqual([]);
  });

  it("flags player keys reused in the Videos shell and global keys anywhere", () => {
    expect(findHotkeyConflicts("KeyM", "library.search", {})).toEqual(["player.mute"]);
    expect(findHotkeyConflicts("Mod+KeyK", "app.switchMode", {})).toEqual([
      "library.search",
      "music.search",
    ]);
  });
});

describe("customized", () => {
  it("is false when overrides match defaults", () => {
    expect(isBindingCustomized("player.playPause", { "player.playPause": ["Space", "KeyK"] })).toBe(
      false,
    );
    expect(isBindingCustomized("player.playPause", { "player.playPause": ["Space"] })).toBe(true);
  });
});

describe("formatChord", () => {
  it("reads like a tooltip", () => {
    expect(formatChord("Mod+Shift+KeyM")).toBe("Ctrl+Shift+M");
    expect(formatChord("Shift+ArrowLeft")).toBe("Shift+←");
  });
});

describe("system-wide chords", () => {
  it("convert to plugin accelerators", () => {
    expect(chordToAccelerator("Mod+Shift+KeyG")).toBe("CommandOrControl+Shift+KeyG");
    expect(chordToAccelerator("Alt+ArrowLeft")).toBe("Alt+ArrowLeft");
  });

  it("need Ctrl or Alt so a game keeps its plain keys", () => {
    expect(chordFitsScope("Space", "system")).toBe(false);
    expect(chordFitsScope("Shift+KeyG", "system")).toBe(false);
    expect(chordFitsScope("Mod+Shift+KeyG", "system")).toBe(true);
    expect(chordFitsScope("Alt+KeyG", "system")).toBe(true);
    expect(chordFitsScope("Space", "player")).toBe(true);
  });

  it("default to chords that fit their scope", () => {
    for (const action of HOTKEY_ACTIONS) {
      for (const chord of action.defaults) {
        expect(chordFitsScope(chord, action.scope), `${action.id} ${chord}`).toBe(true);
      }
    }
  });

  it("shadow in-app keys in every mode", () => {
    expect(scopesOverlap("system", "music")).toBe(true);
    expect(findHotkeyConflicts("Mod+Shift+KeyM", "player.ghostMode", {})).toEqual(["app.switchMode"]);
  });

  it("keeps pinned glance off Mod+Alt+KeyG and the ghost playback chords", () => {
    expect(hotkeyAction("games.openPinnedGlance").defaults).toEqual(["Mod+Alt+KeyP"]);
    expect(findHotkeyConflicts("Mod+Alt+KeyP", "games.openPinnedGlance", {})).toEqual([]);
    expect(findHotkeyConflicts("Mod+Alt+KeyG", "games.openPinnedGlance", {})).toEqual([
      "player.ghostMode",
    ]);
    for (const { id } of GHOST_PLAYBACK_ACTIONS) {
      const [chord] = hotkeyAction(id).defaults;
      expect(findHotkeyConflicts(chord, "games.openPinnedGlance", {})).toEqual([id]);
    }
  });

  it("keeps the in-game overlay off Backquote, Mod+Alt+KeyG, and Mod+Alt+KeyP", () => {
    expect(hotkeyAction("overlay.toggle").defaults).toEqual(["Mod+Alt+KeyO"]);
    expect(findHotkeyConflicts("Mod+Alt+KeyO", "overlay.toggle", {})).toEqual([]);
    expect(findHotkeyConflicts("Mod+Alt+KeyG", "overlay.toggle", {})).toEqual(["player.ghostMode"]);
    expect(findHotkeyConflicts("Mod+Alt+KeyP", "overlay.toggle", {})).toEqual([
      "games.openPinnedGlance",
    ]);
    expect(findHotkeyConflicts("Mod+Alt+Backquote", "overlay.toggle", {})).toEqual([]);
  });

  it("map ghost playback keys onto in-app player actions", () => {
    for (const { id, runs } of GHOST_PLAYBACK_ACTIONS) {
      expect(hotkeyAction(id).scope).toBe("system");
      expect(hotkeyAction(runs).scope).toBe("player");
    }
  });
});
