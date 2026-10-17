import { useEffect, useState } from "react";
import { create } from "zustand";
import { Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  chordFitsScope,
  chordFromEvent,
  chordKeyLabels,
  formatChord,
  hotkeyAction,
  HOTKEY_MAX_BINDINGS,
  isBindingCustomized,
  isModifierCode,
  isReservedChord,
  resolveBindings,
  type HotkeyActionId,
} from "@/lib/hotkeys";
import { isMacPlatform } from "@/lib/shortcutLabels";
import {
  assignHotkey,
  clearHotkeySlot,
  hotkeyActionLabel,
  resetHotkey,
  restoreHotkeyOverrides,
  setHotkeyRecording,
  snapshotHotkeyOverrides,
  useHotkeyOverrides,
} from "@/hooks/useHotkeys";

type RecordTarget = { id: HotkeyActionId; slot: number };

/** One row records at a time; starting another cancels the first. */
const useHotkeyRecorder = create<{
  target: RecordTarget | null;
  start: (t: RecordTarget) => void;
  stop: () => void;
}>((set) => ({
  target: null,
  start: (target) => {
    setHotkeyRecording(true);
    set({ target });
  },
  stop: () => {
    setHotkeyRecording(false);
    set({ target: null });
  },
}));

/** Settings calls this on close and tab change so a half-finished record never leaves hotkeys muted. */
export function stopHotkeyRecording(): void {
  if (useHotkeyRecorder.getState().target) useHotkeyRecorder.getState().stop();
}

/** Keycap tokens for mouse gestures; pass them in `labels` like any key name. */
export const MOUSE_SCROLL = "mouse:scroll";
export const MOUSE_DRAG = "mouse:drag";
export const MOUSE_DOUBLE_CLICK = "mouse:doubleClick";
export const MOUSE_RIGHT_CLICK = "mouse:rightClick";

type MousePart = "wheel" | "left" | "right";

const MOUSE_GESTURES: Record<string, { label: string; part: MousePart }> = {
  [MOUSE_SCROLL]: { label: "Scroll", part: "wheel" },
  [MOUSE_DRAG]: { label: "Drag", part: "left" },
  [MOUSE_DOUBLE_CLICK]: { label: "Double-click", part: "left" },
  [MOUSE_RIGHT_CLICK]: { label: "Right-click", part: "right" },
};

function MouseGlyph({ part }: { part: MousePart }) {
  return (
    <svg viewBox="0 0 12 16" className="rf-hotkey-mouse" aria-hidden>
      {part === "left" ? <path className="rf-hotkey-mouse-hit" d="M6 .75A5.25 5.25 0 0 0 .75 6H6Z" /> : null}
      {part === "right" ? <path className="rf-hotkey-mouse-hit" d="M6 .75A5.25 5.25 0 0 1 11.25 6H6Z" /> : null}
      <rect className="rf-hotkey-mouse-body" x=".75" y=".75" width="10.5" height="14.5" rx="5.25" />
      <path className="rf-hotkey-mouse-body" d="M.75 6h10.5M6 .75V6" />
      {part === "wheel" ? <rect className="rf-hotkey-mouse-hit" x="5" y="2.25" width="2" height="3.25" rx="1" /> : null}
    </svg>
  );
}

export function HotkeyKeycaps({ labels }: { labels: readonly string[] }) {
  return (
    <span className="flex items-center gap-1">
      {labels.map((label, i) => {
        const gesture = MOUSE_GESTURES[label];
        return gesture ? (
          <kbd key={`${label}-${i}`} className="rf-hotkey-cap rf-hotkey-cap--mouse">
            <MouseGlyph part={gesture.part} />
            {gesture.label}
          </kbd>
        ) : (
          <kbd key={`${label}-${i}`} className="rf-hotkey-cap">
            {label}
          </kbd>
        );
      })}
    </span>
  );
}

/** Keys the app owns and does not let you rebind, shown read-only in the same keycap style. */
export function FixedHotkeyKeys({ combos }: { combos: readonly (readonly string[])[] }) {
  return (
    <div className="rf-hotkey-control" data-tooltip="Built in, cannot be changed">
      {combos.map((labels, i) => (
        <span key={i} className="rf-hotkey-chip rf-hotkey-chip--static">
          <HotkeyKeycaps labels={labels} />
        </span>
      ))}
      <span className="rf-hotkey-reset-slot" aria-hidden />
    </div>
  );
}

function liveModifierLabels(mods: { mod: boolean; alt: boolean; shift: boolean }): string[] {
  const mac = isMacPlatform();
  const out: string[] = [];
  if (mods.mod) out.push(mac ? "⌘" : "Ctrl");
  if (mods.alt) out.push(mac ? "⌥" : "Alt");
  if (mods.shift) out.push(mac ? "⇧" : "Shift");
  return out;
}

function useRecordingKeys(target: RecordTarget | null): string[] {
  const [mods, setMods] = useState({ mod: false, alt: false, shift: false });
  const stop = useHotkeyRecorder((s) => s.stop);
  const notify = useRuforgeStore((s) => s.notify);

  useEffect(() => {
    if (!target) return;
    setMods({ mod: false, alt: false, shift: false });
    const mac = isMacPlatform();
    const readMods = (e: KeyboardEvent) =>
      setMods({ mod: mac ? e.metaKey : e.ctrlKey, alt: e.altKey, shift: e.shiftKey });

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      const bare = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (bare && e.code === "Escape") {
        stop();
        return;
      }
      if (bare && (e.code === "Backspace" || e.code === "Delete")) {
        const own = resolveBindings(target.id, snapshotHotkeyOverrides());
        if (target.slot < own.length) clearHotkeySlot(target.id, target.slot);
        stop();
        return;
      }
      if (isModifierCode(e.code)) {
        readMods(e);
        return;
      }
      const chord = chordFromEvent(e);
      if (!chord) return;
      if (isReservedChord(chord)) {
        notify(`${formatChord(chord)} is reserved. Pick another key.`, "warning");
        return;
      }
      if (!chordFitsScope(chord, hotkeyAction(target.id).scope)) {
        notify("System-wide shortcuts need Ctrl or Alt, so other apps keep their keys.", "warning");
        return;
      }
      const before = snapshotHotkeyOverrides();
      const stolen = assignHotkey(target.id, target.slot, chord);
      stop();
      if (stolen.length > 0) {
        const from = stolen.map(hotkeyActionLabel).join(", ");
        notify(`${formatChord(chord)} moved here from ${from}.`, "info", {
          label: "Undo",
          run: () => restoreHotkeyOverrides(before),
        });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      readMods(e);
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("[data-hotkey-recording]")) return;
      stop();
    };
    const onBlur = () => stop();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [target, stop, notify]);

  return liveModifierLabels(mods);
}

function RecordingChip({ target }: { target: RecordTarget }) {
  const held = useRecordingKeys(target);
  const stop = useHotkeyRecorder((s) => s.stop);
  return (
    <button
      type="button"
      data-hotkey-recording
      onClick={stop}
      className="rf-hotkey-chip rf-hotkey-chip--recording"
      aria-label="Recording. Press a key combination, Escape to cancel, Backspace to clear."
      data-tooltip="Esc cancels, Backspace clears"
    >
      {held.length > 0 ? <HotkeyKeycaps labels={held} /> : null}
      <span className="rf-hotkey-recording-hint">{held.length > 0 ? "+ key" : "Press keys"}</span>
    </button>
  );
}

export function HotkeyBindingControl({ id }: { id: HotkeyActionId }) {
  const overrides = useHotkeyOverrides();
  const target = useHotkeyRecorder((s) => s.target);
  const start = useHotkeyRecorder((s) => s.start);
  const bindings = resolveBindings(id, overrides);
  const customized = isBindingCustomized(id, overrides);
  const recordingSlot = target?.id === id ? target.slot : null;
  const label = hotkeyActionLabel(id);

  const slots: Array<{ slot: number; chord: string | null }> = bindings.map((chord, slot) => ({
    slot,
    chord,
  }));
  if (bindings.length < HOTKEY_MAX_BINDINGS) slots.push({ slot: bindings.length, chord: null });

  return (
    <div className="rf-hotkey-control">
      {slots.map(({ slot, chord }) => {
        if (target && recordingSlot === slot) {
          return <RecordingChip key={`rec-${slot}`} target={target} />;
        }
        if (chord) {
          return (
            <button
              key={chord}
              type="button"
              onClick={() => start({ id, slot })}
              className="rf-hotkey-chip"
              aria-label={`${label}: ${formatChord(chord)}. Click to change.`}
              data-tooltip="Click to change"
            >
              <HotkeyKeycaps labels={chordKeyLabels(chord)} />
            </button>
          );
        }
        const empty = bindings.length === 0;
        return (
          <button
            key={`add-${slot}`}
            type="button"
            onClick={() => start({ id, slot })}
            className={cn("rf-hotkey-chip rf-hotkey-chip--add", empty && "rf-hotkey-chip--unset")}
            aria-label={empty ? `Set a shortcut for ${label}` : `Add another shortcut for ${label}`}
            data-tooltip={empty ? "Set shortcut" : "Add alternate"}
          >
            {empty ? <span>Not set</span> : <Plus size={13} aria-hidden />}
          </button>
        );
      })}
      <span className="rf-hotkey-reset-slot">
        {customized ? (
          <button
            type="button"
            onClick={() => resetHotkey(id)}
            className="rf-hotkey-reset"
            aria-label={`Reset ${label} to default`}
            data-tooltip="Reset to default"
          >
            <RotateCcw size={13} aria-hidden />
          </button>
        ) : null}
      </span>
    </div>
  );
}
