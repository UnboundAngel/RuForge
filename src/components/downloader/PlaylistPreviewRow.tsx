import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Music, Video } from "lucide-react";

import type { DownloadJob } from "../../downloadQueue";
import type { PlaylistItem } from "../../types";
import { formatApproxFileSize, formatDuration } from "./downloaderFormat";
import { RollText } from "./RollText";
import { StorageBlockNote } from "./StorageBlockNote";

type Props = {
  index: number;
  lifted?: boolean;
  item: PlaylistItem;
  audioOnly: boolean;
  duplicate: boolean;
  batchJob: DownloadJob | null | undefined;
  onToggleAudio: () => void;
};

export function PlaylistPreviewRow({
  index,
  lifted = false,
  item,
  audioOnly,
  duplicate,
  batchJob,
  onToggleAudio,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const downloading = batchJob?.status === "downloading";
  const shellOpen = hovered || downloading || lifted;
  const bytes = audioOnly
    ? (item.fileSizeBytesAudio ?? item.fileSizeBytes)
    : (item.fileSizeBytesVideo ?? item.fileSizeBytes);
  const FormatIcon = audioOnly ? Music : Video;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative isolate flex items-center gap-3 p-2 ${duplicate ? "opacity-55" : ""}`}
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
        className={`w-11 shrink-0 select-none pb-[0.08em] text-center font-display font-extrabold leading-none tracking-tighter tabular-nums transition-colors duration-150 ${
          index >= 100 ? "text-[26px]" : "text-[44px]"
        } ${
          downloading
            ? "text-[color:var(--accent)]"
            : "text-transparent [-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--text-muted)_60%,transparent)] group-hover:[-webkit-text-stroke-color:var(--accent)]"
        }`}
      >
        {index}
      </span>
      <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-[var(--r-media,16px)] bg-[color:var(--rf-well-raised)]">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-150 ease-out group-hover:scale-[1.03]"
          />
        ) : null}
        {item.duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1 py-px text-[10px] font-semibold tabular-nums leading-tight text-stone-100">
            {formatDuration(item.duration)}
          </span>
        )}
        {duplicate && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#EDD79C]">
            In library
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p
          data-tooltip={item.title}
          className="line-clamp-2 pb-px text-[13px] font-semibold leading-snug text-stone-200 group-hover:text-white"
        >
          {item.title}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
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
          {bytes != null && bytes > 0 && (
            <span data-tooltip="Approximate size" className="text-[11px] font-semibold tabular-nums text-stone-400">
              <RollText id={`${audioOnly ? "a" : "v"}-${bytes}`}>
                {formatApproxFileSize(bytes)}
              </RollText>
            </span>
          )}
        </div>
        {batchJob?.storageBlock && <StorageBlockNote job={batchJob} className="mt-1" />}
      </div>
    </div>
  );
}
