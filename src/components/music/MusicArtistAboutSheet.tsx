import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import type { MediaFile } from "@/types";
import { getArtistAbout, type ArtistAbout } from "@/lib/musicMeta";
import { OVERLAY_Z_CLASS } from "@/lib/overlayZIndex";
import { motionDuration, overlayFadeTransition, overlayPanelTransition } from "@/lib/overlayMotion";
import { getArtistListenSummary } from "./musicListenStats";
import { trackTitle } from "./musicPlaylistSort";
import { useMusicMenuEscape } from "./musicMenuUi";
import { MusicArtistAboutHero } from "./MusicArtistAboutHero";
import { MusicArtistAboutBio, MusicArtistAboutStats } from "./MusicArtistAboutColumns";
import type { AboutTopTrack } from "./MusicArtistAboutTopTracks";
import { displaySongTitle } from "./musicTitleDisplay";

const TOP_TRACKS = 5;
const MAX_COVERS = 5;

type Props = {
  open: boolean;
  onClose: () => void;
  artistName: string;
  artistKey: string;
  displayName: string;
  fallbackBlurb: string;
  /** One entry per cover, each a fallback chain tried in order. */
  coverImages: string[][];
  artistTracks: MediaFile[];
  onViewSongs?: () => void;
  onPlayTrack?: (file: MediaFile) => void;
};

export function MusicArtistAboutSheet(props: Props) {
  const reduceMotion = useReducedMotion();
  useMusicMenuEscape(props.open, props.onClose);

  return createPortal(
    <AnimatePresence>
      {props.open && (
        <motion.div
          key="artist-about"
          data-music-mode="true"
          className={`fixed inset-0 ${OVERLAY_Z_CLASS.confirm} flex items-center justify-center bg-black/80 p-6`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionDuration(reduceMotion, overlayFadeTransition)}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) props.onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`About ${props.displayName}`}
            className="relative flex max-h-[min(88vh,780px)] w-full max-w-[780px] flex-col overflow-hidden rounded-2xl bg-[#181818] shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={motionDuration(reduceMotion, overlayPanelTransition)}
          >
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Close"
              className="rf-music-press absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
            >
              <X size={18} aria-hidden />
            </button>
            <AboutContent {...props} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function AboutContent({
  artistName,
  artistKey,
  displayName,
  fallbackBlurb,
  coverImages,
  artistTracks,
  onViewSongs,
  onPlayTrack,
}: Props) {
  const [about, setAbout] = useState<ArtistAbout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getArtistAbout(artistName)
      .catch(() => null)
      .then((res) => {
        if (cancelled) return;
        setAbout(res);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artistName]);

  const summary = useMemo(() => getArtistListenSummary(artistKey, TOP_TRACKS), [artistKey]);

  const topTracks = useMemo<AboutTopTrack[]>(() => {
    const byPath = new Map(artistTracks.map((t) => [t.path, t]));
    return summary.topTracks.map((s) => {
      const file = byPath.get(s.path) ?? null;
      const title = displaySongTitle(file ? trackTitle(file) : s.title, displayName);
      return { key: s.identityKey, title, playCount: s.playCount, file };
    });
  }, [summary, artistTracks, displayName]);

  const images = useMemo(() => {
    const list = about?.imageUrl ? [[about.imageUrl]] : [];
    return [...list, ...coverImages.slice(0, MAX_COVERS)];
  }, [about?.imageUrl, coverImages]);

  const { ref, edges, onScroll } = useScrollEdges();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain rf-scrollbar rf-scrollbar-hover"
      >
        <MusicArtistAboutHero key={about?.imageUrl ?? "covers"} images={images} />
        <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-12 px-10 pb-12 pt-10">
          <MusicArtistAboutStats
            playCount={summary.playCount}
            listenTimeSec={summary.listenTimeSec}
            songCount={artistTracks.length}
            topTracks={topTracks}
            about={about}
            onPlayTrack={onPlayTrack}
          />
          <MusicArtistAboutBio
            name={about?.name ?? displayName}
            about={about}
            loading={loading}
            fallbackBlurb={fallbackBlurb}
            onViewSongs={onViewSongs}
          />
        </div>
      </div>
      <EdgeShade side="top" visible={edges.top} />
      <EdgeShade side="bottom" visible={edges.bottom} />
    </div>
  );
}

function useScrollEdges() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    // Content grows when the bio and photo arrive, which never fires a scroll event.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [measure]);

  return { ref, edges, onScroll: measure };
}

function EdgeShade({ side, visible }: { side: "top" | "bottom"; visible: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 ${side === "top" ? "top-0" : "bottom-0"} h-14 transition-opacity duration-200`}
      style={{
        opacity: visible ? 1 : 0,
        background: `linear-gradient(${side === "top" ? "180deg" : "0deg"}, #181818 0%, rgb(24 24 24 / 0) 100%)`,
      }}
    />
  );
}
