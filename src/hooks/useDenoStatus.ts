import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DenoDownloadProgressPayload, DenoStatusPayload } from "../types";

function invokeErrorMessage(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function useDenoStatus(enabled = true) {
  const [status, setStatus] = useState<DenoStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [invokeError, setInvokeError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const next = await invoke<DenoStatusPayload>("get_deno_status");
      setStatus(next);
      setInvokeError(null);
      return { status: next, error: null as string | null };
    } catch (e) {
      const msg = invokeErrorMessage(e, "Could not read Deno status.");
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
        await fetchStatus();
      } finally {
        if (!disposed) setLoading(false);
      }

      const un = await listen<DenoDownloadProgressPayload>(
        "deno-download-progress",
        (event) => {
          const { phase, percent: p } = event.payload;
          const pNum = typeof p === "number" ? p : null;

          if (phase === "downloading" || phase === "extracting") {
            setPercent((prev) => pNum ?? prev);
          }
          if (phase === "verifying") {
            setPercent(92);
          }
          if (phase === "done") {
            setInstalling(false);
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

  const install = useCallback(async () => {
    setInvokeError(null);
    setInstalling(true);
    setPercent(null);
    try {
      await invoke<{ version: string }>("download_deno");
      const refreshed = await fetchStatus();
      if (!refreshed.status?.present) {
        const msg = refreshed.error ?? "Deno installed but status could not be verified.";
        setInvokeError(msg);
        return { ok: false as const, error: msg };
      }
      return { ok: true as const, error: null };
    } catch (e) {
      const msg = invokeErrorMessage(e, "Could not install Deno.");
      setInvokeError(msg);
      setPercent(null);
      return { ok: false as const, error: msg };
    } finally {
      setInstalling(false);
    }
  }, [fetchStatus]);

  return {
    status,
    loading,
    installing,
    percent,
    invokeError,
    fetchStatus,
    install,
  };
}
