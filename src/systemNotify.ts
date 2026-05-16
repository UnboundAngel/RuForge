import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type BackgroundNotifyKind = "info" | "warning" | "error";

/**
 * Shows a RuForge-styled overlay notification (dedicated `notify` window).
 * Call from the main window when the app is in the background; replaces OS toasts.
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

/**
 * If the current (main) window is not focused, push a background overlay notification.
 * In-app `notify()` toasts stay unchanged for the focused case.
 */
export async function notifyWhenUnfocused(options: {
  title?: string;
  body: string;
  kind?: BackgroundNotifyKind;
}): Promise<void> {
  try {
    const win = getCurrentWindow();
    if (await win.isFocused()) return;
    await pushBackgroundNotification({
      title: options.title ?? "RuForge",
      body: options.body,
      kind: options.kind ?? "info",
    });
  } catch (e) {
    console.error("notifyWhenUnfocused:", e);
  }
}
