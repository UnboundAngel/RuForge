import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isRuforgeAppInForeground } from "./appWindowFocus";
import type { RuforgeNotification } from "./store/ruforgeStore";

export type BackgroundNotifyKind = "info" | "warning" | "error";

const DEDUPE_TTL_MS = 20_000;
const recentByKey = new Map<string, number>();

function pruneDedupe(now: number): void {
  if (recentByKey.size < 128) return;
  for (const [key, at] of recentByKey) {
    if (now - at >= DEDUPE_TTL_MS) recentByKey.delete(key);
  }
}

/** Drop rapid duplicate user notifications (same dedupe key within TTL). */
export function claimUserNotification(dedupeKey: string): boolean {
  const now = Date.now();
  const last = recentByKey.get(dedupeKey);
  if (last != null && now - last < DEDUPE_TTL_MS) return false;
  recentByKey.set(dedupeKey, now);
  pruneDedupe(now);
  return true;
}

/**
 * Shows a RuForge-styled overlay notification (dedicated `notify` window).
 * Prefer {@link deliverUserNotification} so in-app vs overlay stays mutually exclusive.
 */
export async function pushBackgroundNotification(options: {
  title: string;
  body: string;
  kind?: BackgroundNotifyKind;
}): Promise<void> {
  await invoke("push_background_notify", {
    title: options.title,
    body: options.body,
    kind: options.kind ?? "info",
  });
}

async function isAnyRuforgeWindowFocused(): Promise<boolean> {
  if (isRuforgeAppInForeground()) return true;
  try {
    const current = getCurrentWindow();
    if (await current.isFocused()) return true;
    if (current.label === "main") {
      const mini = await WebviewWindow.getByLabel("mini");
      if (mini && (await mini.isFocused())) return true;
    }
    if (current.label === "mini") {
      const main = await WebviewWindow.getByLabel("main");
      if (main && (await main.isFocused())) return true;
    }
  } catch {
    /* non-Tauri / test */
  }
  return false;
}

export type DeliverUserNotificationOptions = {
  /** Stable key for dedupe (e.g. `download-finished:${jobId}`). Defaults to `body`. */
  dedupeKey?: string;
  title?: string;
  body: string;
  kind?: BackgroundNotifyKind;
  /** In-app toast copy when foreground; defaults to `body`. */
  inAppBody?: string;
  inAppType?: RuforgeNotification["type"];
};

/**
 * Single entry for user-visible notifications: in-app toast when RuForge is
 * foreground, overlay when not — never both.
 */
export async function deliverUserNotification(
  options: DeliverUserNotificationOptions,
  inAppNotify: (message: string, type?: RuforgeNotification["type"]) => void,
): Promise<void> {
  const dedupeKey = options.dedupeKey ?? options.body;
  if (!claimUserNotification(dedupeKey)) return;

  const kind = options.kind ?? "info";
  const inAppType =
    options.inAppType ??
    (kind === "error" ? "error" : kind === "warning" ? "warning" : "info");
  const inAppBody = options.inAppBody ?? options.body;

  if (await isAnyRuforgeWindowFocused()) {
    inAppNotify(inAppBody, inAppType);
    return;
  }

  try {
    await pushBackgroundNotification({
      title: options.title ?? "RuForge",
      body: options.body,
      kind,
    });
  } catch (e) {
    console.error("deliverUserNotification overlay:", e);
    inAppNotify(inAppBody, inAppType);
  }
}
