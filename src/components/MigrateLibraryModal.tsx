import { useState, useCallback } from "react";
import { migrateLibraryLayout, remapMigrationLocalStorage, type MigrateResult } from "../lib/migrateLibrary";
import { useRuforgeStore } from "../store/ruforgeStore";

interface Props {
  open: boolean;
  onClose: () => void;
  libraryRoot: string;
}

type Phase = "idle" | "previewing" | "confirming" | "running" | "done" | "error";

export const MigrateLibraryModal = ({ open, onClose, libraryRoot }: Props) => {
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const stopPlayback = useRuforgeStore((s) => s.stopPlayback);

  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<MigrateResult | null>(null);
  const [result, setResult] = useState<MigrateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setPreview(null);
    setResult(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const runPreview = useCallback(async () => {
    setPhase("previewing");
    setError(null);
    try {
      const res = await migrateLibraryLayout(libraryRoot, true);
      setPreview(res);
      setPhase("confirming");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }, [libraryRoot]);

  const runMigration = useCallback(async () => {
    setPhase("running");
    setError(null);
    try {
      stopPlayback();
      const res = await migrateLibraryLayout(libraryRoot, false);
      remapMigrationLocalStorage(res.moves);
      setResult(res);
      setPhase("done");
      void fetchEntries();
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }, [libraryRoot, stopPlayback, fetchEntries]);

  if (!open) return null;

  const bucketColors: Record<string, string> = {
    Videos: "text-stone-300",
    Music: "text-red-400",
    Playlists: "text-amber-400",
    Unsorted: "text-stone-500",
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1C1512] border border-stone-700 rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        <div className="px-6 pt-5 pb-4 border-b border-stone-800">
          <h2 className="text-sm font-bold text-stone-100 tracking-wide">Migrate library layout</h2>
          <p className="text-[11px] text-stone-500 mt-1">
            Reorganizes the flat media root into Videos/, Music/, and Playlists/ bucket folders with per-item subfolders.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {phase === "idle" && (
            <p className="text-[12px] text-stone-400">
              This moves all 295 items into a structured layout. Run a preview first to see exactly what will change before committing.
            </p>
          )}

          {phase === "previewing" && (
            <p className="text-[12px] text-stone-400 animate-pulse">Scanning library...</p>
          )}

          {phase === "running" && (
            <p className="text-[12px] text-stone-400 animate-pulse">Moving files...</p>
          )}

          {phase === "confirming" && preview && (
            <div className="space-y-3">
              <p className="text-[11px] text-stone-400">
                <span className="text-stone-200 font-semibold">{preview.moves.length}</span> items will be moved.
                {preview.warnings.length > 0 && (
                  <span className="text-amber-400 ml-2">{preview.warnings.length} warnings.</span>
                )}
              </p>
              {preview.moves.length > 0 && (
                <div className="bg-stone-900/60 rounded-xl p-3 space-y-1 max-h-48 overflow-y-auto">
                  {preview.moves.map((m, i) => (
                    <div key={i} className="flex items-start gap-2 text-[10px]">
                      <span className={`shrink-0 font-semibold ${bucketColors[m.bucket] ?? "text-stone-400"}`}>
                        {m.bucket}
                      </span>
                      <span className="text-stone-500 truncate" title={m.oldMediaPath}>
                        {m.oldMediaPath.split(/[\\/]/).pop()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {preview.warnings.length > 0 && (
                <details className="text-[10px] text-amber-500">
                  <summary className="cursor-pointer">Warnings</summary>
                  <ul className="mt-1 space-y-0.5 pl-3">
                    {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          {phase === "done" && result && (
            <div className="space-y-2">
              <p className="text-[12px] text-green-400 font-semibold">
                Migration complete. {result.moves.length} items moved.
              </p>
              {result.warnings.length > 0 && (
                <details className="text-[10px] text-amber-500">
                  <summary className="cursor-pointer">{result.warnings.length} warnings</summary>
                  <ul className="mt-1 space-y-0.5 pl-3">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </details>
              )}
              <p className="text-[11px] text-stone-500">Library re-scan triggered. Progress/watch state has been preserved.</p>
            </div>
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
                onClick={runPreview}
                className="px-5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-[10px] font-black tracking-widest transition-all border border-stone-700 active:scale-95"
              >
                PREVIEW
              </button>
            </>
          )}

          {phase === "confirming" && preview && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-[10px] font-bold tracking-widest text-stone-400 hover:text-stone-200 transition-colors"
              >
                CANCEL
              </button>
              {preview.moves.length > 0 && (
                <button
                  type="button"
                  onClick={runMigration}
                  className="px-5 py-2 bg-[#1D1613] hover:bg-stone-800 text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                >
                  MIGRATE {preview.moves.length} ITEMS
                </button>
              )}
              {preview.moves.length === 0 && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 bg-stone-800 text-stone-400 rounded-xl text-[10px] font-black tracking-widest border border-stone-700"
                >
                  NOTHING TO DO
                </button>
              )}
            </>
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

          {(phase === "previewing" || phase === "running") && (
            <span className="text-[10px] text-stone-500 py-2">Working...</span>
          )}
        </div>
      </div>
    </div>
  );
};
