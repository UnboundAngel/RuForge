import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { askConfirm } from "../ConfirmDialog";
import { applyExplorerLikeClick } from "../../lib/explorerLikeSelection";
import { copyDevCapturePngToClipboard } from "../../lib/copyDevCapturePng";
import { notifyDevCapturesChanged } from "../../lib/devCapturesEvents";
import type { DevCaptureEntry } from "../../lib/devCapturesTypes";
import { DevCaptureThumb } from "./DevCaptureThumb";
import { DevCaptureAnnotateModal } from "./DevCaptureAnnotateModal";
import {
  DevCaptureGridContextMenu,
  type DevCaptureGridContextMenuState,
} from "./DevCaptureGridContextMenu";

type DevCapturesGridProps = {
  entries: DevCaptureEntry[];
  onRefresh: () => void;
};

export function DevCapturesGrid({ entries, onRefresh }: DevCapturesGridProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [annotatePath, setAnnotatePath] = useState<string | null>(null);
  const [thumbRev, setThumbRev] = useState<Record<string, number>>({});
  const [contextMenu, setContextMenu] = useState<DevCaptureGridContextMenuState | null>(null);
  const [deletePending, setDeletePending] = useState<{
    paths: Set<string>;
    anchor: string;
  } | null>(null);

  const orderedPaths = useMemo(() => entries.map((e) => e.path), [entries]);

  useEffect(() => {
    const live = new Set(entries.map((e) => e.path));
    setSelected((prev) => {
      const next = new Set([...prev].filter((p) => live.has(p)));
      return next.size === prev.size ? prev : next;
    });
    setAnchorPath((prev) => (prev && live.has(prev) ? prev : null));
    setDeletePending((prev) => {
      if (!prev) return prev;
      const next = new Set([...prev.paths].filter((p) => live.has(p)));
      if (next.size === 0) return null;
      if (!next.has(prev.anchor)) {
        return { paths: next, anchor: [...next][0]! };
      }
      return next.size === prev.paths.size ? prev : { paths: next, anchor: prev.anchor };
    });
  }, [entries]);

  const selectedPaths = useMemo(
    () => orderedPaths.filter((p) => selected.has(p)),
    [orderedPaths, selected],
  );

  const handleSelect = useCallback(
    (path: string, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
      setDeletePending(null);
      const result = applyExplorerLikeClick(orderedPaths, selected, anchorPath, path, mods);
      setSelected(result.selected);
      setAnchorPath(result.anchorPath);
    },
    [orderedPaths, selected, anchorPath],
  );

  const resolveDeleteTargets = useCallback(
    (clickedPath: string) => {
      if (selected.has(clickedPath) && selected.size > 0) {
        return selectedPaths;
      }
      return [clickedPath];
    },
    [selected, selectedPaths],
  );

  const deleteTargets = useCallback(
    async (targets: string[], anchor: string) => {
      if (targets.length === 0) return;

      setDeletePending({ paths: new Set(targets), anchor });

      if (targets.length > 1) {
        const ok = await askConfirm({
          title: "Delete captures",
          message: `Delete ${targets.length} selected captures from disk? This cannot be undone.`,
          confirmLabel: "Delete",
        });
        if (!ok) {
          setDeletePending(null);
          return;
        }
      }

      try {
        await invoke("delete_dev_captures", { paths: targets });
        setSelected((prev) => {
          const next = new Set(prev);
          for (const p of targets) next.delete(p);
          return next;
        });
        notifyDevCapturesChanged();
      } catch (e) {
        console.error("[dev-captures] delete failed", e);
      } finally {
        setDeletePending(null);
      }
    },
    [],
  );

  const handleDelete = useCallback(
    (clickedPath: string) => {
      const targets = resolveDeleteTargets(clickedPath);
      setSelected(new Set(targets));
      setAnchorPath(clickedPath);
      void deleteTargets(targets, clickedPath);
    },
    [resolveDeleteTargets, deleteTargets],
  );

  const handleContextMenu = useCallback(
    (path: string, e: React.MouseEvent) => {
      setDeletePending(null);
      if (!selected.has(path)) {
        setSelected(new Set([path]));
        setAnchorPath(path);
      }
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [selected],
  );

  const handleCopySelected = useCallback(async () => {
    const path = selectedPaths[0];
    if (!path) return;
    try {
      await copyDevCapturePngToClipboard(path);
    } catch (e) {
      console.error("[dev-captures] clipboard copy failed", e);
    }
  }, [selectedPaths]);

  const openAnnotate = useCallback(
    (path: string) => {
      if (!selected.has(path)) {
        setSelected(new Set([path]));
        setAnchorPath(path);
      }
      setAnnotatePath(path);
    },
    [selected],
  );

  const annotateEntry = annotatePath
    ? entries.find((e) => e.path === annotatePath) ?? null
    : null;

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-stone-500">
        nothing here yet. hover the ruforge icon top-left and capture one.
      </p>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
          {selected.size > 0 ? `${selected.size} selected` : `${entries.length} captures`}
        </span>
        <button
          type="button"
          disabled={selected.size !== 1}
          onClick={() => {
            const path = selectedPaths[0];
            if (path) openAnnotate(path);
          }}
          className="px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all border active:scale-95 disabled:opacity-40 disabled:pointer-events-none bg-[#1D1613] text-[color:var(--accent)] border-[color-mix(in_srgb,var(--accent),transparent_80%)] hover:bg-stone-800"
        >
          ANNOTATE
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map((entry) => (
          <DevCaptureThumb
            key={`${entry.path}-${entry.modifiedMs}-${thumbRev[entry.path] ?? 0}`}
            entry={entry}
            previewRev={thumbRev[entry.path] ?? 0}
            selected={selected.has(entry.path)}
            deleteMarked={deletePending?.paths.has(entry.path) ?? false}
            deleteAnchor={deletePending?.anchor === entry.path}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onAnnotate={openAnnotate}
            onContextMenu={handleContextMenu}
            selectedPaths={selectedPaths}
          />
        ))}
      </div>

      <DevCaptureGridContextMenu
        menu={contextMenu}
        selectedCount={selected.size}
        onAnnotate={() => {
          const path = selectedPaths[0];
          if (path) openAnnotate(path);
        }}
        onCopy={() => void handleCopySelected()}
        onDelete={() => {
          const anchor = anchorPath ?? selectedPaths[0] ?? "";
          void deleteTargets(selectedPaths, anchor);
        }}
        onClearSelection={() => {
          setSelected(new Set());
          setAnchorPath(null);
        }}
        onClose={() => setContextMenu(null)}
      />

      {annotateEntry ? (
        <DevCaptureAnnotateModal
          entry={annotateEntry}
          onClose={() => setAnnotatePath(null)}
          onSaved={(path) => {
            setThumbRev((prev) => ({ ...prev, [path]: (prev[path] ?? 0) + 1 }));
            setAnnotatePath(null);
            onRefresh();
          }}
        />
      ) : null}
    </>
  );
}
