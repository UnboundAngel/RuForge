import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Check, ChevronDown, Loader2, Music, Pause, Play } from "lucide-react";
import type { MediaFile } from "@/types";
import { bestCoverPath } from "@/mediaKind";
import { albumCoverPathWithFallback } from "@/albumCoverPath";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/playlistImport/normalize";
import {
  type ImportRow,
  chooseImportCandidate,
  outsideTrackFor,
  setImportRow,
} from "@/playlistImport/importSession";
import { useSongPreview } from "./MusicPreviewButton";
import { type PreviewSource, toggleMusicPreview } from "./musicPreview";

export const IMPORT_ROW_GRID = "grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1.2fr)_76px] items-center gap-4";

function sourceMeta(row: ImportRow): string {
  const bits = [row.source.artists.join(", ")];
  if (row.source.durationSec != null) bits.push(formatDuration(row.source.durationSec));
  if (row.source.unclear) bits.push("hard to read");
  return bits.join(" · ");
}

export function ImportRowView({
  row,
  index,
  altOpen,
  onToggleAlt,
  onPicked,
}: {
  row: ImportRow;
  index: number;
  altOpen: boolean;
  onToggleAlt: () => void;
  onPicked: () => void;
}) {
  const settled = row.state === "done" || row.state === "failed";
  const canInclude = settled && row.choice >= 0;
  const chosen = row.choice >= 0 ? row.candidates[row.choice] : undefined;

  return (
    <li className={cn("rounded-xl transition-colors", altOpen ? "bg-white/[0.06]" : "hover:bg-white/[0.04]")}>
      <div className={cn(IMPORT_ROW_GRID, "px-2 py-2")}>
        <IncludeToggle
          checked={row.include && canInclude}
          disabled={!canInclude}
          onChange={(v) => setImportRow(index, { include: v })}
          label={row.source.title}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{row.source.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-white/50">{sourceMeta(row)}</p>
        </div>

        {!settled ? (
          <div className="flex items-center gap-3 text-[12px] text-white/40">
            <span className="h-10 w-10 shrink-0 rounded-md bg-white/[0.04]" />
            {row.state === "searching" ? (
              <span className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" /> Searching
              </span>
            ) : (
              "Waiting"
            )}
          </div>
        ) : chosen ? (
          <div className="flex min-w-0 items-center gap-3">
            <CandidateThumb source={{ kind: "outside", track: outsideTrackFor(chosen) }} thumbnail={chosen.track.thumbnail} />
            <button
              type="button"
              onClick={onToggleAlt}
              aria-expanded={altOpen}
              disabled={row.candidates.length < 2}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left disabled:cursor-default"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-white/85">{chosen.track.title}</p>
                <p className="mt-0.5 truncate text-[12px] text-white/45">
                  {chosen.track.artist ?? "Unknown channel"}
                  {chosen.track.duration != null ? ` · ${formatDuration(chosen.track.duration)}` : ""}
                </p>
              </div>
              {row.candidates.length > 1 ? (
                <ChevronDown
                  size={16}
                  className={cn("shrink-0 text-white/40 transition-transform", altOpen && "rotate-180")}
                />
              ) : null}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[12px] text-white/45">
            <span className="h-10 w-10 shrink-0 rounded-md bg-white/[0.04]" />
            {row.state === "failed" ? "Search failed" : "Nothing close turned up"}
          </div>
        )}

        <div className="flex justify-end">{settled ? <StatusBadge bucket={row.bucket} /> : null}</div>
      </div>

      {altOpen ? (
        <ul className="flex flex-col gap-0.5 px-2 pb-2 pl-[52px]" aria-label="Other results">
          {row.candidates.map((c, i) => (
            <li key={c.track.id}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5",
                  i === row.choice ? "bg-white/[0.08]" : "hover:bg-white/[0.05]",
                )}
              >
                <CandidateThumb source={{ kind: "outside", track: outsideTrackFor(c) }} thumbnail={c.track.thumbnail} small />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    chooseImportCandidate(index, i);
                    onPicked();
                  }}
                >
                  <p className={cn("truncate text-[13px]", i === row.choice ? "text-[#ff4d6a]" : "text-white")}>{c.track.title}</p>
                  <p className="truncate text-[12px] text-white/50">
                    {c.track.artist ?? "Unknown channel"}
                    {c.track.duration != null ? ` · ${formatDuration(c.track.duration)}` : ""}
                  </p>
                </button>
                {i === row.choice ? <Check size={15} className="shrink-0 text-[#ff4d6a]" /> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Confident matches stay quiet; only rows that need a look get a label. */
function StatusBadge({ bucket }: { bucket: ImportRow["bucket"] }) {
  if (bucket === "check") {
    return (
      <span className="rounded-full bg-amber-400/[0.12] px-2 py-0.5 text-[11px] font-bold text-amber-300">
        Check
      </span>
    );
  }
  if (bucket === "missing") {
    return (
      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-white/50">
        Not found
      </span>
    );
  }
  return null;
}

export function IncludeToggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Include ${label}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full transition-[background-color,transform] active:scale-90 disabled:opacity-30",
        checked ? "bg-[#ff0033] text-white" : "bg-white/[0.1] text-transparent hover:bg-white/[0.16]",
      )}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}

/** Result art with a play button on hover that streams a short preview. */
function CandidateThumb({ source, thumbnail, small }: { source: PreviewSource; thumbnail: string | null; small?: boolean }) {
  const { status } = useSongPreview(source);
  const [broken, setBroken] = useState(false);
  const size = small ? "h-8 w-8" : "h-10 w-10";
  return (
    <button
      type="button"
      onClick={() => void toggleMusicPreview(source)}
      className={cn("group/thumb relative shrink-0 overflow-hidden rounded-md bg-white/[0.06]", size)}
      aria-label={status === "playing" ? "Pause preview" : "Preview"}
      data-tooltip={status === "playing" ? "Pause preview" : "Preview"}
    >
      {thumbnail && !broken ? (
        <img src={thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : null}
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-black/55 text-white transition-opacity",
          status ? "opacity-100" : "opacity-0 group-hover/thumb:opacity-100 focus-visible:opacity-100",
        )}
      >
        {status === "loading" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : status === "playing" ? (
          <Pause size={15} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={15} fill="currentColor" strokeWidth={0} className="translate-x-px" />
        )}
      </span>
    </button>
  );
}

/** Songs already owned: nothing to decide beyond keeping them, so they sit grouped under the list. */
export function ImportLibraryGroup({ items }: { items: { row: ImportRow; index: number }[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-6">
      <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">
        Already in your library · {items.length}
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {items.map(({ row, index }) => (
          <li key={index} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
            <IncludeToggle
              checked={row.include}
              disabled={false}
              onChange={(v) => setImportRow(index, { include: v })}
              label={row.source.title}
            />
            {row.library ? <LibraryCover file={row.library} /> : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">
                {row.library?.canonicalTitle ?? row.source.title}
              </p>
              <p className="truncate text-[12px] text-white/45">{row.source.artists.join(", ")}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LibraryCover({ file }: { file: MediaFile }) {
  const paths = albumCoverPathWithFallback(file);
  const chain = [...new Set([paths.primary, paths.fallback, bestCoverPath(file)])].filter((p): p is string => !!p);
  const [idx, setIdx] = useState(0);
  const src = chain[idx] ? convertFileSrc(chain[idx]) : null;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/[0.06] text-white/30">
      {src ? (
        <img src={src} alt="" draggable={false} onError={() => setIdx((i) => i + 1)} className="h-full w-full object-cover" />
      ) : (
        <Music size={15} aria-hidden />
      )}
    </span>
  );
}
