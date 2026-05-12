import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const DEFAULT_TITLE = "RuForge";

/**
 * Windows toasts only show the real app name/icon when the app is installed (not from `npm run tauri dev`,
 * where the parent process is often PowerShell). Title/body here still show correctly inside the toast.
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
