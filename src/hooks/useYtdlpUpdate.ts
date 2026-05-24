import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  YtdlpUpdateDownloadProgressPayload,
  YtdlpUpdateStatusPayload,
} from "../types";

function invokeErrorMessage(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function useYtdlpUpdate(enabled = true) {
  const [status, setStatus] = useState<YtdlpUpdateStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [invokeError, setInvokeError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (forceRefresh = false) => {
    try {
      const next = await invoke<YtdlpUpdateStatusPayload>("get_ytdlp_update_status", {
        forceRefresh,
      });
      setStatus(next);
      setInvokeError(null);
      return { status: next, error: null as string | null };
    } catch (e) {
      const msg = invokeErrorMessage(e, "Could not read yt-dlp version.");
      setStatus(null);
      setInvokeError(msg);
      return { status: null, error: msg };
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let unsub: (() => void) | undefined;
    let disposed = false;

    const run = async () => {
      setLoading(true);
      try {
        await fetchStatus(false);
      } finally {
        if (!disposed) setLoading(false);
      }

      const un = await listen<YtdlpUpdateDownloadProgressPayload>(
        "ytdlp-update-download-progress",
        (event) => {
          const payload = event.payload;
          const phase = payload.phase;
          const p = typeof payload.percent === "number" ? payload.percent : null;

          if (phase === "downloading") setPercent((prev) => p ?? prev);
          if (phase === "verifying") setPercent(null);
          if (phase === "done") {
            setUpdating(false);
            setPercent(100);
            setTimeout(() => setPercent(null), 900);
          }
        },
      );
      if (disposed) {
        un();
        return;
      }
      unsub = un;
    };

    void run();
    return () => {
      disposed = true;
      unsub?.();
    };
  }, [enabled, fetchStatus]);

  const downloadUpdate = useCallback(async () => {
    setInvokeError(null);
    setUpdating(true);
    setPercent(null);
    try {
      await invoke("download_ytdlp_update");
      const refreshed = await fetchStatus(false);
      if (!refreshed.status) {
        const msg = refreshed.error ?? "yt-dlp updated but version could not be verified.";
        setInvokeError(msg);
        return { ok: false as const, status: null, error: msg };
      }
      return { ok: true as const, status: refreshed.status, error: null };
    } catch (e) {
      const msg = invokeErrorMessage(e, "Could not download yt-dlp.");
      setInvokeError(msg);
      setPercent(null);
      return { ok: false as const, status: null, error: msg };
    } finally {
      setUpdating(false);
    }
  }, [fetchStatus]);

  const checkAndUpdate = useCallback(async () => {
    setChecking(true);
    setInvokeError(null);
    try {
      const checked = await fetchStatus(true);
      if (!checked.status) {
        return {
          ok: false as const,
          updated: false,
          status: null,
          error: checked.error ?? "Could not check yt-dlp version.",
        };
      }
      const next = checked.status;
      if (!next.updateAvailable) {
        return { ok: true as const, updated: false, status: next, error: null };
      }
      const dl = await downloadUpdate();
      return {
        ok: dl.ok,
        updated: dl.ok,
        status: dl.status ?? next,
        error: dl.error,
      };
    } finally {
      setChecking(false);
    }
  }, [fetchStatus, downloadUpdate]);

  return {
    status,
    loading,
    checking,
    updating,
    percent,
    invokeError,
    fetchStatus,
    downloadUpdate,
    checkAndUpdate,
  };
}
