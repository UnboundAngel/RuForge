import { useCallback, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { videoItemKey } from "@/lib/playlistSession/itemKey";
import type { FileRow } from "./playlistRows";
import type { FlyState } from "./CoverFly";
import { addedFromSuggested, announceIncoming, type AddFly } from "./addFlyRegistry";

const PENDING_MS = 2000;

/** A shelf card that was just added flies into the thumbnail slot of the row it became. */
export function useAddFly(fileRows: readonly FileRow[], rowEls: MutableRefObject<Map<string, HTMLDivElement>>, enabled: boolean) {
  const pending = useRef<{ fly: AddFly; at: number } | null>(null);
  const known = useRef<Set<string> | null>(null);
  const [fly, setFly] = useState<FlyState | null>(null);

  useLayoutEffect(() => {
    const keys = new Set(fileRows.map((r) => r.key));
    const prev = known.current;
    known.current = keys;
    const p = pending.current;
    if (!prev || !p) return;
    if (Date.now() - p.at > PENDING_MS) {
      pending.current = null;
      return;
    }
    const added = [...keys].find((k) => !prev.has(k));
    const slot = added ? rowEls.current.get(added)?.querySelector(".rf-art-clip") : null;
    if (!added || !slot) return;
    pending.current = null;
    addedFromSuggested.set(added, p.fly);
    // The page never scrolls for an add: a row outside the visible list is flown to the nearest edge.
    const track = () => {
      const r = slot.getBoundingClientRect();
      const box = slot.closest(".rf-scrollbar")?.getBoundingClientRect();
      const top = box ? Math.min(Math.max(r.top, box.top), Math.max(box.top, box.bottom - r.height)) : r.top;
      return { left: r.left, top, width: r.width, height: r.height };
    };
    setFly({ src: p.fly.src, from: p.fly.from, to: track(), track });
  }, [fileRows, rowEls]);

  const begin = useCallback(
    (f: AddFly | undefined) => {
      if (!f || !enabled) return;
      announceIncoming(videoItemKey(f.file));
      pending.current = { fly: f, at: Date.now() };
    },
    [enabled],
  );
  return { fly, begin, clear: () => setFly(null) };
}
