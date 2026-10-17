import { useEffect, useRef } from "react";
import { register, unregister, type ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
import { chordToAccelerator, type HotkeyChord } from "../lib/hotkeys";

export type SystemShortcut = { chord: HotkeyChord; run: () => void };

let opQueue: Promise<unknown> = Promise.resolve();

/** A cleanup's unregister must land before the next effect's register of the same chord. */
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const next = opQueue.then(op, op);
  opQueue = next.catch(() => undefined);
  return next;
}

async function registerChord(accelerator: string, handler: (e: ShortcutEvent) => void): Promise<void> {
  try {
    await register(accelerator, handler);
  } catch {
    // A reloaded mini webview leaves its old registration behind in this process; clear it and
    // retry once. If another app owns the chord, the retry fails too.
    await unregister(accelerator).catch(() => undefined);
    await register(accelerator, handler);
  }
}

/**
 * Holds `shortcuts` with the OS only while `active`. Chords another app already owns are passed
 * to `onTaken` once per activation.
 */
export function useSystemShortcuts(
  active: boolean,
  shortcuts: readonly SystemShortcut[],
  onTaken: (chords: HotkeyChord[]) => void,
): void {
  const runsRef = useRef(new Map<string, () => void>());
  runsRef.current = new Map(shortcuts.map((s) => [chordToAccelerator(s.chord), s.run]));
  const onTakenRef = useRef(onTaken);
  onTakenRef.current = onTaken;

  const key = active ? [...new Set(shortcuts.map((s) => s.chord))].join("|") : "";

  useEffect(() => {
    if (!key) return;
    let disposed = false;
    const held: string[] = [];
    const taken: HotkeyChord[] = [];

    const work = key.split("|").map((chord) => {
      const accelerator = chordToAccelerator(chord);
      const handler = (e: ShortcutEvent) => {
        if (e.state === "Pressed") runsRef.current.get(accelerator)?.();
      };
      return enqueue(async () => {
        if (disposed) return;
        try {
          await registerChord(accelerator, handler);
          held.push(accelerator);
        } catch {
          taken.push(chord);
        }
      });
    });

    void Promise.all(work).then(() => {
      if (!disposed && taken.length > 0) onTakenRef.current(taken);
    });

    return () => {
      disposed = true;
      void enqueue(async () => {
        for (const accelerator of held.splice(0)) {
          await unregister(accelerator).catch(() => undefined);
        }
      });
    };
  }, [key]);
}
