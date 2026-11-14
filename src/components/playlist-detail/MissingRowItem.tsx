import { FileX, FolderSearch, Trash2 } from "lucide-react";
import type { MissingRow } from "./playlistRows";

type Props = {
  row: MissingRow;
  canRelocate: boolean;
  onRelocate: (row: MissingRow) => void;
  onRemove: (row: MissingRow) => void;
};

const ACTION =
  "inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-2 text-[11px] font-semibold text-stone-300 transition-colors hover:bg-white/[0.1] hover:text-white";

/** A saved item whose file is gone: grey, with the two ways out. */
export function MissingRowItem({ row, canRelocate, onRelocate, onRemove }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-2 py-3 opacity-80">
      <div className="w-8 shrink-0 text-center font-mono text-[13px] font-semibold tabular-nums text-stone-500">
        {row.position}
      </div>
      <div className="w-40 flex-shrink-0 sm:w-44">
        <div className="rf-art-clip flex aspect-video items-center justify-center bg-stone-900/70">
          <FileX size={22} className="text-stone-700" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-bold text-stone-500">{row.name}</h3>
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.15em] text-stone-600">Missing</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canRelocate ? (
          <button type="button" className={ACTION} onClick={() => onRelocate(row)}>
            <FolderSearch size={13} />
            Relocate
          </button>
        ) : null}
        <button type="button" className={ACTION} onClick={() => onRemove(row)}>
          <Trash2 size={13} />
          Remove
        </button>
      </div>
    </div>
  );
}
