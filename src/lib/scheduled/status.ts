import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { scheduledFeatureIds } from "./registry";

/** Rust owns the unlock decision (server date, server overrides, dev override). */
type StatusRow = { id: string; unlocked: boolean };

const REFRESH_MS = 10 * 60 * 1000;

let unlocked: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
let started = false;

async function refresh() {
  let rows: StatusRow[] = [];
  try {
    rows = await invoke<StatusRow[]>("scheduled_status");
  } catch {
    rows = [];
  }
  const next = new Set(rows.filter((r) => r.unlocked).map((r) => r.id));
  if (next.size === unlocked.size && [...next].every((id) => unlocked.has(id))) return;
  unlocked = next;
  for (const l of listeners) l();
}

// Polling covers an app left open across the unlock midnight.
function start() {
  if (started || scheduledFeatureIds().length === 0) return;
  started = true;
  void refresh();
  window.setInterval(() => void refresh(), REFRESH_MS);
  window.addEventListener("focus", () => void refresh());
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => unlocked;

export function useScheduledUnlocked(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Calls a scheduled feature's Rust side; Rust refuses while the feature is locked. */
export function invokeScheduled<T>(id: string, method: string, args: unknown = null): Promise<T> {
  return invoke<T>("scheduled_invoke", { id, method, args });
}
