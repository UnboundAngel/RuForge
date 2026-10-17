import { isMacPlatform } from "./shortcutLabels";

/**
 * Chord strings look like `Mod+Shift+KeyK`: modifiers in `Mod`, `Alt`, `Shift` order, then a
 * `KeyboardEvent.code`. `Mod` is Cmd on macOS and Ctrl elsewhere. Codes track the physical key so
 * Alt+digit still matches on macOS, where Option+digit types a symbol.
 */
export type HotkeyChord = string;

/**
 * Where an action listens. `library` is the Videos shell, `player` the video player and video mini.
 * `system` chords are registered with the OS and fire while another app has focus.
 */
export type HotkeyScope = "global" | "library" | "music" | "player" | "system";

export type HotkeyGroup = "app" | "library" | "music" | "player" | "ghost" | "games";

export type HotkeyActionId =
  | "app.openSettings"
  | "app.openShortcuts"
  | "app.switchMode"
  | "library.goVideos"
  | "library.goYoutube"
  | "library.toggleDownloader"
  | "library.search"
  | "library.toggleSidebar"
  | "music.goHome"
  | "music.goExplore"
  | "music.goLibrary"
  | "music.search"
  | "music.toggleNav"
  | "music.newPlaylist"
  | "player.playPause"
  | "player.seekBack"
  | "player.seekForward"
  | "player.prevChapter"
  | "player.nextChapter"
  | "player.volumeUp"
  | "player.volumeDown"
  | "player.mute"
  | "player.subtitles"
  | "player.fullscreen"
  | "player.loop"
  | "player.speedDown"
  | "player.speedUp"
  | "player.jumpStart"
  | "player.jumpEnd"
  | "player.ghostMode"
  | "ghost.playPause"
  | "ghost.seekBack"
  | "ghost.seekForward"
  | "ghost.prevChapter"
  | "ghost.nextChapter"
  | "ghost.loop"
  // Ids registered by `@games` (absent in public builds) stay valid without core naming them.
  | (string & {});

export type HotkeyAction = {
  id: HotkeyActionId;
  label: string;
  description: string;
  group: HotkeyGroup;
  scope: HotkeyScope;
  defaults: readonly HotkeyChord[];
};

/** Each action holds at most this many chords (primary + alternate). */
export const HOTKEY_MAX_BINDINGS = 2;

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  {
    id: "app.openSettings",
    label: "Open Settings",
    description: "Opens Settings, or closes it when it is already open.",
    group: "app",
    scope: "global",
    defaults: ["Mod+Comma"],
  },
  {
    id: "app.openShortcuts",
    label: "Keyboard shortcuts",
    description: "Opens this page.",
    group: "app",
    scope: "global",
    defaults: ["Mod+Slash"],
  },
  {
    id: "app.switchMode",
    label: "Switch Videos / Music",
    description: "Flips between the Videos and Music modes.",
    group: "app",
    scope: "global",
    defaults: ["Mod+Shift+KeyM"],
  },
  {
    id: "library.goVideos",
    label: "Go to Videos",
    description: "Shows your downloaded video library.",
    group: "library",
    scope: "library",
    defaults: ["Alt+Digit1"],
  },
  {
    id: "library.goYoutube",
    label: "Go to YouTube",
    description: "Opens the built-in YouTube browser.",
    group: "library",
    scope: "library",
    defaults: ["Alt+Digit2"],
  },
  {
    id: "library.toggleDownloader",
    label: "Open downloader",
    description: "Opens the downloader, or closes it when it is open.",
    group: "library",
    scope: "library",
    defaults: ["Mod+KeyD"],
  },
  {
    id: "library.search",
    label: "Search library",
    description: "Opens the title bar search and puts the cursor in it.",
    group: "library",
    scope: "library",
    defaults: ["Mod+KeyK"],
  },
  {
    id: "library.toggleSidebar",
    label: "Toggle sidebar",
    description: "Expands or collapses the left rail.",
    group: "library",
    scope: "library",
    defaults: ["Mod+KeyB"],
  },
  {
    id: "music.goHome",
    label: "Go to Home",
    description: "Music Home.",
    group: "music",
    scope: "music",
    defaults: ["Alt+Digit1"],
  },
  {
    id: "music.goExplore",
    label: "Go to Explore",
    description: "Browse YouTube Music.",
    group: "music",
    scope: "music",
    defaults: ["Alt+Digit2"],
  },
  {
    id: "music.goLibrary",
    label: "Go to Library",
    description: "Your songs, albums and playlists.",
    group: "music",
    scope: "music",
    defaults: ["Alt+Digit3"],
  },
  {
    id: "music.search",
    label: "Search",
    description: "Puts the cursor in the Music search bar.",
    group: "music",
    scope: "music",
    defaults: ["Mod+KeyK"],
  },
  {
    id: "music.toggleNav",
    label: "Toggle Your Library panel",
    description: "Expands or collapses the left panel.",
    group: "music",
    scope: "music",
    defaults: ["Mod+KeyB"],
  },
  {
    id: "music.newPlaylist",
    label: "New playlist",
    description: "Creates an empty playlist and opens it.",
    group: "music",
    scope: "music",
    defaults: ["Mod+KeyN"],
  },
  {
    id: "player.playPause",
    label: "Play / pause",
    description: "Video player and mini player.",
    group: "player",
    scope: "player",
    defaults: ["Space", "KeyK"],
  },
  {
    id: "player.seekBack",
    label: "Rewind 15 seconds",
    description: "Video player and mini player.",
    group: "player",
    scope: "player",
    defaults: ["ArrowLeft"],
  },
  {
    id: "player.seekForward",
    label: "Forward 15 seconds",
    description: "Video player and mini player.",
    group: "player",
    scope: "player",
    defaults: ["ArrowRight"],
  },
  {
    id: "player.prevChapter",
    label: "Previous chapter",
    description: "Only on videos with chapters.",
    group: "player",
    scope: "player",
    defaults: ["Shift+ArrowLeft"],
  },
  {
    id: "player.nextChapter",
    label: "Next chapter",
    description: "Only on videos with chapters.",
    group: "player",
    scope: "player",
    defaults: ["Shift+ArrowRight"],
  },
  {
    id: "player.volumeUp",
    label: "Volume up",
    description: "Raises volume by 10%.",
    group: "player",
    scope: "player",
    defaults: ["ArrowUp"],
  },
  {
    id: "player.volumeDown",
    label: "Volume down",
    description: "Lowers volume by 10%.",
    group: "player",
    scope: "player",
    defaults: ["ArrowDown"],
  },
  {
    id: "player.mute",
    label: "Mute",
    description: "Mutes or unmutes.",
    group: "player",
    scope: "player",
    defaults: ["KeyM"],
  },
  {
    id: "player.subtitles",
    label: "Subtitles",
    description: "Turns subtitles on or off.",
    group: "player",
    scope: "player",
    defaults: ["KeyC"],
  },
  {
    id: "player.fullscreen",
    label: "Fullscreen",
    description: "Enters or leaves fullscreen.",
    group: "player",
    scope: "player",
    defaults: ["KeyF"],
  },
  {
    id: "player.loop",
    label: "Loop mode",
    description: "Cycles off, loop all, loop one.",
    group: "player",
    scope: "player",
    defaults: ["KeyL"],
  },
  {
    id: "player.speedDown",
    label: "Slower",
    description: "Steps playback speed down.",
    group: "player",
    scope: "player",
    defaults: ["Comma", "Shift+Comma"],
  },
  {
    id: "player.speedUp",
    label: "Faster",
    description: "Steps playback speed up.",
    group: "player",
    scope: "player",
    defaults: ["Period", "Shift+Period"],
  },
  {
    id: "player.jumpStart",
    label: "Jump to start",
    description: "Seeks to the beginning.",
    group: "player",
    scope: "player",
    defaults: ["Home", "Digit0"],
  },
  {
    id: "player.jumpEnd",
    label: "Jump to end",
    description: "Seeks to the end.",
    group: "player",
    scope: "player",
    defaults: ["End"],
  },
  {
    id: "player.ghostMode",
    label: "Ghost mode",
    description: "Turns ghost mode on or off in the mini player. Works while another app is in front.",
    group: "ghost",
    scope: "system",
    defaults: ["Mod+Alt+KeyG"],
  },
  {
    id: "ghost.playPause",
    label: "Play / pause",
    description: "Only while ghost mode is on.",
    group: "ghost",
    scope: "system",
    defaults: ["Mod+Shift+Space"],
  },
  {
    id: "ghost.seekBack",
    label: "Rewind 15 seconds",
    description: "Only while ghost mode is on.",
    group: "ghost",
    scope: "system",
    defaults: ["Mod+Shift+ArrowLeft"],
  },
  {
    id: "ghost.seekForward",
    label: "Forward 15 seconds",
    description: "Only while ghost mode is on.",
    group: "ghost",
    scope: "system",
    defaults: ["Mod+Shift+ArrowRight"],
  },
  {
    id: "ghost.prevChapter",
    label: "Previous chapter",
    description: "Only while ghost mode is on. Rewinds 15 seconds on videos without chapters.",
    group: "ghost",
    scope: "system",
    defaults: ["Mod+Shift+Comma"],
  },
  {
    id: "ghost.nextChapter",
    label: "Next chapter",
    description: "Only while ghost mode is on. Skips 15 seconds on videos without chapters.",
    group: "ghost",
    scope: "system",
    defaults: ["Mod+Shift+Period"],
  },
  {
    id: "ghost.loop",
    label: "Loop mode",
    description: "Only while ghost mode is on.",
    group: "ghost",
    scope: "system",
    defaults: ["Mod+Shift+KeyL"],
  },
];

const registeredGamesIds = new Set<string>();

/** Called from `@games` on load so core never imports the Games barrel (ESM cycle). */
export function registerGamesHotkeyDefs(
  defs: readonly HotkeyAction[],
  group?: { id: HotkeyGroup; label: string; keywords: string },
): void {
  for (let i = HOTKEY_ACTIONS.length - 1; i >= 0; i--) {
    if (registeredGamesIds.has(HOTKEY_ACTIONS[i]!.id)) HOTKEY_ACTIONS.splice(i, 1);
  }
  registeredGamesIds.clear();
  for (const d of defs) registeredGamesIds.add(d.id);
  HOTKEY_ACTIONS.push(...defs);
  if (group && !HOTKEY_GROUPS.some((g) => g.id === group.id)) HOTKEY_GROUPS.push(group);
  ACTIONS_BY_ID.clear();
  for (const a of HOTKEY_ACTIONS) ACTIONS_BY_ID.set(a.id, a);
}

export const HOTKEY_GROUPS: Array<{ id: HotkeyGroup; label: string; keywords: string }> = [
  { id: "app", label: "App", keywords: "global settings mode" },
  { id: "library", label: "Videos mode", keywords: "navigation library downloader sidebar" },
  { id: "music", label: "Music mode", keywords: "navigation playlist" },
  { id: "player", label: "Player", keywords: "playback video seek volume" },
  {
    id: "ghost",
    label: "Ghost mode (system-wide)",
    keywords: "ghost click-through overlay game mini player global system-wide",
  },
];

/** System-wide playback keys and the in-app player action each one runs. */
export const GHOST_PLAYBACK_ACTIONS: ReadonlyArray<{
  id: HotkeyActionId;
  runs: HotkeyActionId;
}> = [
  { id: "ghost.playPause", runs: "player.playPause" },
  { id: "ghost.seekBack", runs: "player.seekBack" },
  { id: "ghost.seekForward", runs: "player.seekForward" },
  { id: "ghost.prevChapter", runs: "player.prevChapter" },
  { id: "ghost.nextChapter", runs: "player.nextChapter" },
  { id: "ghost.loop", runs: "player.loop" },
];

const ACTIONS_BY_ID = new Map<HotkeyActionId, HotkeyAction>(
  HOTKEY_ACTIONS.map((a) => [a.id, a]),
);

export function hotkeyAction(id: HotkeyActionId): HotkeyAction {
  return ACTIONS_BY_ID.get(id)!;
}

export function isHotkeyActionId(id: string): id is HotkeyActionId {
  return ACTIONS_BY_ID.has(id as HotkeyActionId);
}

/** Stored overrides only; an action missing from the map uses its defaults. */
export type HotkeyOverrides = Partial<Record<HotkeyActionId, HotkeyChord[]>>;

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
  "CapsLock",
  "Fn",
]);

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code);
}

type ChordEvent = Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/** `null` for a lone modifier, or when the non-primary modifier (Win key, or Ctrl on macOS) is down. */
export function chordFromEvent(e: ChordEvent): HotkeyChord | null {
  if (!e.code || isModifierCode(e.code)) return null;
  const mac = isMacPlatform();
  const mod = mac ? e.metaKey : e.ctrlKey;
  const other = mac ? e.ctrlKey : e.metaKey;
  if (other) return null;
  const parts: string[] = [];
  if (mod) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(e.code);
  return parts.join("+");
}

/** Every chord matcher in the app reads through here, so a stale saved string can never fire. */
export function normalizeChord(raw: unknown): HotkeyChord | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split("+").filter(Boolean);
  const code = parts.pop();
  if (!code || isModifierCode(code)) return null;
  const mods = new Set(parts);
  for (const m of mods) {
    if (m !== "Mod" && m !== "Alt" && m !== "Shift") return null;
  }
  const out: string[] = [];
  if (mods.has("Mod")) out.push("Mod");
  if (mods.has("Alt")) out.push("Alt");
  if (mods.has("Shift")) out.push("Shift");
  out.push(code);
  return out.join("+");
}

export function normalizeHotkeyOverrides(raw: unknown): HotkeyOverrides {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: HotkeyOverrides = {};
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    // Keep known actions and orphan Games ids (public/stub builds omit GAMES_HOTKEY_DEFS).
    if (!isHotkeyActionId(id) && !/^[a-z]+(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(id)) continue;
    const chords: HotkeyChord[] = [];
    for (const c of list) {
      const n = normalizeChord(c);
      if (n && !chords.includes(n)) chords.push(n);
    }
    (out as Record<string, HotkeyChord[]>)[id] = chords.slice(0, HOTKEY_MAX_BINDINGS);
  }
  return out;
}

export function resolveBindings(
  id: HotkeyActionId,
  overrides: HotkeyOverrides | undefined,
): readonly HotkeyChord[] {
  return overrides?.[id] ?? hotkeyAction(id).defaults;
}

export function isBindingCustomized(
  id: HotkeyActionId,
  overrides: HotkeyOverrides | undefined,
): boolean {
  const own = overrides?.[id];
  if (!own) return false;
  const defaults = hotkeyAction(id).defaults;
  return own.length !== defaults.length || own.some((c, i) => c !== defaults[i]);
}

export function scopesOverlap(a: HotkeyScope, b: HotkeyScope): boolean {
  // The OS hands a registered chord to RuForge before any window sees it, so it shadows every scope.
  if (a === b || a === "global" || b === "global" || a === "system" || b === "system") return true;
  // The video player lives inside the Videos shell, so both handlers see the same keys.
  return (a === "library" && b === "player") || (a === "player" && b === "library");
}

/** Other actions that would also fire on `chord` in an overlapping scope. */
export function findHotkeyConflicts(
  chord: HotkeyChord,
  forId: HotkeyActionId,
  overrides: HotkeyOverrides | undefined,
): HotkeyActionId[] {
  const scope = hotkeyAction(forId).scope;
  return HOTKEY_ACTIONS.filter(
    (a) =>
      a.id !== forId &&
      scopesOverlap(a.scope, scope) &&
      resolveBindings(a.id, overrides).includes(chord),
  ).map((a) => a.id);
}

const RESERVED_CHORDS = new Set<HotkeyChord>([
  "Escape",
  "Tab",
  "Shift+Tab",
  "Enter",
  "F5",
  "F12",
  "Alt+F4",
  "Mod+KeyA",
  "Mod+KeyC",
  "Mod+KeyV",
  "Mod+KeyX",
  "Mod+KeyZ",
  "Mod+KeyY",
  "Mod+Shift+KeyZ",
  "Mod+KeyR",
  "Mod+KeyW",
  "Mod+KeyQ",
]);

/** Keys the app, text fields, or Windows already own; recording refuses them. */
export function isReservedChord(chord: HotkeyChord): boolean {
  return RESERVED_CHORDS.has(chord);
}

/** A bare or Shift-only system-wide chord would take a plain key away from the game in front. */
export function chordFitsScope(chord: HotkeyChord, scope: HotkeyScope): boolean {
  if (scope !== "system") return true;
  const mods = chord.split("+").slice(0, -1);
  return mods.includes("Mod") || mods.includes("Alt");
}

/** Accelerator string for the global-shortcut plugin; it parses `KeyboardEvent.code` names. */
export function chordToAccelerator(chord: HotkeyChord): string {
  return chord
    .split("+")
    .map((part) => (part === "Mod" ? "CommandOrControl" : part))
    .join("+");
}

const CODE_LABELS: Record<string, string> = {
  Space: "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Escape: "Esc",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Del",
  Insert: "Ins",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Home: "Home",
  End: "End",
  Tab: "Tab",
  NumpadAdd: "Num +",
  NumpadSubtract: "Num -",
  NumpadMultiply: "Num *",
  NumpadDivide: "Num /",
  NumpadDecimal: "Num .",
  NumpadEnter: "Num Enter",
};

export function codeLabel(code: string): string {
  if (CODE_LABELS[code]) return CODE_LABELS[code]!;
  const key = code.match(/^Key([A-Z])$/);
  if (key) return key[1]!;
  const digit = code.match(/^Digit(\d)$/);
  if (digit) return digit[1]!;
  const num = code.match(/^Numpad(\d)$/);
  if (num) return `Num ${num[1]}`;
  return code;
}

function modifierLabel(m: string): string {
  const mac = isMacPlatform();
  if (m === "Mod") return mac ? "⌘" : "Ctrl";
  if (m === "Alt") return mac ? "⌥" : "Alt";
  if (m === "Shift") return mac ? "⇧" : "Shift";
  return m;
}

/** One label per key, for keycap rendering. */
export function chordKeyLabels(chord: HotkeyChord): string[] {
  const parts = chord.split("+");
  const code = parts.pop() ?? "";
  return [...parts.map(modifierLabel), codeLabel(code)];
}

/** Tooltip text, e.g. `Ctrl+Shift+M`. */
export function formatChord(chord: HotkeyChord): string {
  return chordKeyLabels(chord).join("+");
}
