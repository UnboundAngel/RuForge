import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaFile } from "@/types";
import { MusicQuickPickRow } from "./MusicQuickPickRow";
import {
  quickPickColumnCount,
  quickPickVisibleCount,
} from "./musicQuickPicksLayout";

export { QUICK_PICKS_POOL_CAP } from "./musicQuickPicksLayout";

type Props = {
  files: MediaFile[];
  onPlay: (file: MediaFile) => void;
  menuOpenPath: string | null;
  onContextMenu: (file: MediaFile, e: React.MouseEvent) => void;
};

/** Grid that only shows as many picks as fit: up to 4 cols × 3 rows. */
export function MusicQuickPicksGrid({
  files,
  onPlay,
  menuOpenPath,
  onContextMenu,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(2);

  const measure = useCallback(() => {
    const el = gridRef.current;
    if (!el) return;
    setCols(quickPickColumnCount(el.clientWidth));
  }, []);

  useEffect(() => {
    measure();
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const visible = files.slice(0, quickPickVisibleCount(cols));

  return (
    <section className="w-full min-w-0 overflow-x-hidden">
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: "var(--music-text-primary)" }}>
          Quick picks
        </h2>
      </div>
      <div
        ref={gridRef}
        className="grid gap-3 w-full min-w-0 overflow-x-hidden"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {visible.map((file) => (
          <MusicQuickPickRow
            key={file.path}
            file={file}
            onClick={() => onPlay(file)}
            menuOpen={menuOpenPath === file.path}
            onContextMenu={(e) => onContextMenu(file, e)}
          />
        ))}
      </div>
    </section>
  );
}
