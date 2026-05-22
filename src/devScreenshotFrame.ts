import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

type ScreenshotFrameApi = {
  /** Resize main window for a 16:9 capture (default 1200×675). */
  frame: (width?: number, height?: number, lockResize?: boolean) => Promise<void>;
  /** 1280×720 variant. */
  frameHd: () => Promise<void>;
  /** Restore default resizable window (does not restore prior size). */
  unlock: () => Promise<void>;
};

declare global {
  interface Window {
    ruforgeScreenshot?: ScreenshotFrameApi;
  }
}

export function installDevScreenshotFrame(): void {
  if (!import.meta.env.DEV) return;

  const api: ScreenshotFrameApi = {
    async frame(width = 1200, height = 675, lockResize = true) {
      const win = getCurrentWindow();
      if (win.label !== "main") {
        console.warn("ruforgeScreenshot.frame: switch to the main RuForge window first.");
        return;
      }
      if (await win.isMaximized()) await win.unmaximize();
      await win.setSize(new LogicalSize(width, height));
      await win.setResizable(!lockResize);
      console.log(
        `RuForge window: ${width}×${height}${lockResize ? " (resize locked)" : ""}. ` +
          "Capture with Win+Shift+S or Snipping Tool. Run ruforgeScreenshot.unlock() when done.",
      );
    },
    async frameHd() {
      await api.frame(1280, 720, true);
    },
    async unlock() {
      const win = getCurrentWindow();
      await win.setResizable(true);
      console.log("RuForge window: resizing enabled again.");
    },
  };

  window.ruforgeScreenshot = api;
  console.log(
    "Screenshot helpers ready: ruforgeScreenshot.frame() · ruforgeScreenshot.frameHd() · ruforgeScreenshot.unlock()",
  );
}
