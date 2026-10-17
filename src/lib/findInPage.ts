import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import "./findEngine.js";

export type FindResult = { index: number; count: number };

/** `app` searches RuForge's own page; `glance` the page open in the glance viewer. */
export type FindTarget = "app" | "glance";

declare global {
  interface Window {
    __rfFind?: { run: (term: string, step: number) => FindResult; clear: () => void };
  }
}

/** Where the bar's top-right corner sits, in window pixels. */
export type FindAnchor = { top: number; right: number };

type FindBarState = {
  open: boolean;
  target: FindTarget;
  anchor: FindAnchor | null;
  /** Bumped on every Ctrl+F so a second press refocuses the open bar. */
  seq: number;
};

export const useFindBar = create<FindBarState>(() => ({ open: false, target: "app", anchor: null, seq: 0 }));

export function openFindBar(target: FindTarget, anchor: FindAnchor | null = null): void {
  const prev = useFindBar.getState();
  if (prev.open && prev.target !== target) void stopFind(prev.target);
  useFindBar.setState({ open: true, target, anchor, seq: prev.seq + 1 });
}

export function closeFindBar(): void {
  const { open, target } = useFindBar.getState();
  if (!open) return;
  useFindBar.setState({ open: false });
  void stopFind(target);
}

const NONE: FindResult = { index: 0, count: 0 };

export async function runFind(target: FindTarget, term: string, step: number): Promise<FindResult> {
  if (target === "glance") {
    return invoke<FindResult | null>("glance_find", { term, step })
      .then((r) => r ?? NONE)
      .catch(() => NONE);
  }
  return window.__rfFind?.run(term, step) ?? NONE;
}

async function stopFind(target: FindTarget): Promise<void> {
  if (target === "glance") await invoke("glance_find_stop").catch(() => {});
  else window.__rfFind?.clear();
}
