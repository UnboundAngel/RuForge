import { useState, useCallback } from "react";
import { FolderTree } from "lucide-react";
import { migrateLibraryLayout, remapMigrationLocalStorage, type MigrateResult } from "../lib/migrateLibrary";
import { useRuforgeStore } from "../store/ruforgeStore";
import {
  SettingsModalBtnGhost,
  SettingsModalBtnPrimary,
  SettingsModalBtnSecondary,
  SettingsModalEyebrow,
  SettingsModalShell,
  SettingsModalSurface,
} from "./settings/SettingsModalShell";

interface Props {
  open: boolean;
  onClose: () => void;
  libraryRoot: string;
}

type Phase = "idle" | "previewing" | "confirming" | "running" | "done" | "error";

const bucketTone: Record<string, string> = {
  Videos: "text-stone-300",
  Music: "text-red-400/90",
  Playlists: "text-amber-400/90",
  Unsorted: "text-stone-500",
};

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

  const footer = (() => {
    if (phase === "idle" || phase === "error") {
      return (
        <>
          <SettingsModalBtnSecondary onClick={handleClose}>Cancel</SettingsModalBtnSecondary>
          <SettingsModalBtnGhost onClick={() => void runPreview()}>Preview</SettingsModalBtnGhost>
        </>
      );
    }
    if (phase === "confirming" && preview) {
      return (
        <>
          <SettingsModalBtnSecondary onClick={handleClose}>Cancel</SettingsModalBtnSecondary>
          {preview.moves.length > 0 ? (
            <SettingsModalBtnPrimary onClick={() => void runMigration()}>
              Migrate {preview.moves.length} items
            </SettingsModalBtnPrimary>
          ) : (
            <SettingsModalBtnGhost onClick={handleClose}>Close</SettingsModalBtnGhost>
          )}
        </>
      );
    }
    if (phase === "done") {
      return (
        <SettingsModalBtnPrimary onClick={handleClose}>Done</SettingsModalBtnPrimary>
      );
    }
    return (
      <span className="px-2 py-2 text-[11px] text-stone-500">Working…</span>
    );
  })();

  return (
    <SettingsModalShell
      open={open}
      onClose={handleClose}
      disableDismiss={phase === "previewing" || phase === "running"}
      titleId="migrate-library-title"
      title="Migrate library layout"
      icon={FolderTree}
      description="Reorganizes the flat media root into Videos/, Music/, and Playlists/ bucket folders with per-item subfolders."
      footer={footer}
    >
      {phase === "idle" && (
        <p className="text-[13px] leading-relaxed text-stone-400">
          Run a preview to list every move before files are relocated. Progress and watch state are preserved after migration.
        </p>
      )}

      {(phase === "previewing" || phase === "running") && (
        <p className="text-[13px] text-stone-400 animate-pulse">
          {phase === "previewing" ? "Scanning library…" : "Moving files…"}
        </p>
      )}

      {phase === "confirming" && preview && (
        <div className="space-y-4">
          <p className="text-[13px] text-stone-400">
            <span className="font-semibold text-stone-200">{preview.moves.length}</span>{" "}
            items will be moved.
            {preview.warnings.length > 0 ? (
              <span className="ml-2 text-amber-400/90">
                {preview.warnings.length} warnings.
              </span>
            ) : null}
          </p>
          {preview.moves.length > 0 && (
            <SettingsModalSurface className="max-h-48 space-y-2 overflow-y-auto rf-scrollbar">
              {preview.moves.map((m, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span
                    className={`shrink-0 font-semibold ${bucketTone[m.bucket] ?? "text-stone-400"}`}
                  >
                    {m.bucket}
                  </span>
                  <span className="min-w-0 truncate text-stone-500" title={m.oldMediaPath}>
                    {m.oldMediaPath.split(/[\\/]/).pop()}
                  </span>
                </div>
              ))}
            </SettingsModalSurface>
          )}
          {preview.warnings.length > 0 && (
            <div className="space-y-2">
              <SettingsModalEyebrow>Warnings</SettingsModalEyebrow>
              <ul className="space-y-1 text-[11px] leading-relaxed text-amber-400/85">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-4">
          <p className="text-[13px] font-semibold text-green-400/90">
            Migration complete. {result.moves.length} items moved.
          </p>
          {result.warnings.length > 0 && (
            <div className="space-y-2">
              <SettingsModalEyebrow>Warnings</SettingsModalEyebrow>
              <ul className="space-y-1 text-[11px] text-amber-400/85">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[12px] text-stone-500">
            Library re-scan triggered. Progress and watch state preserved.
          </p>
        </div>
      )}

      {phase === "error" && error && (
        <p className="text-[13px] text-red-400/90" role="alert">
          {error}
        </p>
      )}
    </SettingsModalShell>
  );
};
