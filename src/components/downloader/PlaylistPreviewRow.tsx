import { useState, type MouseEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Music, Undo2, Video, X } from "lucide-react";

import type { DownloadJob } from "../../downloadQueue";
import type { PlaylistItem } from "../../types";
import { formatApproxFileSize, formatDuration } from "./downloaderFormat";
import { RollText } from "./RollText";
import { StorageBlockNote } from "./StorageBlockNote";

type Props = {
  /** Number the file gets (kept rows only). Null while the row is cancelled. */
  number: number | null;
  lifted?: boolean;
  item: PlaylistItem;
  audioOnly: boolean;
  duplicate: boolean;
  batchJob: DownloadJob | null | undefined;
  onToggleAudio: () => void;
  /** Cancel/restore control; omitted once the playlist is queued. */
  excluded?: boolean;
  onToggleExcluded?: (e: MouseEvent) => void;
  /** Quiet reason the size probe failed for this row. */
  sizeError?: string;
};

export function PlaylistPreviewRow({
  number,
  lifted = false,
  item,
  audioOnly,
  duplicate,
  batchJob,
  onToggleAudio,
  excluded = false,
  onToggleExcluded,
  sizeError,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const downloading = batchJob?.status === "downloading";
  const shellOpen = (hovered || downloading || lifted) && !excluded;
  const bytes = audioOnly
    ? (item.fileSizeBytesAudio ?? item.fileSizeBytes)
    : (item.fileSizeBytesVideo ?? item.fileSizeBytes);
  const FormatIcon = audioOnly ? Music : Video;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative isolate flex items-center gap-2 p-1.5 min-[750px]:gap-3 min-[750px]:p-2 ${duplicate && !excluded ? "opacity-55" : ""}`}
    >
      <motion.div
        aria-hidden
        initial={false}
        animate={{ opacity: shellOpen ? 1 : 0, scale: shellOpen ? 1 : 0.92 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute inset-0 -z-10 origin-center rounded-[24px] bg-[color:var(--rf-well-raised)]"
      />
      <span
        aria-hidden
        className={`grid w-8 shrink-0 select-none place-items-center pb-[0.08em] text-center font-display font-extrabold leading-none tracking-tighter tabular-nums transition-colors duration-150 min-[750px]:w-11 ${
          (number ?? 0) >= 100
            ? "text-[18px] min-[750px]:text-[26px]"
            : "text-[28px] min-[750px]:text-[44px]"
        } ${
          downloading
            ? "text-[color:var(--accent)]"
            : "text-transparent [-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--text-muted)_60%,transparent)] group-hover:[-webkit-text-stroke-color:var(--accent)]"
        }`}
      >
        {number}
      </span>
      <div
        className={`relative aspect-video w-20 shrink-0 overflow-hidden rounded-[var(--r-media,16px)] bg-[color:var(--rf-well-raised)] min-[750px]:w-28 ${
          excluded ? "grayscale" : ""
        }`}
      >
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-150 ease-out group-hover:scale-[1.03]"
          />
        ) : null}
        {item.duration > 0 && (
          <span className="absolute bottom-1 right-1 rounded-md bg-black/80 px-1 py-px text-[10px] font-semibold tabular-nums leading-tight text-stone-100 min-[750px]:bottom-1.5 min-[750px]:right-1.5">
            {formatDuration(item.duration)}
          </span>
        )}
        {duplicate && !excluded && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#EDD79C]">
            In library
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p
          data-tooltip={item.title}
          className="line-clamp-2 pb-px text-[12px] font-semibold leading-snug text-stone-200 group-hover:text-white min-[750px]:text-[13px]"
        >
          {item.title}
        </p>
        <div className="mt-1 flex items-center gap-2 min-[750px]:mt-1.5">
          {excluded ? (
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-stone-400">
              Cancelled
            </span>
          ) : (
            <button
              type="button"
              onClick={onToggleAudio}
              aria-label={audioOnly ? "Switch to video download" : "Switch to audio-only download"}
              data-tooltip={audioOnly ? "Switch to video" : "Switch to audio only"}
              className="flex h-5 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--rf-well-raised),white_7%)] pl-1.5 pr-2 text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--accent)] transition-[transform,background-color] hover:bg-[color-mix(in_srgb,var(--rf-well-raised),white_12%)] active:scale-[0.94]"
            >
              <FormatIcon size={10} strokeWidth={2.75} />
              <RollText id={audioOnly ? "a" : "v"}>
                {audioOnly ? "Audio" : "Video"}
              </RollText>
            </button>
          )}
          {!excluded && bytes != null && bytes > 0 && (
            <span data-tooltip="Approximate size" className="text-[11px] font-semibold tabular-nums text-stone-400">
              <RollText id={`${audioOnly ? "a" : "v"}-${bytes}`}>
                {formatApproxFileSize(bytes)}
              </RollText>
            </span>
          )}
          {!excluded && (bytes == null || bytes <= 0) && sizeError && (
            <span className="text-[10px] font-semibold text-stone-500">{sizeError}</span>
          )}
        </div>
        {batchJob?.storageBlock && <StorageBlockNote job={batchJob} className="mt-1" />}
      </div>
      {onToggleExcluded && (
        <button
          type="button"
          onClick={onToggleExcluded}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={excluded ? "Restore this video" : "Cancel this video"}
          data-tooltip={
            excluded
              ? "Restore (Shift-click for a range)"
              : "Don't download (Shift-click for a range)"
          }
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--rf-well-raised),white_7%)] text-stone-300 transition-[opacity,transform,background-color] hover:bg-[color-mix(in_srgb,var(--rf-well-raised),white_14%)] hover:text-white active:scale-[0.92] ${
            excluded ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          }`}
        >
          {excluded ? <Undo2 size={13} strokeWidth={2.75} /> : <X size={13} strokeWidth={2.75} />}
        </button>
      )}
    </div>
  );
}
