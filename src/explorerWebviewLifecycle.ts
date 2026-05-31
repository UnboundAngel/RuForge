import { Webview } from "@tauri-apps/api/webview";
import type { Window } from "@tauri-apps/api/window";

/** In-window child webview label (`App.tsx`). Linux uses `explorer-surface` via Rust. */
export const EMBEDDED_EXPLORER_WEBVIEW_LABEL = "explorer-view";

/** Pause HTML5 / YouTube player media when leaving the Explorer tab. */
export const EXPLORER_PAUSE_MEDIA_SCRIPT = `(function(){try{document.querySelectorAll("video,audio").forEach(function(m){try{m.pause();}catch(e){}});var p=document.getElementById("movie_player");if(p&&typeof p.pauseVideo==="function")p.pauseVideo();}catch(e){}})();`;

export function explorerNavigateOrReloadScript(url: string): string {
  const encoded = JSON.stringify(url);
  return `(function(){try{var t=${encoded};if(location.href!==t)location.href=t;else location.reload();}catch(e){}})();`;
}

function explorerAlreadyExistsError(payload: unknown): boolean {
  if (typeof payload === "string") {
    return payload.includes("already exists");
  }
  return false;
}

export async function getEmbeddedExplorerWebview(
  label: string = EMBEDDED_EXPLORER_WEBVIEW_LABEL,
): Promise<Webview | null> {
  try {
    return await Webview.getByLabel(label);
  } catch {
    return null;
  }
}

export type EnsureEmbeddedExplorerWebviewOptions = {
  window: Window;
  label: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataDirectory: string;
  userAgent: string;
  additionalBrowserArgs?: string | null;
};

/** Attach to an existing child webview or create one. Survives Vite HMR / hard refresh. */
export function ensureEmbeddedExplorerWebview(
  opts: EnsureEmbeddedExplorerWebviewOptions,
): Promise<Webview> {
  return new Promise((resolve, reject) => {
    void (async () => {
      const existing = await getEmbeddedExplorerWebview(opts.label);
      if (existing) {
        resolve(existing);
        return;
      }

      const webview = new Webview(opts.window, opts.label, {
        url: opts.url,
        x: opts.x,
        y: opts.y,
        width: opts.width,
        height: opts.height,
        dataDirectory: opts.dataDirectory,
        userAgent: opts.userAgent,
        ...(opts.additionalBrowserArgs
          ? { additionalBrowserArgs: opts.additionalBrowserArgs }
          : {}),
      });

      webview.once("tauri://created", () => {
        resolve(webview);
      });

      webview.once("tauri://error", (e) => {
        void (async () => {
          if (explorerAlreadyExistsError(e.payload)) {
            const recovered = await getEmbeddedExplorerWebview(opts.label);
            if (recovered) {
              resolve(recovered);
              return;
            }
          }
          reject(e);
        })();
      });
    })();
  });
}
