import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { DenoDownloadProgressPayload } from "@/types";

const jsRuntimeFailedJobIds = new Set<string>();
let installing = false;

export function isDenoInstalling(): boolean {
  return installing;
}

export function rememberJsRuntimeFailure(jobId: string): void {
  jsRuntimeFailedJobIds.add(jobId);
}

/** Re-run downloads that failed only because no JS runtime was installed. */
export function retryJsRuntimeFailures(): number {
  const ids = [...jsRuntimeFailedJobIds];
  jsRuntimeFailedJobIds.clear();
  const s = useRuforgeStore.getState();
  for (const id of ids) s.retryDownloadJob(id);
  return ids.length;
}

function progressCopy({ phase, percent }: DenoDownloadProgressPayload): string {
  if (phase === "extracting") return "Unpacking the JavaScript runtime…";
  if (phase === "verifying") return "Checking the JavaScript runtime…";
  if (typeof percent === "number") return `Installing the JavaScript runtime… ${Math.round(percent)}%`;
  return "Installing the JavaScript runtime…";
}

/** Installs Deno with a live progress toast, then retries the downloads that needed it. */
export async function installDenoAndRetry(): Promise<boolean> {
  if (installing) return false;
  installing = true;
  const store = useRuforgeStore.getState();
  const toastId = store.notify("Installing the JavaScript runtime…", "progress");
  const unlisten = await listen<DenoDownloadProgressPayload>("deno-download-progress", (event) => {
    if (event.payload.phase === "done") return;
    useRuforgeStore.getState().updateNotification(toastId, progressCopy(event.payload));
  });
  try {
    await invoke("download_deno");
    useRuforgeStore.getState().dismissNotification(toastId);
    const retried = retryJsRuntimeFailures();
    useRuforgeStore
      .getState()
      .notify(
        retried > 0
          ? `JavaScript runtime installed. Retrying ${retried === 1 ? "your download" : `${retried} downloads`}.`
          : "JavaScript runtime installed.",
      );
    return true;
  } catch (e) {
    useRuforgeStore.getState().dismissNotification(toastId);
    const msg = typeof e === "string" ? e : e instanceof Error ? e.message : "Deno install failed.";
    useRuforgeStore.getState().notify(msg, "error", {
      label: "Try again",
      run: () => void installDenoAndRetry(),
    });
    return false;
  } finally {
    unlisten();
    installing = false;
  }
}
