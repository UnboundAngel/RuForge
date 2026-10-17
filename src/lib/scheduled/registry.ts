import type { ComponentType } from "react";

/**
 * Mount points core code exposes to scheduled features. Names stay generic: they ship on public
 * while the feature behind them does not. Add a slot here, then render `<ScheduledSlot>` at it.
 */
export interface ScheduledSlots {
  /** Extra content at the end of the stats recap. */
  "recap.extra": { year: number };
}

export type ScheduledSlotName = keyof ScheduledSlots;

export type ScheduledFeatureModule = {
  slots?: { [K in ScheduledSlotName]?: ComponentType<ScheduledSlots[K]> };
};

type Loader = () => Promise<{ default: ScheduledFeatureModule }>;

// Lazy so a locked feature's code never runs. On public the folder is absent and this is empty.
const loaders = import.meta.glob<{ default: ScheduledFeatureModule }>("../../scheduled/*/index.{ts,tsx}");

export function featureIdFromPath(path: string): string | null {
  const m = /\/scheduled\/([^/]+)\/index\.tsx?$/.exec(path);
  return m ? m[1] : null;
}

const byId = new Map<string, Loader>();
for (const [path, load] of Object.entries(loaders)) {
  const id = featureIdFromPath(path);
  if (id) byId.set(id, load);
}

export function scheduledFeatureIds(): string[] {
  return [...byId.keys()];
}

const loaded = new Map<string, Promise<ScheduledFeatureModule>>();

export function loadScheduledFeature(id: string): Promise<ScheduledFeatureModule> | null {
  const load = byId.get(id);
  if (!load) return null;
  let p = loaded.get(id);
  if (!p) {
    p = load().then((m) => m.default);
    loaded.set(id, p);
  }
  return p;
}
