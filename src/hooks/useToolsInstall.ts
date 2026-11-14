import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { askConfirm } from "@/components/ConfirmDialog";
import {
  applyDenoProgress,
  applyToolsProgress,
  applyYtdlpUpdateProgress,
  installTools,
  isToolsInstalling,
  refreshToolsStatus,
} from "@/lib/toolsInstallFlow";
import { toolsMissing, type ToolsInstallProgress } from "@/store/toolsInstallStore";

// "Later" holds until the next launch, so the flag lives for the page session only.
let promptedThisSession = false;

const PROMPT_DELAY_MS = 1500;

/** Mount once at the app root. Tracks the tools install and offers it at launch when tools are missing. */
export function useToolsInstall(): void {
  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    let promptTimer: number | undefined;

    void (async () => {
      const registered = await Promise.all([
        listen<ToolsInstallProgress>("tools-install-progress", (e) => applyToolsProgress(e.payload)),
        listen<{ phase: string; percent?: number | null }>("ytdlp-update-download-progress", (e) =>
          applyYtdlpUpdateProgress(e.payload),
        ),
        listen<{ phase: string; percent?: number | null }>("deno-download-progress", (e) =>
          void applyDenoProgress(e.payload),
        ),
      ]);
      if (disposed) {
        registered.forEach((un) => un());
        return;
      }
      unlisteners.push(...registered);

      const status = await refreshToolsStatus();
      if (disposed || !status || !toolsMissing(status) || status.installing) return;
      if (promptedThisSession) return;
      promptedThisSession = true;
      // The confirm host mounts with the app; asking too early would resolve as declined.
      promptTimer = window.setTimeout(() => {
        if (isToolsInstalling()) return;
        const mb = Math.max(1, Math.round(status.downloadBytes / (1024 * 1024)));
        void askConfirm({
          title: "Download tools",
          message: `RuForge needs ffmpeg and yt-dlp to download videos. This is a one-time download of about ${mb} MB.`,
          confirmLabel: "Download",
          cancelLabel: "Later",
          tone: "accent",
        }).then((approved) => {
          if (approved) void installTools();
        });
      }, PROMPT_DELAY_MS);
    })();

    return () => {
      disposed = true;
      window.clearTimeout(promptTimer);
      unlisteners.forEach((un) => un());
    };
  }, []);
}
