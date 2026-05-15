import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const DEFAULT_TITLE = "RuForge";

/**
 * Windows toasts use the process AppUserModelID for the header (see `set_windows_notification_app_id` in
 * src-tauri). Installed builds also need a Start Menu shortcut with the same ID for the display name/icon.
 */
export async function notifyWhenUnfocused(options: {
  body: string;
  title?: string;
}): Promise<void> {
  try {
    const win = getCurrentWindow();
    if (await win.isFocused()) return;

    let ok = await isPermissionGranted();
    if (!ok) {
      const p = await requestPermission();
      ok = p === "granted";
    }
    if (!ok) return;

    await sendNotification({
      title: options.title ?? DEFAULT_TITLE,
      body: options.body,
    });
  } catch (e) {
    console.error("notifyWhenUnfocused:", e);
  }
}
