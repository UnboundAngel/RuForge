import { useState, useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Music } from "lucide-react";
import { backfillMusicMeta } from "../lib/musicMeta";
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
  const runningRef = useRef(false);

  const reset = useCallback(() => {
    setPhase("idle");
    setProgress(null);
    setEnriched(0);
    setError(null);
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
      const count = await backfillMusicMeta(roots);
      setEnriched(count);
      setPhase("done");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    } finally {
      runningRef.current = false;
    }
  }, [roots]);

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
      description="Scans library audio files missing a metadata sidecar. Writes canonical identity from embedded tags, MusicBrainz matches, and YouTube snapshot data."
      footer={footer}
    >
      {phase === "idle" && (
        <p className="text-[13px] leading-relaxed text-stone-400">
          Rate-limited to one MusicBrainz request per second. Large libraries may take several minutes.
        </p>
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
          {progress && progress.total > enriched
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
