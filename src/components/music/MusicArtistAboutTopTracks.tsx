import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { motion, useReducedMotion } from "framer-motion";
import { Icon } from "@iconify/react";
import type { MediaFile } from "@/types";
import { bestCoverPath } from "@/mediaKind";
import { albumCoverPathWithFallback } from "@/albumCoverPath";
import { cn } from "@/lib/utils";

export type AboutTopTrack = { key: string; title: string; playCount: number; file: MediaFile | null };

const EASE = [0.16, 1, 0.3, 1] as const;

export function MusicArtistAboutTopTracks({
  tracks,
  onPlay,
}: {
  tracks: AboutTopTrack[];
  onPlay?: (file: MediaFile) => void;
}) {
  const max = Math.max(1, ...tracks.map((t) => t.playCount));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/50">Your top tracks</p>
      <ol className="-mx-2 flex flex-col gap-0.5">
        {tracks.map((t, i) => (
          <TopTrackRow key={t.key} track={t} rank={i + 1} share={t.playCount / max} onPlay={onPlay} />
        ))}
      </ol>
    </div>
  );
}

function TopTrackRow({
  track,
  rank,
  share,
  onPlay,
}: {
  track: AboutTopTrack;
  rank: number;
  share: number;
  onPlay?: (file: MediaFile) => void;
}) {
  const reduceMotion = useReducedMotion();
  const playable = !!(track.file && onPlay);
  return (
    <li>
      <button
        type="button"
        disabled={!playable}
        onClick={() => track.file && onPlay?.(track.file)}
        data-tooltip={playable ? `Play ${track.title}` : undefined}
        className="group/top flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors enabled:hover:bg-white/[0.06] disabled:cursor-default"
      >
        <span
          className={cn(
            "w-4 shrink-0 text-center text-[15px] font-extrabold tabular-nums",
            rank === 1 ? "text-[var(--music-accent)]" : "text-white/35",
          )}
        >
          {rank}
        </span>
        <TopTrackCover file={track.file} playable={playable} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-white">{track.title}</span>
          <span className="mt-1 flex items-center gap-2">
            <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
              <motion.span
                className="absolute inset-0 origin-left rounded-full bg-[var(--music-accent)]"
                style={{ opacity: rank === 1 ? 1 : 0.55 }}
                initial={reduceMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: share }}
                transition={{ duration: 0.6, delay: 0.1 + rank * 0.05, ease: EASE }}
              />
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-white/55">{track.playCount}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

function TopTrackCover({ file, playable }: { file: MediaFile | null; playable: boolean }) {
  const paths = file ? albumCoverPathWithFallback(file) : null;
  const chain = file && paths
    ? [...new Set([paths.primary, paths.fallback, bestCoverPath(file)])].filter((p): p is string => !!p)
    : [];
  const [idx, setIdx] = useState(0);
  const src = chain[idx] ? convertFileSrc(chain[idx]) : null;
  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white/[0.07]">
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setIdx((i) => i + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-white/30">
          <Icon icon="solar:music-note-bold" width={16} height={16} aria-hidden />
        </span>
      )}
      {playable && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity duration-150 group-hover/top:opacity-100">
          <Icon icon="tabler:player-play-filled" width={14} height={14} aria-hidden />
        </span>
      )}
    </span>
  );
}
