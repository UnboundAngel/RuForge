import { memo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Music, Video } from "lucide-react";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { formatAge } from "@/components/library/youtubeFeed";
import { useBakedBarCrop } from "@/hooks/useBakedBarCrop";
import { getWatchProgress } from "@/playbackStorage";
import { OVERLAY_EASE } from "@/lib/overlayMotion";
import { cn } from "@/lib/utils";
import { isAudioOnlyPath } from "../../../mediaKind";
import type { MediaFile } from "../../../types";

export const nextUpTitle = (item: MediaFile) => item.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "");

/**
 * Cards read `channel · 3 weeks ago` (local files with no sidecar fall back to when they were added).
 * The playing item reads `channel · 12:04`; its age is not what you glance at it for.
 */
export function nextUpMeta(item: MediaFile, nowPlaying = false): string {
  const parts: string[] = [];
  const channel = item.youtube?.channel?.trim();
  if (channel) parts.push(channel);
  if (nowPlaying) {
    if (item.duration > 0) parts.push(formatDuration(item.duration));
  } else if (item.youtube?.publishedAt) {
    parts.push(formatAge(item.youtube.publishedAt));
  } else if (item.created > 0) {
    parts.push(`added ${formatAge(item.created)}`);
  }
  return parts.join(" · ");
}

export function NextUpThumb({
  item,
  className,
  radius,
  children,
}: {
  item: MediaFile;
  className?: string;
  radius: number;
  children?: React.ReactNode;
}) {
  const progress = getWatchProgress(item.path, item.duration);
  const Icon = isAudioOnlyPath(item.path) ? Music : Video;
  const crop = useBakedBarCrop();
  return (
    <div
      className={cn("rf-art-clip relative aspect-video shrink-0 bg-[color:var(--rf-well-raised)]", className)}
      style={{ ["--rf-art-r" as string]: `${radius}px` }}
    >
      <FallbackImg
        src={[item.thumbnailPath, item.ruforgePosterPath]}
        local
        loading="lazy"
        decoding="async"
        onLoad={crop.onLoad}
        style={crop.style}
        className="absolute inset-0 h-full w-full object-cover transition-[scale] duration-300 ease-out group-hover/card:scale-[1.03]"
        fallback={(
          <div className="absolute inset-0 flex items-center justify-center bg-[color:var(--rf-well-raised)]">
            <Icon size={22} className="text-stone-600" strokeWidth={1.5} aria-hidden />
          </div>
        )}
      />
      {children}
      {progress > 0 ? (
        <div className="absolute bottom-0 left-0 right-0 z-10 h-1 overflow-hidden bg-white/15">
          <div className="h-full bg-[color:var(--accent)]" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  item: MediaFile;
  /** The first card of Up next: a wider thumb so what plays next reads at a glance. */
  lead?: boolean;
  onSelect: (item: MediaFile) => void;
};

export const NextUpCard = memo(function NextUpCard({ item, lead = false, onSelect }: Props) {
  const [hovered, setHovered] = useState(false);
  const [clipped, setClipped] = useState(false);
  const titleRef = useRef<HTMLSpanElement>(null);
  const title = nextUpTitle(item);
  const meta = nextUpMeta(item);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      onMouseEnter={() => {
        setHovered(true);
        const el = titleRef.current;
        setClipped(!!el && el.scrollHeight > el.clientHeight + 1);
      }}
      onMouseLeave={() => setHovered(false)}
      className="group/card relative z-0 flex w-full cursor-pointer items-start gap-3 rounded-[16px] border-none bg-transparent p-2 text-left outline-none transition-transform duration-150 ease-out active:scale-[0.97]"
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ opacity: hovered ? 1 : 0, scale: hovered ? 1 : 0.92 }}
        transition={{ duration: 0.22, ease: OVERLAY_EASE }}
        className="pointer-events-none absolute inset-0 -z-10 origin-center rounded-[16px] bg-[color:var(--rf-well-raised)]"
      />
      <NextUpThumb item={item} radius={10} className={lead ? "w-[200px]" : "w-[168px]"}>
        {item.duration > 0 ? (
          <span className="absolute bottom-1.5 right-1.5 z-10 rounded bg-black/75 px-1 py-px text-[10px] font-semibold tabular-nums leading-tight text-white">
            {formatDuration(item.duration)}
          </span>
        ) : null}
      </NextUpThumb>
      <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <span
          ref={titleRef}
          data-tooltip={clipped ? title : undefined}
          className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-stone-100 transition-colors duration-150 group-hover/card:text-[color:var(--accent)]"
        >
          {title}
        </span>
        {meta ? <HoverMarqueeText text={meta} active={hovered} className="text-[11px] text-stone-500" /> : null}
      </span>
    </button>
  );
});
