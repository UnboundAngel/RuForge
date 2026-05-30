import { useCallback, useEffect, useMemo, useState } from "react";
import { X, FolderOutput, Loader2 } from "lucide-react";
import { useExportBundle } from "../hooks/useExportBundle";
import {
  exportProgressHeadline,
  formatExportPhaseLabel,
  summarizeExportSelection,
} from "../lib/exportSelection";
import { resolveExportInitialDestDir } from "../lib/exportDestResolve";
import {
  readExportIncludeManifest,
  writeExportIncludeManifest,
  writeExportLastDestDir,
} from "../lib/exportTypes";
import { formatStorageSize } from "../formatStorageSize";
import { isDirInLibraryScanList } from "../libraryScanDirs";
import { useRuforgeStore } from "../store/ruforgeStore";

type ExportModalPhase = "configure" | "running" | "done" | "failed" | "cancelled";

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function derivePhase(
  exportInFlight: boolean,
  outcomeKind: "done" | "failed" | "cancelled" | undefined,
): ExportModalPhase {
  if (exportInFlight) return "running";
  if (outcomeKind === "done") return "done";
  if (outcomeKind === "failed") return "failed";
  if (outcomeKind === "cancelled") return "cancelled";
  return "configure";
}

function ExportConfigureBody({
  summaryTitle,
  fileCount,
  sidecars,
  destDir,
  includeManifest,
  onBrowse,
  onIncludeManifestChange,
}: {
  summaryTitle: string;
  fileCount: number;
  sidecars: { hasSubs: boolean; hasChapters: boolean; hasPreviews: boolean };
  destDir: string;
  includeManifest: boolean;
  onBrowse: () => void;
  onIncludeManifestChange: (v: boolean) => void;
}) {
  const sidecarParts: string[] = [];
  if (sidecars.hasSubs) sidecarParts.push("subtitles");
  if (sidecars.hasChapters) sidecarParts.push("chapters");
  if (sidecars.hasPreviews) sidecarParts.push("previews");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
          Selection
        </p>
        <p className="mt-1 truncate text-sm font-bold text-stone-100">{summaryTitle}</p>
        <p className="mt-1 text-[10px] text-stone-500">
          {fileCount} file{fileCount === 1 ? "" : "s"}
          {sidecarParts.length > 0 ? ` · includes ${sidecarParts.join(", ")}` : ""}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
          Destination folder
        </p>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[11px] text-stone-300">
            {destDir || "Pick a folder…"}
          </div>
          <button
            type="button"
            onClick={onBrowse}
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-stone-300 hover:bg-white/10"
          >
            Browse
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-stone-600">
          RuForge creates a timestamped subfolder inside the destination.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/5 px-3 py-2.5 hover:bg-white/[0.02]">
        <input
          type="checkbox"
          checked={includeManifest}
          onChange={(e) => onIncludeManifestChange(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-black/40 accent-[color:var(--accent)]"
        />
        <span className="text-xs font-bold text-stone-300">
          Include playback manifest
        </span>
      </label>
    </div>
  );
}

function ExportRunningBody({
  phase,
  detail,
  currentPath,
  percent,
  bytesCopied,
  bytesTotal,
  fileIndex,
  fileTotal,
}: {
  phase: string;
  detail?: string;
  currentPath?: string;
  percent?: number;
  bytesCopied: number;
  bytesTotal?: number;
  fileIndex: number;
  fileTotal: number;
}) {
  const headline = exportProgressHeadline(phase, detail);
  const showPhaseEyebrow = Boolean(detail?.trim());
  const barPct =
    typeof percent === "number"
      ? Math.min(100, Math.max(0, percent))
      : fileTotal > 0
        ? Math.min(100, (fileIndex / fileTotal) * 100)
        : 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Loader2
          size={18}
          className="mt-0.5 shrink-0 animate-spin text-[color:var(--accent)]"
        />
        <div className="min-w-0 flex-1 space-y-1">
          {showPhaseEyebrow ? (
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
              {formatExportPhaseLabel(phase)}
            </p>
          ) : null}
          <p className="truncate text-sm font-bold leading-snug text-stone-100">
            {headline}
          </p>
          {currentPath && showPhaseEyebrow ? (
            <p className="truncate font-mono text-[10px] text-stone-600">
              {basename(currentPath)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full bg-[color:var(--accent)] transition-[width] duration-300"
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-stone-500">
        <span>
          {fileTotal > 0 ? `${fileIndex} / ${fileTotal} files` : "Scanning…"}
        </span>
        {bytesTotal && bytesTotal > 0 ? (
          <span title="Video size only">
            Video {formatStorageSize(bytesCopied)} / {formatStorageSize(bytesTotal)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ExportOutcomeBody({
  phase,
  result,
  error,
}: {
  phase: "done" | "failed" | "cancelled";
  result?: {
    destDir: string;
    filesCopied: number;
    filesSkipped: number;
    bytesCopied: number;
    manifestPath?: string | null;
    warnings: string[];
  };
  error?: string;
}) {
  if (phase === "cancelled") {
    return (
      <p className="text-xs leading-relaxed text-stone-400">
        Export cancelled. The partial bundle folder was removed.
      </p>
    );
  }

  if (phase === "failed") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-red-400/90">{error || "Export failed."}</p>
        {result?.warnings?.length ? (
          <ul className="max-h-32 space-y-1 overflow-y-auto text-[10px] text-stone-500">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs text-stone-300">
      <p>
        Exported to{" "}
        <span className="font-mono text-[10px] text-stone-400">{result?.destDir}</span>
      </p>
      <p className="text-[10px] text-stone-500">
        {result?.filesCopied ?? 0} copied
        {(result?.filesSkipped ?? 0) > 0 ? ` · ${result?.filesSkipped} skipped (already present)` : ""}
        {result?.bytesCopied ? ` · ${formatStorageSize(result.bytesCopied)}` : ""}
      </p>
      {result?.manifestPath ? (
        <p className="text-[10px] text-stone-500">
          Manifest: {basename(result.manifestPath)}
        </p>
      ) : null}
      {result?.warnings?.length ? (
        <ul className="max-h-32 space-y-1 overflow-y-auto text-[10px] text-amber-500/80">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ExportBundleDialog({
  startExport,
  cancelExport,
  pickDestDir,
}: ReturnType<typeof useExportBundle>) {
  const exportPanelOpen = useRuforgeStore((s) => s.exportPanelOpen);
  const exportPanelPreset = useRuforgeStore((s) => s.exportPanelPreset);
  const exportInFlight = useRuforgeStore((s) => s.exportInFlight);
  const exportProgress = useRuforgeStore((s) => s.exportProgress);
  const exportOutcome = useRuforgeStore((s) => s.exportOutcome);
  const entries = useRuforgeStore((s) => s.entries);
  const closeExportPanel = useRuforgeStore((s) => s.closeExportPanel);
  const libraryScanDirs = useRuforgeStore((s) => s.libraryScanDirs);
  const addLibraryScanDir = useRuforgeStore((s) => s.addLibraryScanDir);
  const notify = useRuforgeStore((s) => s.notify);

  const [destDir, setDestDir] = useState("");
  const [includeManifest, setIncludeManifest] = useState(readExportIncludeManifest);

  const phase = derivePhase(exportInFlight, exportOutcome?.kind);
  const paths = exportPanelPreset?.paths ?? [];

  const summary = useMemo(
    () => summarizeExportSelection(paths, entries, exportPanelPreset?.label),
    [paths, entries, exportPanelPreset?.label],
  );

  useEffect(() => {
    if (!exportPanelOpen) return;
    setIncludeManifest(readExportIncludeManifest());
    if (!exportInFlight && !exportOutcome) {
      let cancelled = false;
      void resolveExportInitialDestDir(exportPanelPreset?.initialDestDir).then(
        (dir) => {
          if (!cancelled) setDestDir(dir);
        },
      );
      return () => {
        cancelled = true;
      };
    }
  }, [
    exportPanelOpen,
    exportInFlight,
    exportOutcome,
    exportPanelPreset?.initialDestDir,
  ]);

  const handleHide = useCallback(() => {
    closeExportPanel();
  }, [closeExportPanel]);

  const handleClose = useCallback(() => {
    if (phase === "running") return;
    closeExportPanel();
  }, [phase, closeExportPanel]);

  useEffect(() => {
    if (!exportPanelOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (phase === "running") {
        handleHide();
        return;
      }
      handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportPanelOpen, phase, handleClose, handleHide]);

  const handleBrowse = useCallback(async () => {
    const picked = await pickDestDir();
    if (picked) {
      setDestDir(picked);
      writeExportLastDestDir(picked);
    }
  }, [pickDestDir]);

  const handleIncludeManifestChange = useCallback((v: boolean) => {
    setIncludeManifest(v);
    writeExportIncludeManifest(v);
  }, []);

  const handleStart = useCallback(() => {
    if (!paths.length || !destDir.trim() || exportInFlight) return;
    void startExport({ paths, destDir, includeManifest });
  }, [paths, destDir, includeManifest, exportInFlight, startExport]);

  if (!exportPanelOpen) return null;

  const showCloseX = phase !== "running";
  const showHide = phase === "running";
  const primaryLabel =
    phase === "done" || phase === "failed" || phase === "cancelled"
      ? "Close"
      : phase === "running"
        ? "Cancel export"
        : "Export";

  const handlePrimary = () => {
    if (phase === "running") {
      void cancelExport();
      return;
    }
    if (phase === "done" || phase === "failed" || phase === "cancelled") {
      handleClose();
      return;
    }
    handleStart();
  };

  const primaryDisabled =
    phase === "configure" && (!destDir.trim() || exportInFlight);

  const exportDestParent = destDir.trim();
  const showAddExportFolderToLibrary =
    phase === "done" &&
    exportDestParent.length > 0 &&
    !isDirInLibraryScanList(exportDestParent, libraryScanDirs);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-labelledby="export-bundle-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1D1613] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <FolderOutput size={16} className="text-[color:var(--accent)]" />
            <h2
              id="export-bundle-title"
              className="text-sm font-black uppercase tracking-[0.2em] text-white"
            >
              Export bundle
            </h2>
          </div>
          {showCloseX ? (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1 text-stone-500 hover:bg-white/5 hover:text-white"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          ) : showHide ? (
            <button
              type="button"
              onClick={handleHide}
              className="rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest text-stone-400 hover:bg-white/5 hover:text-white"
            >
              Hide
            </button>
          ) : (
            <div className="w-[26px]" />
          )}
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {phase === "configure" ? (
            <ExportConfigureBody
              summaryTitle={summary.title}
              fileCount={summary.fileCount}
              sidecars={summary.sidecars}
              destDir={destDir}
              includeManifest={includeManifest}
              onBrowse={() => void handleBrowse()}
              onIncludeManifestChange={handleIncludeManifestChange}
            />
          ) : null}
          {phase === "running" ? (
            <ExportRunningBody
              phase={exportProgress?.phase ?? "preparing"}
              detail={exportProgress?.detail}
              currentPath={exportProgress?.currentPath}
              percent={exportProgress?.percent}
              bytesCopied={exportProgress?.bytesCopied ?? 0}
              bytesTotal={exportProgress?.bytesTotal}
              fileIndex={exportProgress?.fileIndex ?? 0}
              fileTotal={exportProgress?.fileTotal ?? 0}
            />
          ) : null}
          {phase === "done" || phase === "failed" || phase === "cancelled" ? (
            <ExportOutcomeBody
              phase={phase}
              result={exportOutcome?.result}
              error={exportOutcome?.error}
            />
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-white/5 px-5 py-4">
          {phase === "configure" ? (
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-[10px] font-black uppercase tracking-[0.25em] text-stone-400"
            >
              Cancel
            </button>
          ) : null}
          {phase === "running" ? (
            <button
              type="button"
              onClick={handleHide}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-[10px] font-black uppercase tracking-[0.25em] text-stone-400 hover:bg-white/5"
            >
              Hide
            </button>
          ) : null}
          {showAddExportFolderToLibrary ? (
            <button
              type="button"
              onClick={() => {
                addLibraryScanDir(exportDestParent);
                notify("Export folder added to library scan.");
              }}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 hover:bg-white/5"
            >
              Add folder to library
            </button>
          ) : null}
          <button
            type="button"
            disabled={primaryDisabled}
            onClick={handlePrimary}
            className={`rounded-xl py-2.5 text-[10px] font-black uppercase tracking-[0.25em] disabled:opacity-40 ${
              phase === "running"
                ? "flex-1 border border-white/10 text-stone-300 hover:bg-white/5"
                : phase === "configure"
                  ? "flex-1 bg-[color:var(--accent)] text-stone-950"
                  : "flex-1 bg-[color:var(--accent)] text-stone-950"
            }`}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Keeps export progress listener alive for the main window lifetime. */
export function ExportBundleHost() {
  const api = useExportBundle();
  return <ExportBundleDialog {...api} />;
}
