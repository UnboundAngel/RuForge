import { useRuforgeStore } from "../store/ruforgeStore";
import { isDebugCategoryEnabled } from "./debugCategories";

type DebugLogLevel = "debug" | "info" | "warn" | "error";

function consoleFn(level: DebugLogLevel): typeof console.log {
  switch (level) {
    case "debug":
      return console.debug.bind(console);
    case "info":
      return console.info.bind(console);
    case "warn":
      return console.warn.bind(console);
    case "error":
      return console.error.bind(console);
    default:
      return console.log.bind(console);
  }
}

/** Fast gate for frontend debug output; reads persisted enabled set from Zustand. */
export function debugLog(
  category: string,
  level: DebugLogLevel,
  message: string,
  ...args: unknown[]
): void {
  const enabled = useRuforgeStore.getState().settings.debugLogEnabledCategories;
  const set = new Set(enabled);
  if (!isDebugCategoryEnabled(set, category)) return;
  consoleFn(level)(`[RuForge:${category}]`, message, ...args);
}

/** Same gate without subscribing (for modules that cannot use hooks). */
export function debugLogFromSettings(
  enabledCategories: readonly string[],
  category: string,
  level: DebugLogLevel,
  message: string,
  ...args: unknown[]
): void {
  const set = new Set(enabledCategories);
  if (!isDebugCategoryEnabled(set, category)) return;
  consoleFn(level)(`[RuForge:${category}]`, message, ...args);
}
