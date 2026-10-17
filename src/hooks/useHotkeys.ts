import { useRuforgeStore } from "../store/ruforgeStore";
import { loadMergedSettings } from "../store/types";
import { bumpCounter } from "@/lib/activityLog";
import {
  chordFromEvent,
  findHotkeyConflicts,
  formatChord,
  hotkeyAction,
  HOTKEY_MAX_BINDINGS,
  resolveBindings,
  type HotkeyActionId,
  type HotkeyChord,
  type HotkeyOverrides,
} from "../lib/hotkeys";

let recording = false;

/** While a Shortcuts row is recording, no action may fire on the keys being captured. */
export function setHotkeyRecording(active: boolean): void {
  recording = active;
}

export function isHotkeyRecording(): boolean {
  return recording;
}

export function isTypingTarget(target: EventTarget | null = document.activeElement): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Set only in mini windows, from localStorage; main reads its live store. */
let storageOverrides: HotkeyOverrides | null = null;

function overrides(): HotkeyOverrides {
  return storageOverrides ?? useRuforgeStore.getState().settings.hotkeyBindings;
}

export function hotkeyBindings(id: HotkeyActionId): readonly HotkeyChord[] {
  return resolveBindings(id, overrides());
}

const TEXT_EDIT_CODES = /^(Arrow\w+|Home|End|Backspace|Delete|PageUp|PageDown)$/;

/** In a text field only Ctrl/Alt chords that are not caret or delete keys may fire. */
function chordAllowedWhileTyping(chord: HotkeyChord): boolean {
  const parts = chord.split("+");
  const code = parts[parts.length - 1]!;
  return (parts.includes("Mod") || parts.includes("Alt")) && !TEXT_EDIT_CODES.test(code);
}

/**
 * First action in `ids` bound to this event, or null. Skips while recording, and inside text
 * fields unless the chord is a Ctrl/Alt combination.
 */
export function matchHotkeyEvent<T extends HotkeyActionId>(
  e: KeyboardEvent,
  ids: readonly T[],
): T | null {
  if (recording || e.isComposing) return null;
  const chord = chordFromEvent(e);
  if (!chord) return null;
  if (isTypingTarget() && !chordAllowedWhileTyping(chord)) return null;
  const o = overrides();
  for (const id of ids) {
    if (resolveBindings(id, o).includes(chord)) {
      bumpCounter(`hotkey:${id}`);
      return id;
    }
  }
  return null;
}

export function useHotkeyOverrides(): HotkeyOverrides {
  return useRuforgeStore((s) => s.settings.hotkeyBindings);
}

/** Primary binding as tooltip text (`Ctrl+K`), or null when the action is unbound. */
export function useHotkeyLabel(id: HotkeyActionId): string | null {
  const first = useRuforgeStore((s) => resolveBindings(id, s.settings.hotkeyBindings)[0]);
  return first ? formatChord(first) : null;
}

/** `Label (Ctrl+K)` when bound, plain label otherwise. */
export function useHotkeyTooltip(label: string, id: HotkeyActionId): string {
  const key = useHotkeyLabel(id);
  return key ? `${label} (${key})` : label;
}

function writeOverrides(next: HotkeyOverrides): void {
  void useRuforgeStore.getState().updateSetting("hotkeyBindings", next);
}

/**
 * Sets one slot. Any other action in an overlapping scope that already used `chord` loses it.
 * Returns the actions that lost the chord so the caller can say so.
 */
export function assignHotkey(
  id: HotkeyActionId,
  slot: number,
  chord: HotkeyChord,
): HotkeyActionId[] {
  const current = overrides();
  const next: HotkeyOverrides = { ...current };
  const stolen = findHotkeyConflicts(chord, id, current);
  for (const other of stolen) {
    next[other] = resolveBindings(other, current).filter((c) => c !== chord);
  }
  const own = [...resolveBindings(id, current)];
  const at = Math.min(slot, own.length);
  own[at] = chord;
  next[id] = own.filter((c, i) => c !== chord || i === at).slice(0, HOTKEY_MAX_BINDINGS);
  writeOverrides(next);
  return stolen;
}

export function clearHotkeySlot(id: HotkeyActionId, slot: number): void {
  const current = overrides();
  const own = [...resolveBindings(id, current)];
  own.splice(slot, 1);
  writeOverrides({ ...current, [id]: own });
}

export function resetHotkey(id: HotkeyActionId): void {
  const next: HotkeyOverrides = { ...overrides() };
  delete next[id];
  writeOverrides(next);
}

export function resetAllHotkeys(): void {
  writeOverrides({});
}

export function snapshotHotkeyOverrides(): HotkeyOverrides {
  return overrides();
}

export function restoreHotkeyOverrides(snapshot: HotkeyOverrides): void {
  writeOverrides(snapshot);
}

export function hotkeyActionLabel(id: HotkeyActionId): string {
  return hotkeyAction(id).label;
}

let storageSyncInstalled = false;

/**
 * Mini windows: follow rebinds the main window saves to localStorage. Kept out of the store so
 * the mini's persist layer never writes its stale settings copy back.
 */
export function installHotkeyStorageSync(): void {
  if (storageSyncInstalled || typeof window === "undefined") return;
  storageSyncInstalled = true;
  storageOverrides = loadMergedSettings().hotkeyBindings;
  window.addEventListener("storage", (e) => {
    if (e.key !== "ruforge-settings") return;
    storageOverrides = loadMergedSettings().hotkeyBindings;
  });
}
