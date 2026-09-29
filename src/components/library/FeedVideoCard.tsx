import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Download, Loader2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { useOutsideDownloadPercent } from "@/components/music/useMusicOutsideRecommendations";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { openUrlInExplorer } from "@/watchlist/watchlistActions";
import { downloadFeedVideo } from "./downloadFeedVideo";
import { FeedVideoMenu, feedMenuKey } from "./FeedVideoMenu";
import { MetaParts, VideoByline } from "./VideoByline";
import {
  type FeedPreviewStatus,
  failFeedPreview,
  reportFeedPreviewTime,
  setFeedPreviewMuted,
  stopFeedPreview,
  toggleFeedPreview,
  useFeedPreview,
} from "./feedPreview";
import { type FeedVideo, formatAge, formatViewCount } from "./youtubeFeed";

const SPRING = { type: "spring", stiffness: 520, damping: 30 } as const;

/** Plays the preview window over the thumbnail; the store decides what, this element just obeys. */
function FeedPreviewVideo({ videoId, status }: { videoId: string; status: FeedPreviewStatus }) {
  const src = useFeedPreview((s) => s.src);
  const start = useFeedPreview((s) => s.start);
  const muted = useFeedPreview((s) => s.muted);
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || status === "loading") return;
    if (status === "paused") el.pause();
    else if (el.paused) void el.play().catch(() => failFeedPreview(videoId));
  }, [status, videoId]);

  if (!src) return null;
  return (
    <video
      ref={ref}
      src={src}
      muted={muted}
      playsInline
      preload="auto"
      onLoadedMetadata={(e) => {
        e.currentTarget.currentTime = start;
        void e.currentTarget.play().catch(() => failFeedPreview(videoId));
      }}
      onPlaying={() => {
        setVisible(true);
        if (useFeedPreview.getState().status === "loading") useFeedPreview.setState({ status: "playing" });
      }}
      onTimeUpdate={(e) => reportFeedPreviewTime(videoId, e.currentTarget.currentTime, e.currentTarget.duration)}
      onError={() => failFeedPreview(videoId)}
      className={cn(
        "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

function PreviewButton({ video, status }: { video: FeedVideo; status: FeedPreviewStatus | null }) {
  const icon = status === "loading" ? "loading" : status === "playing" ? "pause" : "play";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void toggleFeedPreview(video);
      }}
      className={cn(
        "absolute bottom-2.5 left-2.5 z-20 flex h-10 items-center gap-1.5 rounded-full bg-black/70 pl-3 pr-3.5 text-white",
        "transition-[opacity,transform,background-color] duration-200 hover:scale-105 hover:bg-black/85",
        status
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0",
      )}
      aria-label={status === "playing" ? `Pause preview of ${video.title}` : `Preview ${video.title}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={icon}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={SPRING}
          className="flex"
        >
          {icon === "loading" ? (
            <Loader2 size={16} strokeWidth={2.75} className="animate-spin" />
          ) : icon === "pause" ? (
            <Pause size={16} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={16} fill="currentColor" strokeWidth={0} className="translate-x-px" />
          )}
        </motion.span>
      </AnimatePresence>
      <span className="text-[12px] font-bold">{status === "playing" ? "Pause" : status === "paused" ? "Resume" : "Preview"}</span>
    </button>
  );
}

function WatchButton({ video }: { video: FeedVideo }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void openUrlInExplorer(video.url);
      }}
      className={cn(
        "absolute bottom-2.5 left-2.5 z-20 flex h-10 items-center gap-1.5 rounded-full bg-black/70 pl-3 pr-3.5 text-white",
        "transition-[opacity,transform,background-color] duration-200 hover:scale-105 hover:bg-black/85",
        "opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0",
      )}
      aria-label={`Watch ${video.title} on YouTube`}
    >
      <Play size={16} fill="currentColor" strokeWidth={0} className="translate-x-px" />
      <span className="text-[12px] font-bold">Watch on YouTube</span>
    </button>
  );
}

const RING_R = 13;
const RING_C = 2 * Math.PI * RING_R;

function DownloadButton({ video }: { video: FeedVideo }) {
  const { queued, percent, failed, error } = useOutsideDownloadPercent(video.url);
  const done = queued && !failed && percent >= 100;
  const busy = queued && !failed && !done;
  const tooltip = failed ? (error ?? "Download failed, click to retry") : done ? "Downloaded" : busy ? `${Math.round(percent)}%` : "Download";
  return (
    <button
      type="button"
      disabled={busy || done}
      onClick={(e) => {
        e.stopPropagation();
        downloadFeedVideo(video);
      }}
      data-tooltip={tooltip}
      aria-label={failed ? `Retry download of ${video.title}` : `Download ${video.title}`}
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color,opacity] duration-150",
        failed
          ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
          : busy || done
            ? "text-[color:var(--accent)]"
            : "bg-white/[0.07] text-stone-200 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 hover:bg-[color:var(--accent)] hover:text-stone-900 active:scale-95",
      )}
    >
      {busy ? (
        <>
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r={RING_R} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={3} />
            <circle
              cx="18"
              cy="18"
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - Math.max(0.04, percent / 100))}
              className="transition-[stroke-dashoffset] duration-300"
            />
          </svg>
          <span className="text-[9px] font-black tabular-nums">{Math.round(percent)}</span>
        </>
      ) : done ? (
        <Check size={16} strokeWidth={3} />
      ) : failed ? (
        <RotateCcw size={15} strokeWidth={2.5} />
      ) : (
        <Download size={16} strokeWidth={2.5} />
      )}
    </button>
  );
}

/** A not-yet-downloaded video from the YouTube feed: preview it in place, one click to keep it. */
export const FeedVideoCard = memo(function FeedVideoCard({
  video,
  shape = "video",
  opensInExplorer = false,
}: {
  video: FeedVideo;
  /** `short` is the tall Shorts shelf: 9:16 frame and a lighter text block with no avatar. */
  shape?: "video" | "short";
  /** Click starts the video on YouTube in Explorer instead of previewing it in place. */
  opensInExplorer?: boolean;
}) {
  const status = useFeedPreview((s) => (s.id === video.videoId ? s.status : null));
  const progress = useFeedPreview((s) => (s.id === video.videoId ? s.progress : 0));
  const muted = useFeedPreview((s) => s.muted);
  const meta = [formatViewCount(video.viewCount), video.timestamp ? formatAge(video.timestamp) : null].filter(Boolean);
  const menuKey = feedMenuKey(video);
  const menuOpen = useRuforgeStore((s) => s.activeMenu?.path === menuKey && !s.activeMenu?.floating);
  const setGalleryActiveMenu = useRuforgeStore((s) => s.setGalleryActiveMenu);
  const download = useOutsideDownloadPercent(video.url);
  const [hovered, setHovered] = useState(false);

  const setMenuOpen = (next: boolean) => {
    if (next) setGalleryActiveMenu({ path: menuKey });
    else if (useRuforgeStore.getState().activeMenu?.path === menuKey) setGalleryActiveMenu(null);
  };

  const actions = (
    <div className="flex shrink-0 items-start gap-0.5">
      <DownloadButton video={video} />
      <FeedVideoMenu
        video={video}
        open={menuOpen}
        mounted={hovered || menuOpen}
        canDownload={!download.queued || download.failed}
        onOpenChange={setMenuOpen}
      />
    </div>
  );

  useEffect(
    () => () => {
      if (useFeedPreview.getState().id === video.videoId) stopFeedPreview();
    },
    [video.videoId],
  );

  return (
    <div
      className={cn("group/card relative flex flex-col gap-3 cursor-pointer", menuOpen ? "z-30" : "hover:z-20")}
      onClick={() => {
        if (menuOpen) return;
        if (opensInExplorer) void openUrlInExplorer(video.url);
        else void toggleFeedPreview(video);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setHovered(true);
        setMenuOpen(true);
      }}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[var(--r-media,16px)] bg-[color:var(--rf-well-raised)]",
          shape === "short" ? "aspect-[9/16]" : "aspect-video",
        )}
      >
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-out group-hover/card:scale-[1.03]"
          />
        ) : null}

        {status ? <FeedPreviewVideo videoId={video.videoId} status={status} /> : null}

        {status && status !== "loading" ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFeedPreviewMuted(!muted);
            }}
            aria-label={muted ? "Unmute preview" : "Mute preview"}
            className="absolute top-2.5 right-2.5 z-20 p-2 rounded-full bg-black/55 text-white transition-transform active:scale-90 hover:bg-black/70"
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        ) : null}

        {video.duration && !status && shape === "video" ? (
          <div className="absolute bottom-2.5 right-2.5 z-10 px-2 py-0.5 rounded-md bg-black/75 text-[11px] font-bold text-white tracking-wider tabular-nums">
            {formatDuration(video.duration)}
          </div>
        ) : null}

        {opensInExplorer ? <WatchButton video={video} /> : <PreviewButton video={video} status={status} />}

        {status ? (
          <div className="absolute inset-x-0 bottom-0 z-20 h-1 bg-white/15" aria-hidden>
            <div
              className="h-full origin-left bg-[color:var(--accent)] transition-transform duration-300 ease-linear"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
        ) : null}
      </div>

      {shape === "short" ? (
        <div className="flex gap-2 px-0.5">
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold leading-snug line-clamp-2 text-stone-50 transition-colors duration-150 group-hover/card:text-[color:var(--accent)]">
              {video.title}
            </h3>
            {video.viewCount != null ? (
              <p className="mt-1 truncate text-[13px] text-stone-400">{formatViewCount(video.viewCount)}</p>
            ) : null}
          </div>
          {actions}
        </div>
      ) : (
        <VideoByline
          channel={video.channel}
          channelId={video.channelId}
          verified={video.channelVerified ?? false}
          title={
            <h3 className="text-[15px] font-semibold leading-snug line-clamp-2 text-stone-50 transition-colors duration-150 group-hover/card:text-[color:var(--accent)]">
              {video.title}
            </h3>
          }
          meta={meta.length > 0 ? <MetaParts parts={meta} /> : null}
          action={actions}
        />
      )}
    </div>
  );
});
