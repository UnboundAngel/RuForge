import { useState, useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { backfillMusicMeta } from "../lib/musicMeta";

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

  if (!open) return null;

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1C1512] border border-stone-700 rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        <div className="px-6 pt-5 pb-4 border-b border-stone-800">
          <h2 className="text-sm font-bold text-stone-100 tracking-wide">Enrich music metadata</h2>
          <p className="text-[11px] text-stone-500 mt-1">
            Scans your library for audio files missing a metadata sidecar. Looks up MusicBrainz for canonical identity (artist/album/title) and fetches cover art when none exists locally.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {phase === "idle" && (
            <p className="text-[12px] text-stone-400">
              Rate-limited to one MusicBrainz request per second. Large libraries may take several minutes to complete.
            </p>
          )}

          {phase === "running" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] text-stone-400">
                <span>
                  {progress
                    ? `${progress.done} / ${progress.total}`
                    : "Scanning..."}
                </span>
                {progress && progress.total > 0 && (
                  <span className="text-stone-500">{pct}%</span>
                )}
              </div>
              {progress && progress.total > 0 && (
                <div className="h-1 w-full bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--accent)] rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              {progress?.currentTitle && (
                <p className="text-[10px] text-stone-500 truncate">{progress.currentTitle}</p>
              )}
            </div>
          )}

          {phase === "done" && (
            <p className="text-[12px] text-green-400 font-semibold">
              Complete. {enriched} {enriched === 1 ? "file" : "files"} enriched.{" "}
              {progress && progress.total > enriched
                ? `${progress.total - enriched} already had sidecars.`
                : ""}
            </p>
          )}

          {phase === "error" && error && (
            <p className="text-[12px] text-red-400">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-stone-800 flex justify-end gap-3">
          {(phase === "idle" || phase === "error") && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-[10px] font-bold tracking-widest text-stone-400 hover:text-stone-200 transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={runBackfill}
                className="px-5 py-2 bg-[#1D1613] hover:bg-stone-800 text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
              >
                START BACKFILL
              </button>
            </>
          )}

          {phase === "running" && (
            <span className="text-[10px] text-stone-500 py-2">Running...</span>
          )}

          {phase === "done" && (
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-[10px] font-black tracking-widest transition-all border border-stone-700 active:scale-95"
            >
              DONE
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
