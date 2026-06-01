import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOutput, Loader2 } from "lucide-react";
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
import {
  SettingsModalBtnGhost,
  SettingsModalBtnPrimary,
  SettingsModalBtnSecondary,
  SettingsModalEyebrow,
  SettingsModalShell,
  SettingsModalSurface,
} from "./settings/SettingsModalShell";

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
    <div className="space-y-5">
      <SettingsModalSurface className="space-y-1">
        <SettingsModalEyebrow>Selection</SettingsModalEyebrow>
        <p className="truncate text-sm font-semibold text-stone-100">{summaryTitle}</p>
        <p className="text-[11px] text-stone-500">
          {fileCount} file{fileCount === 1 ? "" : "s"}
          {sidecarParts.length > 0 ? ` · includes ${sidecarParts.join(", ")}` : ""}
        </p>
      </SettingsModalSurface>

      <div className="space-y-2">
        <SettingsModalEyebrow>Destination folder</SettingsModalEyebrow>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1 truncate rounded-[var(--radius-input)] bg-[#261d18] px-3 py-2.5 text-[12px] text-stone-300">
            {destDir || "Pick a folder…"}
          </div>
          <SettingsModalBtnGhost onClick={onBrowse} className="shrink-0 px-4">
            Browse
          </SettingsModalBtnGhost>
        </div>
        <p className="text-[11px] leading-relaxed text-stone-500">
          RuForge creates a timestamped subfolder inside the destination.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-input)] bg-[#261d18] px-3 py-2.5">
        <input
          type="checkbox"
          checked={includeManifest}
          onChange={(e) => onIncludeManifestChange(e.target.checked)}
          className="h-4 w-4 rounded accent-[color:var(--accent)]"
        />
        <span className="text-[13px] font-medium text-stone-300">
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
            <SettingsModalEyebrow>{formatExportPhaseLabel(phase)}</SettingsModalEyebrow>
          ) : null}
          <p className="truncate text-sm font-semibold leading-snug text-stone-100">
            {headline}
          </p>
          {currentPath && showPhaseEyebrow ? (
            <p className="truncate font-mono text-[10px] text-stone-500">
              {basename(currentPath)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[#261d18]">
        <div
          className="h-full bg-[color:var(--accent)] transition-[width] duration-300"
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-stone-500">
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
      <p className="text-[13px] leading-relaxed text-stone-400">
        Export cancelled. The partial bundle folder was removed.
      </p>
    );
  }

  if (phase === "failed") {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-red-400/90">{error || "Export failed."}</p>
        {result?.warnings?.length ? (
          <ul className="max-h-32 space-y-1 overflow-y-auto text-[11px] text-stone-500 rf-scrollbar">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[13px] text-stone-300">
      <p>
        Exported to{" "}
        <span className="font-mono text-[11px] text-stone-500">{result?.destDir}</span>
      </p>
      <p className="text-[11px] text-stone-500">
        {result?.filesCopied ?? 0} copied
        {(result?.filesSkipped ?? 0) > 0
          ? ` · ${result?.filesSkipped} skipped (already present)`
          : ""}
        {result?.bytesCopied ? ` · ${formatStorageSize(result.bytesCopied)}` : ""}
      </p>
      {result?.manifestPath ? (
        <p className="text-[11px] text-stone-500">
          Manifest: {basename(result.manifestPath)}
        </p>
      ) : null}
      {result?.warnings?.length ? (
        <ul className="max-h-32 space-y-1 overflow-y-auto text-[11px] text-amber-400/85 rf-scrollbar">
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

  const footer = (
    <>
      {phase === "configure" ? (
        <SettingsModalBtnSecondary onClick={handleClose}>Cancel</SettingsModalBtnSecondary>
      ) : null}
      {phase === "running" ? (
        <SettingsModalBtnSecondary onClick={handleHide}>Hide</SettingsModalBtnSecondary>
      ) : null}
      {showAddExportFolderToLibrary ? (
        <SettingsModalBtnGhost
          onClick={() => {
            addLibraryScanDir(exportDestParent);
            notify("Export folder added to library scan.");
          }}
        >
          Add folder to library
        </SettingsModalBtnGhost>
      ) : null}
      {phase === "running" ? (
        <SettingsModalBtnGhost onClick={handlePrimary}>Cancel export</SettingsModalBtnGhost>
      ) : (
        <SettingsModalBtnPrimary disabled={primaryDisabled} onClick={handlePrimary}>
          {primaryLabel}
        </SettingsModalBtnPrimary>
      )}
    </>
  );

  return (
    <SettingsModalShell
      open={exportPanelOpen}
      onClose={phase === "running" ? handleHide : handleClose}
      disableDismiss={phase === "running"}
      titleId="export-bundle-title"
      title="Export bundle"
      icon={FolderOutput}
      description="Copy library media and sidecars to a folder or removable drive."
      zIndexClass="z-[200]"
      footer={footer}
    >
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
    </SettingsModalShell>
  );
}

/** Keeps export progress listener alive for the main window lifetime. */
export function ExportBundleHost() {
  const api = useExportBundle();
  return <ExportBundleDialog {...api} />;
}
