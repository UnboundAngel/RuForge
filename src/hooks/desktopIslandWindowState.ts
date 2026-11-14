import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type MainWindowState = { away: boolean; focused: boolean };

export async function readMainWindowState(): Promise<MainWindowState> {
  const win = getCurrentWindow();
  // Layout editor hides main on purpose; do not treat that as tray-away or the island pops over it.
  try {
    if (await invoke<boolean>("layout_editor_active")) {
      return { away: false, focused: true };
    }
  } catch {
    /* ignore */
  }
  let minimized = false;
  let visible = true;
  let focused = true;
  try {
    minimized = await win.isMinimized();
  } catch {
    /* ignore */
  }
  try {
    visible = await win.isVisible();
  } catch {
    /* ignore */
  }
  try {
    focused = await invoke<boolean>("app_is_foreground");
  } catch {
    try {
      focused = await win.isFocused();
    } catch {
      /* ignore */
    }
  }
  const away = minimized || !visible;
  return { away, focused: focused && !away };
}
