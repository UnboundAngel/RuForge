import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaFile } from "@/types";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { noteSuggestedShelfVisible } from "@/lib/onboardingConditions";
import { EdgeSquishScroll } from "@/components/ui/EdgeSquishScroll";
import { SectionTitle } from "@/components/music/MusicRecommendedShelf";
import { addVideoToPlaylist } from "@/components/library/playlistUrlDrop";
import type { FeedVideo } from "@/components/library/youtubeFeed";
import type { AddFly } from "./addFlyRegistry";
import { CoverFly, type FlyState } from "./CoverFly";
import { FindMoreField } from "./FindMoreField";
import { LocalSuggestionCard, OutsideSuggestionCard, SuggestionSkeleton } from "./SuggestedCard";
import { CARD_W, ShelfSlot } from "./ShelfSlot";
import { useVideoSuggestions } from "./useVideoSuggestions";
import { useYoutubeSearch } from "./useYoutubeSearch";
import type { VideoSuggestion } from "./videoSuggestions";

export type SuggestedHandle = {
  /** Plays an add backwards: a gap opens at the card's old slot and the cover flies into it. */
  reverse: (fly: AddFly) => void;
};

type Props = {
  items: readonly MediaFile[];
  /** Record id of a video playlist, or the folder path of a disk one. */
  targetId: string;
  onAdd: (file: MediaFile, fly?: AddFly) => void;
  /** Set on the onboarding demo: adding from YouTube says so instead of writing anywhere. */
  onDemoAction?: () => void;
  ref?: Ref<SuggestedHandle>;
};

type Reverse = { fly: AddFly; to?: FlyState["to"] };
const COVER_W = CARD_W - 16;

/** Music's Recommended panel for a video playlist: library picks and YouTube's related videos. */
export function SuggestedPanel({ items, targetId, onAdd, onDemoAction, ref }: Props) {
  const [round, setRound] = useState(0);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [rev, setRev] = useState<Reverse | null>(null);
  const [pinned, setPinned] = useState<{ file: MediaFile; index: number; round: number } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const { shelf, loading, canRefresh } = useVideoSuggestions(items, round);
  const search = useYoutubeSearch(searching ? query : "");

  useImperativeHandle(
    ref,
    () => ({
      reverse(fly) {
        setPinned(null);
        setRev({ fly });
      },
    }),
    [],
  );

  // Read live by the flying cover: the page can scroll or shrink under it while the gap opens.
  const gapTarget = (): FlyState["to"] | null => {
    const gap = sectionRef.current?.querySelector("[data-shelf-gap]");
    const box = sectionRef.current?.getBoundingClientRect();
    if (!gap || !box) return null;
    const g = gap.getBoundingClientRect();
    const left = Math.min(Math.max(g.left + 8, box.left + 16), box.right - COVER_W - 16);
    return { left, top: g.top + 8, width: COVER_W, height: (COVER_W * 9) / 16 };
  };
  useLayoutEffect(() => {
    if (!rev || rev.to) return;
    const to = gapTarget();
    if (to) setRev({ ...rev, to });
  }, [rev, items.length]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => noteSuggestedShelfVisible(entry?.isIntersecting === true),
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      noteSuggestedShelfVisible(false);
    };
  }, []);

  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };
  const addOutside = (video: FeedVideo) =>
    onDemoAction ? onDemoAction() : void addVideoToPlaylist(targetId, video.videoId, video.url, {
      title: video.title,
      thumbnail: video.thumbnail ?? "",
      duration: video.duration ?? 0,
    }, (path) => items.some((f) => mediaPathsMatch(f.path, path)));

  const showResults = searching && search.active;
  const away = rev?.fly.file.path ?? (pinned && pinned.round === round ? pinned.file.path : null);
  const base: VideoSuggestion[] = showResults
    ? (search.results ?? []).map((video) => ({ kind: "outside", key: `o:${video.videoId}`, video }))
    : shelf.filter((s) => !(s.kind === "local" && s.file.path === away));
  const held = !showResults && away && !items.some((f) => f.path === away);
  const at = Math.min(rev?.fly.index ?? pinned?.index ?? 0, base.length);
  const waiting = showResults ? search.results == null : loading && shelf.length === 0;

  const node = (s: VideoSuggestion, i: number) => (
    <ShelfSlot key={s.key} id={s.kind === "local" ? s.file.path : s.video.videoId} index={i}>
      {s.kind === "local" ? (
        <LocalSuggestionCard file={s.file} index={i} onAdd={onAdd} />
      ) : (
        <OutsideSuggestionCard video={s.video} onAdd={addOutside} />
      )}
    </ShelfSlot>
  );
  const nodes = base.map(node);
  // The slot keeps one key from gap to landed card, so the swap is invisible.
  if (held && rev) {
    nodes.splice(at, 0, (
      <ShelfSlot key={`l:${rev.fly.file.path}`} id={rev.fly.file.path} instant>
        <div data-shelf-gap style={{ width: CARD_W }} aria-hidden />
      </ShelfSlot>
    ));
  } else if (held && pinned) {
    nodes.splice(at, 0, (
      <ShelfSlot key={`l:${pinned.file.path}`} id={pinned.file.path} instant>
        <LocalSuggestionCard file={pinned.file} index={at} onAdd={onAdd} />
      </ShelfSlot>
    ));
  }

  return (
    <section ref={sectionRef} aria-label="Suggested videos" data-onboarding-target="playlist-suggested" className="@container mt-auto pt-10">
      <div className="rf-music-shelf-shade rounded-[1.75rem] px-2 pb-1 pt-7">
        <SectionTitle
          title="Suggested"
          subtitle="Based on what's in this playlist"
          trailing={
            <FindMoreField open={searching} query={query} loading={search.loading} onOpen={() => setSearching(true)} onClose={closeSearch} onQuery={setQuery} />
          }
          action={
            canRefresh ? (
              <button
                type="button"
                onClick={() => {
                  setPinned(null);
                  setRound((r) => r + 1);
                }}
                tabIndex={searching ? -1 : 0}
                className={cn(
                  "rf-music-press-soft flex shrink-0 items-center gap-1 font-semibold text-white/60 transition-colors hover:text-white before:mr-1 before:content-['·'] before:text-white/40",
                  searching && "invisible",
                )}
                aria-label="Refresh suggestions"
              >
                {/* RefreshCw is symmetric at 180 degrees, so a half turn reads as a full refresh. */}
                <motion.span className="flex" initial={false} animate={{ rotate: round * 180 }} transition={{ duration: 0.3, ease: "easeOut" }}>
                  <RefreshCw size={13} aria-hidden />
                </motion.span>
                Refresh
              </button>
            ) : null
          }
        />
        <motion.div
          key={round}
          initial={round ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="mt-4"
        >
          <EdgeSquishScroll arrows wrapItems={false} contentClassName="relative gap-0 px-1 pb-2">
            <AnimatePresence initial={false} mode="popLayout">
              {nodes}
              {waiting &&
                [0, 1, 2].map((i) => (
                  <ShelfSlot key={`sk-${i}`} id={`sk-${i}`} index={i}>
                    <SuggestionSkeleton />
                  </ShelfSlot>
                ))}
            </AnimatePresence>
          </EdgeSquishScroll>
          {showResults && search.results?.length === 0 ? (
            <p className="px-4 pb-3 text-sm text-white/50">Nothing found on YouTube.</p>
          ) : null}
        </motion.div>
      </div>
      {rev?.to ? (
        <CoverFly
          fly={{ src: rev.fly.src, from: rev.fly.from, to: rev.to, track: gapTarget }}
          onDone={() => {
            setPinned({ file: rev.fly.file, index: at, round });
            setRev(null);
          }}
        />
      ) : null}
    </section>
  );
}
