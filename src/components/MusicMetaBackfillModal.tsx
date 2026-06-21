import { useState, useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Music } from "lucide-react";
import { backfillMusicMeta } from "../lib/musicMeta";
import { cn } from "@/lib/utils";
import {
  SettingsModalBtnGhost,
  SettingsModalBtnPrimary,
  SettingsModalBtnSecondary,
  SettingsModalShell,
} from "./settings/SettingsModalShell";

interface Props {
  open: boolean;
  onClose: () => void;
  roots: string[];
}

interface BackfillProgress {
  done: number;
  total: number;
  currentTitle?: string | null;
}

type Phase = "idle" | "running" | "done" | "error";

export const MusicMetaBackfillModal = ({ open, onClose, roots }: Props) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [enriched, setEnriched] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [forceReenrich, setForceReenrich] = useState(false);
  const runningRef = useRef(false);

  const reset = useCallback(() => {
    setPhase("idle");
    setProgress(null);
    setEnriched(0);
    setError(null);
    setForceReenrich(false);
    runningRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    if (phase === "running") return;
    reset();
    onClose();
  }, [phase, reset, onClose]);

  useEffect(() => {
    if (!open) return;
    let unsub: (() => void) | undefined;
    let disposed = false;

    void listen<BackfillProgress>("music-meta-backfill-progress", (event) => {
      setProgress(event.payload);
    }).then((un) => {
      if (disposed) {
        un();
        return;
      }
      unsub = un;
    });

    return () => {
      disposed = true;
      unsub?.();
    };
  }, [open]);

  const runBackfill = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase("running");
    setError(null);
    setProgress(null);
    try {
      const count = await backfillMusicMeta(roots, forceReenrich || undefined);
      setEnriched(count);
      setPhase("done");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    } finally {
      runningRef.current = false;
    }
  }, [roots, forceReenrich]);

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  const footer = (() => {
    if (phase === "idle" || phase === "error") {
      return (
        <>
          <SettingsModalBtnSecondary onClick={handleClose}>Cancel</SettingsModalBtnSecondary>
          <SettingsModalBtnGhost onClick={() => void runBackfill()}>
            Start backfill
          </SettingsModalBtnGhost>
        </>
      );
    }
    if (phase === "running") {
      return <span className="px-2 py-2 text-[11px] text-stone-500">Running…</span>;
    }
    if (phase === "done") {
      return (
        <SettingsModalBtnPrimary onClick={handleClose}>Done</SettingsModalBtnPrimary>
      );
    }
    return null;
  })();

  return (
    <SettingsModalShell
      open={open}
      onClose={handleClose}
      disableDismiss={phase === "running"}
      titleId="music-meta-backfill-title"
      title="Enrich music metadata"
      icon={Music}
      description="Scans library audio for missing sidecars and patches legacy sidecars missing artist genres. Writes canonical identity plus artist MB genres on each track sidecar."
      footer={footer}
    >
      {phase === "idle" && (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-stone-400">
            Creates sidecars for tracks without one, then patches existing sidecars missing artist genres. Rate-limited to one MusicBrainz request per second; artist lookups are cached per artist name.
          </p>
          <button
            type="button"
            onClick={() => setForceReenrich((v) => !v)}
            className="flex items-start gap-2.5 text-left group"
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                forceReenrich
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)]"
                  : "border-stone-600 bg-transparent group-hover:border-stone-400",
              )}
            >
              {forceReenrich && (
                <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-none stroke-white stroke-2">
                  <polyline points="1,4 4,7 9,1" />
                </svg>
              )}
            </span>
            <span className="text-[12px] leading-relaxed text-stone-400 group-hover:text-stone-300">
              Re-process already-enriched files
              <span className="ml-1 text-stone-600">(use after a metadata priority fix)</span>
            </span>
          </button>
        </div>
      )}

      {phase === "running" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[12px] text-stone-400">
            <span>
              {progress ? `${progress.done} / ${progress.total}` : "Scanning…"}
            </span>
            {progress && progress.total > 0 ? (
              <span className="text-stone-500">{pct}%</span>
            ) : null}
          </div>
          {progress && progress.total > 0 && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-[#261d18]">
              <div
                className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          {progress?.currentTitle ? (
            <p className="truncate text-[11px] text-stone-500">{progress.currentTitle}</p>
          ) : null}
        </div>
      )}

      {phase === "done" && (
        <p className="text-[13px] font-semibold text-green-400/90">
          Complete. {enriched} {enriched === 1 ? "file" : "files"} enriched.
          {!forceReenrich && progress && progress.total > enriched
            ? ` ${progress.total - enriched} already had sidecars.`
            : ""}
        </p>
      )}

      {phase === "error" && error && (
        <p className="text-[13px] text-red-400/90" role="alert">
          {error}
        </p>
      )}
    </SettingsModalShell>
  );
};
