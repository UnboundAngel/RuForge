import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { askConfirm } from "../ConfirmDialog";
import { applyExplorerLikeClick } from "../../lib/explorerLikeSelection";
import type { DevCaptureEntry } from "../../lib/devCapturesTypes";
import { DevCaptureThumb } from "./DevCaptureThumb";
import { DevCaptureAnnotateModal } from "./DevCaptureAnnotateModal";

type DevCapturesGridProps = {
  entries: DevCaptureEntry[];
  onRefresh: () => void;
};

export function DevCapturesGrid({ entries, onRefresh }: DevCapturesGridProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [annotatePath, setAnnotatePath] = useState<string | null>(null);
  const [thumbRev, setThumbRev] = useState<Record<string, number>>({});

  const orderedPaths = useMemo(() => entries.map((e) => e.path), [entries]);

  useEffect(() => {
    const live = new Set(entries.map((e) => e.path));
    setSelected((prev) => {
      const next = new Set([...prev].filter((p) => live.has(p)));
      return next.size === prev.size ? prev : next;
    });
    setAnchorPath((prev) => (prev && live.has(prev) ? prev : null));
  }, [entries]);

  const selectedPaths = useMemo(
    () => orderedPaths.filter((p) => selected.has(p)),
    [orderedPaths, selected],
  );

  const handleSelect = useCallback(
    (path: string, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
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

  const handleDelete = useCallback(
    async (clickedPath: string) => {
      const targets = resolveDeleteTargets(clickedPath);
      if (targets.length === 0) return;

      if (targets.length > 1) {
        const ok = await askConfirm({
          title: "Delete captures",
          message: `Delete ${targets.length} selected captures from disk? This cannot be undone.`,
          confirmLabel: "Delete",
        });
        if (!ok) return;
      }

      try {
        await invoke("delete_dev_captures", { paths: targets });
        setSelected((prev) => {
          const next = new Set(prev);
          for (const p of targets) next.delete(p);
          return next;
        });
        onRefresh();
      } catch (e) {
        console.error("[dev-captures] delete failed", e);
      }
    },
    [resolveDeleteTargets, onRefresh],
  );

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
        nothing here yet. save a snip into the folder and tab back in.
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
            onSelect={handleSelect}
            onDelete={handleDelete}
            onAnnotate={openAnnotate}
            selectedPaths={selectedPaths}
          />
        ))}
      </div>

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
