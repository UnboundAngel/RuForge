import { useEffect, useRef } from "react";
import { Check, Loader2, Play, Plus } from "lucide-react";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import { localImageSrc } from "@/lib/localImageSrc";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { useOutsideDownloadPercent } from "@/components/music/useMusicOutsideRecommendations";
import { FeedPreviewVideo, PreviewButton } from "@/components/library/FeedVideoCard";
import { stopFeedPreview, useFeedPreview } from "@/components/library/feedPreview";
import type { FeedVideo } from "@/components/library/youtubeFeed";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { rowTitle } from "./playlistRows";
import { fleeingCards, type AddFly } from "./addFlyRegistry";
import { CARD_W } from "./ShelfSlot";

const HOVER_IN =
  "opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0";
const PILL =
  "absolute bottom-2 left-2 z-20 flex h-10 items-center gap-1.5 rounded-full bg-black/70 pl-3 pr-3.5 text-[12px] font-bold text-white transition-[opacity,translate,scale,background-color] duration-200 hover:scale-105 hover:bg-black/85";
const ADD =
  "absolute bottom-2 right-2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--accent)] text-[color:var(--rf-on-accent)] shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-[opacity,translate,scale] duration-200 hover:scale-105 active:scale-95";
const DURATION =
  "absolute right-2 top-2 rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-bold tabular-nums tracking-wider text-white";

function CardShell({
  children,
  byline,
  coverRef,
}: {
  children: React.ReactNode;
  byline: React.ReactNode;
  coverRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div data-card-body className="group/card rounded-lg p-2 transition-colors duration-200 hover:bg-white/[0.07]" style={{ width: CARD_W }}>
      <div data-squish-cover className="rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform duration-150 ease-out">
        <div ref={coverRef} className="rf-art-clip relative aspect-video w-full bg-white/[0.07] [--rf-art-r:6px]">
          {children}
        </div>
      </div>
      <div className="mt-2 min-w-0">{byline}</div>
    </div>
  );
}

function Byline({ title, channel }: { title: string; channel: string | null | undefined }) {
  return (
    <>
      <div className="truncate text-sm font-bold text-white">{title}</div>
      <div className="truncate text-xs text-white/60 transition-colors group-hover/card:text-white/80">{channel || "YouTube"}</div>
    </>
  );
}

export function LocalSuggestionCard({
  file,
  index,
  onAdd,
}: {
  file: MediaFile;
  index: number;
  onAdd: (file: MediaFile, fly?: AddFly) => void;
}) {
  const coverRef = useRef<HTMLDivElement>(null);
  const handlePlayFile = useRuforgeStore((s) => s.handlePlayFile);
  const thumb = file.thumbnailPath || file.ruforgePosterPath;
  const title = rowTitle(file.name);
  return (
    <CardShell coverRef={coverRef} byline={<Byline title={title} channel={file.youtube?.channel} />}>
      {thumb ? (
        <img src={localImageSrc(thumb)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <div className={DURATION}>{formatDuration(file.duration)}</div>
      <button type="button" onClick={() => void handlePlayFile(file, undefined, null)} aria-label={`Play ${title}`} className={cn(PILL, HOVER_IN)}>
        <Play size={16} fill="currentColor" strokeWidth={0} className="translate-x-px" />
        Play
      </button>
      <button type="button" onClick={(e) => {
          const from = coverRef.current?.getBoundingClientRect();
          fleeingCards.add(file.path);
          window.setTimeout(() => fleeingCards.delete(file.path), 1000);
          // Hidden in the DOM now: the flight starts from this rect and the image must not show twice.
          e.currentTarget.closest<HTMLElement>("[data-card-body]")?.style.setProperty("visibility", "hidden");
          onAdd(file, thumb && from ? { src: thumb, from, file, index } : undefined);
        }} aria-label={`Add ${title} to this playlist`} data-tooltip="Add to playlist" className={cn(ADD, HOVER_IN)}>
        <Plus size={20} strokeWidth={2.75} />
      </button>
    </CardShell>
  );
}

export function OutsideSuggestionCard({ video, onAdd }: { video: FeedVideo; onAdd: (video: FeedVideo) => void }) {
  const status = useFeedPreview((s) => (s.id === video.videoId ? s.status : null));
  const { queued, percent, failed } = useOutsideDownloadPercent(video.url);
  const busy = queued && !failed;
  useEffect(
    () => () => {
      if (useFeedPreview.getState().id === video.videoId) stopFeedPreview();
    },
    [video.videoId],
  );
  return (
    <CardShell byline={<Byline title={video.title} channel={video.channel} />}>
      {video.thumbnail ? (
        <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      {status ? <FeedPreviewVideo videoId={video.videoId} status={status} /> : null}
      {video.duration && !status ? <div className={DURATION}>{formatDuration(video.duration)}</div> : null}
      <PreviewButton video={video} status={status} />
      <button
        type="button"
        disabled={busy}
        onClick={() => onAdd(video)}
        aria-label={busy ? `Downloading ${video.title}` : `Download ${video.title} and add it to this playlist`}
        data-tooltip={busy ? `Downloading ${Math.round(percent)}%` : failed ? "Download failed. Try again" : "Download and add"}
        className={cn(ADD, busy ? "opacity-100" : HOVER_IN)}
      >
        {busy ? (
          percent >= 100 ? <Check size={20} strokeWidth={3} /> : <Loader2 size={20} strokeWidth={2.75} className="animate-spin" />
        ) : (
          <Plus size={20} strokeWidth={2.75} />
        )}
      </button>
    </CardShell>
  );
}

export function SuggestionSkeleton() {
  return (
    <div className="p-2" style={{ width: CARD_W }} aria-hidden>
      <div className="aspect-video w-full animate-pulse rounded-md bg-white/[0.07]" />
      <div className="mt-3 h-3 w-4/5 animate-pulse rounded bg-white/[0.07]" />
      <div className="mt-2 h-2.5 w-1/2 animate-pulse rounded bg-white/[0.05]" />
    </div>
  );
}
