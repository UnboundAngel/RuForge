import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { motion, useReducedMotion } from "framer-motion";
import { MoreHorizontal, PanelRightClose } from "lucide-react";
import { Icon } from "@iconify/react";

import type { MediaFile } from "@/types";
import { bestCoverPath, isAudioOnlyPath } from "@/mediaKind";
import { albumCoverPathWithFallback } from "@/albumCoverPath";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import {
  ensureArtistMetaSidecar,
  readArtistMetaSidecar,
  readMusicMeta,
  type ArtistInfo,
} from "@/lib/musicMeta";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { cn } from "@/lib/utils";
import {
  artistKeyFromFile,
  fileMatchesArtistKey,
  primaryArtist,
  rawArtistFromFile,
} from "./musicArtist";
import { MusicLikeButton } from "./MusicLikeButton";
import { MusicLyricsView } from "./MusicLyricsView";
import {
  buildNowPlayingCredits,
  parseYoutubeCreditGroups,
  type CreditPerson,
} from "./musicYoutubeCredits";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { HoverMarqueeText } from "./HoverMarqueeText";
import { MusicEdgeSquishScroll } from "./MusicEdgeSquishScroll";
import { buildCombinedQueuePaths } from "./musicQueueReorder";

const HEADER_EASE = [0.4, 0, 0.2, 1] as const;
const CREDITS_PREVIEW = 3;
const RELATED_LIMIT = 8;
/** Spotify-like About hero: wider than tall so square art crops top/bottom, never letterboxes. */
const ABOUT_ARTIST_ASPECT = "16 / 9";

type Props = {
  playingFile: MediaFile;
  coverSrc: string | null;
  title: string;
  artist: string;
  audioEl: HTMLAudioElement | null;
  effectivePlaylist: MediaFile[];
  playlistIndex: number;
  manualQueue: string[];
  onClose: () => void;
  onSeek: (t: number) => void;
  onPlay: (file: MediaFile) => void;
  onOpenQueue: () => void;
  onOpenArtist?: (artistKey: string) => void;
  /** Immersive expanded player: match pitch-black rail fill. */
  shellFrame?: boolean;
  onToggleExpand?: () => void;
};

function NpCard({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const style = {
    background: "var(--music-surface-raised)",
  } as const;
  const cls = cn(
    "w-full shrink-0 rounded-xl text-left overflow-hidden",
    onClick && "cursor-pointer transition-[filter] duration-150 hover:brightness-110",
    className,
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} style={style}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

export function MusicNowPlayingPanel({
  playingFile,
  coverSrc,
  title,
  artist,
  audioEl,
  effectivePlaylist,
  playlistIndex,
  manualQueue,
  onClose,
  onSeek,
  onPlay,
  onOpenQueue,
  onOpenArtist,
  shellFrame = false,
  onToggleExpand,
}: Props) {
  const reduceMotion = useReducedMotion() ?? false;
  const [hovered, setHovered] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [titleHovered, setTitleHovered] = useState(false);
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);
  const [creditPeople, setCreditPeople] = useState<CreditPerson[]>([]);
  const [artistInfo, setArtistInfo] = useState<ArtistInfo | null>(null);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);
  const entries = useRuforgeStore((s) => s.entries);

  const artistKey = artistKeyFromFile(playingFile);
  const openArtist = () => {
    if (!artistKey) return;
    (onOpenArtist ?? openMusicArtist)(artistKey);
  };

  const pathToFile = useMemo(() => {
    const out = new Map<string, MediaFile>();
    for (const e of entries) {
      if (e.kind === "playlist") {
        for (const f of e.items) out.set(f.path, f);
      } else {
        out.set(e.path, e);
      }
    }
    return out;
  }, [entries]);

  const libraryTracks = useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );

  const relatedSongs = useMemo(() => {
    if (!artistKey) return [] as MediaFile[];
    return libraryTracks
      .filter((t) => t.path !== playingFile.path && fileMatchesArtistKey(t, artistKey))
      .slice(0, RELATED_LIMIT);
  }, [libraryTracks, artistKey, playingFile.path]);

  const artistCoverSrc = useMemo(() => {
    if (!artistKey) {
      const self = albumCoverPathWithFallback(playingFile);
      const path = self.primary ?? self.fallback ?? bestCoverPath(playingFile);
      return path ? convertFileSrc(path) : null;
    }
    const artistTracks = libraryTracks.filter((t) => fileMatchesArtistKey(t, artistKey));
    const pool = artistTracks.length > 0 ? artistTracks : [playingFile];
    for (const track of pool) {
      const paths = albumCoverPathWithFallback(track);
      const path = paths.primary ?? paths.fallback ?? bestCoverPath(track);
      if (path) return convertFileSrc(path);
    }
    return null;
  }, [libraryTracks, artistKey, playingFile]);

  const artistDisplayName = useMemo(() => {
    if (artistInfo?.name) return artistInfo.name;
    if (artist) return artist;
    const raw = rawArtistFromFile(playingFile);
    return raw ? primaryArtist(raw) : "Artist";
  }, [artistInfo, artist, playingFile]);

  const artistBlurb = useMemo(() => {
    const bits: string[] = [];
    if (artistInfo?.disambiguation) bits.push(artistInfo.disambiguation);
    if (artistInfo?.genres?.length) bits.push(artistInfo.genres.slice(0, 3).join(" · "));
    if (artistInfo?.originCity) {
      bits.push(
        artistInfo.country
          ? `${artistInfo.originCity}, ${artistInfo.country}`
          : artistInfo.originCity,
      );
    }
    const count = libraryTracks.filter((t) => artistKey && fileMatchesArtistKey(t, artistKey)).length;
    if (count > 0) bits.push(`${count} ${count === 1 ? "song" : "songs"} in library`);
    return bits.join(" · ");
  }, [artistInfo, libraryTracks, artistKey]);

  const nextFile = useMemo(() => {
    const nextUpPaths = effectivePlaylist
      .slice(playlistIndex + 1, playlistIndex + 2)
      .map((f) => f.path);
    const combined = buildCombinedQueuePaths(manualQueue, nextUpPaths);
    const first = combined[0];
    if (!first) return null;
    return pathToFile.get(first) ?? effectivePlaylist.find((f) => f.path === first) ?? null;
  }, [effectivePlaylist, playlistIndex, manualQueue, pathToFile]);

  useEffect(() => {
    let cancelled = false;
    void readMusicMeta(playingFile.path).then((meta) => {
      if (cancelled) return;
      const groups = parseYoutubeCreditGroups(meta?.youtube?.description);
      setCreditPeople(buildNowPlayingCredits(groups, artist || null));
    });
    return () => {
      cancelled = true;
    };
  }, [playingFile.path, artist]);

  useEffect(() => {
    if (!artist) {
      setArtistInfo(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      let info = await readArtistMetaSidecar(artist).catch(() => null);
      if (!info) {
        await ensureArtistMetaSidecar(artist, false).catch(() => false);
        info = await readArtistMetaSidecar(artist).catch(() => null);
      }
      if (!cancelled) setArtistInfo(info);
    })();
    return () => {
      cancelled = true;
    };
  }, [artist]);

  useEffect(() => {
    setScrolled(false);
  }, [playingFile.path]);

  const showChrome = hovered;
  const previewCredits = creditPeople.slice(0, CREDITS_PREVIEW);
  const hasMoreCredits = creditPeople.length > CREDITS_PREVIEW;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        className="relative z-[2] shrink-0 flex items-center gap-1 px-2 h-10 transition-[box-shadow] duration-150"
        style={{
          background: shellFrame ? "var(--music-bg)" : "var(--music-surface)",
          boxShadow: scrolled ? "0 8px 16px rgb(0 0 0 / 0.55)" : "none",
        }}
      >
        <motion.div
          className="flex shrink-0 items-center overflow-hidden"
          initial={false}
          animate={{
            width: showChrome ? 28 : 0,
            opacity: showChrome ? 1 : 0,
            marginRight: showChrome ? 4 : 0,
          }}
          transition={{
            duration: reduceMotion ? 0 : 0.2,
            ease: HEADER_EASE,
          }}
          style={{ pointerEvents: showChrome ? "auto" : "none" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rf-music-tooltip-anchor w-7 h-7 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Minimize panel"
            data-tooltip="Minimize panel"
          >
            <PanelRightClose size={15} />
          </button>
        </motion.div>

        <p
          className="min-w-0 flex-1 truncate text-[13px] font-semibold"
          style={{ color: "var(--music-text-primary)" }}
        >
          {title}
        </p>

        <motion.div
          className="flex shrink-0 items-center gap-0.5"
          initial={false}
          animate={{
            opacity: showChrome ? 1 : 0,
            x: showChrome ? 0 : 8,
          }}
          transition={{
            duration: reduceMotion ? 0 : 0.2,
            ease: HEADER_EASE,
          }}
          style={{ pointerEvents: showChrome ? "auto" : "none" }}
        >
          <button
            type="button"
            className="rf-music-tooltip-anchor w-7 h-7 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="More"
            data-tooltip="More"
            onClick={(e) => {
              setMenu({
                context: { kind: "song", file: playingFile },
                x: e.clientX,
                y: e.clientY,
                onPlay: () => onPlay(playingFile),
              });
            }}
          >
            <MoreHorizontal size={16} />
          </button>
          {onToggleExpand ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="rf-music-tooltip-anchor w-7 h-7 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: "var(--music-text-secondary)" }}
              aria-label={shellFrame ? "Collapse player" : "Expand player"}
              data-tooltip={shellFrame ? "Collapse player" : "Expand player"}
            >
              <Icon
                icon={shellFrame ? "tabler:arrows-minimize" : "tabler:arrows-maximize"}
                width={16}
                height={16}
                aria-hidden
              />
            </button>
          ) : null}
        </motion.div>
      </div>

      <div
        className="rf-scrollbar rf-scrollbar-hover flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-6"
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}
      >
        <div className="flex flex-col gap-3">
        <div
          className="relative w-full shrink-0 overflow-hidden rounded-xl"
          style={{ aspectRatio: "1 / 1" }}
        >
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
            >
              <Icon icon="solar:music-note-bold" width={48} height={48} aria-hidden />
            </div>
          )}
        </div>

        <div
          className="flex shrink-0 items-start gap-2 px-0.5"
          onMouseEnter={() => setTitleHovered(true)}
          onMouseLeave={() => setTitleHovered(false)}
        >
          <div className="min-w-0 flex-1">
            <HoverMarqueeText
              text={title}
              active={titleHovered}
              className="text-[1.15rem] font-bold leading-tight tracking-tight text-[var(--music-text-primary)]"
              layoutKey={`${playingFile.path}:np-title`}
            />
            {artist ? (
              <button
                type="button"
                onClick={openArtist}
                disabled={!artistKey}
                className={cn(
                  "mt-1 block max-w-full truncate text-left text-[13px] border-0 bg-transparent p-0",
                  artistKey ? "hover:underline cursor-pointer" : "cursor-default",
                )}
                style={{ color: "var(--music-text-secondary)" }}
              >
                {artist}
              </button>
            ) : null}
          </div>
          <MusicLikeButton file={playingFile} size={18} />
        </div>

        <NpCard className="shrink-0 px-3 py-3">
          <MusicLyricsView
            variant="rail"
            mediaPath={playingFile.path}
            audioEl={audioEl}
            title={title}
            artist={artist || primaryArtist(playingFile.artist ?? playingFile.albumArtist ?? "")}
            onSeek={onSeek}
          />
        </NpCard>

        {relatedSongs.length > 0 ? (
          <div className="shrink-0">
            <p
              className="mb-2.5 px-0.5 text-[13px] font-bold"
              style={{ color: "var(--music-text-primary)" }}
            >
              Related songs
            </p>
            <MusicEdgeSquishScroll>
              {relatedSongs.map((file) => (
                <RelatedSongTile key={file.path} file={file} onPlay={onPlay} />
              ))}
            </MusicEdgeSquishScroll>
          </div>
        ) : null}

        {artistKey ? (
          <NpCard className="shrink-0" onClick={openArtist}>
            <div
              className="relative w-full overflow-hidden"
              style={{ aspectRatio: ABOUT_ARTIST_ASPECT }}
            >
              {artistCoverSrc ? (
                <img
                  src={artistCoverSrc}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 block"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center center",
                    // Zoom past letterboxed thumbs so side bars never show.
                    transform: "scale(1.22)",
                    transformOrigin: "center center",
                  }}
                />
              ) : null}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 40%, transparent 70%, rgba(0,0,0,0.35) 100%)",
                }}
              />
              <p
                className="absolute left-3 top-2.5 text-[13px] font-bold"
                style={{ color: "var(--music-text-primary)" }}
              >
                About the artist
              </p>
            </div>
            <div className="px-3 py-3">
              <p
                className="truncate text-[15px] font-bold"
                style={{ color: "var(--music-text-primary)" }}
              >
                {artistDisplayName}
              </p>
              {artistBlurb ? (
                <p
                  className="mt-1 line-clamp-2 text-[12px] leading-relaxed"
                  style={{ color: "var(--music-text-muted)" }}
                >
                  {artistBlurb}
                </p>
              ) : null}
            </div>
          </NpCard>
        ) : null}

        {previewCredits.length > 0 ? (
          <NpCard className="shrink-0 px-3 py-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <p className="text-[13px] font-bold" style={{ color: "var(--music-text-primary)" }}>
                Credits
              </p>
              {artistKey ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openArtist();
                  }}
                  className="text-[11px] font-medium border-0 bg-transparent p-0 hover:underline"
                  style={{ color: "var(--music-text-muted)" }}
                >
                  Show all
                </button>
              ) : null}
            </div>
            <div className="flex flex-col gap-3">
              {previewCredits.map((person) => (
                <div key={person.name} className="min-w-0">
                  <p
                    className="truncate text-[13px] font-semibold"
                    style={{ color: "var(--music-text-primary)" }}
                  >
                    {person.name}
                  </p>
                  <p
                    className="truncate text-[11px]"
                    style={{ color: "var(--music-text-muted)" }}
                  >
                    {person.roles.join(" · ")}
                  </p>
                </div>
              ))}
            </div>
            {hasMoreCredits && artistKey ? (
              <p className="mt-2 text-[11px]" style={{ color: "var(--music-text-muted)" }}>
                And more on the artist page
              </p>
            ) : null}
          </NpCard>
        ) : null}

        {nextFile ? (
          <NpCard className="shrink-0 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[13px] font-bold" style={{ color: "var(--music-text-primary)" }}>
                Next in queue
              </p>
              <button
                type="button"
                onClick={onOpenQueue}
                className="text-[11px] font-medium border-0 bg-transparent p-0 hover:underline"
                style={{ color: "var(--music-text-muted)" }}
              >
                Open queue
              </button>
            </div>
            <button
              type="button"
              onClick={() => onPlay(nextFile)}
              className="flex w-full items-center gap-3 rounded-lg px-0.5 py-0.5 text-left border-0 bg-transparent transition-[background-color] duration-150 hover:bg-white/[0.06]"
            >
              <NextCover file={nextFile} />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[13px] font-semibold"
                  style={{ color: "var(--music-text-primary)" }}
                >
                  {nextFile.name}
                </p>
                <p
                  className="truncate text-[11px]"
                  style={{ color: "var(--music-text-muted)" }}
                >
                  {nextFile.artist ?? nextFile.albumArtist ?? "Unknown artist"}
                </p>
              </div>
            </button>
          </NpCard>
        ) : null}
        </div>
      </div>

      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

function RelatedSongTile({
  file,
  onPlay,
}: {
  file: MediaFile;
  onPlay: (file: MediaFile) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const coverCandidates = useMemo(() => {
    const paths = albumCoverPathWithFallback(file);
    const list: string[] = [];
    for (const p of [paths.primary, paths.fallback, bestCoverPath(file)]) {
      if (!p) continue;
      const src = convertFileSrc(p);
      if (!list.includes(src)) list.push(src);
    }
    return list;
  }, [file]);
  const [coverIdx, setCoverIdx] = useState(0);
  const coverSrc = coverCandidates[coverIdx] ?? null;
  const artistLabel = file.artist ?? file.albumArtist ?? "Unknown artist";

  useEffect(() => {
    setCoverIdx(0);
  }, [file.path]);

  return (
    <button
      type="button"
      onClick={() => onPlay(file)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group/rel flex w-[11.5rem] shrink-0 flex-col gap-1.5 text-left rounded-xl p-1.5 transition-[background-color] duration-150 border-0",
        hovered ? "bg-[color:var(--music-surface-raised)]" : "bg-transparent",
      )}
    >
      <div className="flex h-[6.5rem] w-full items-center justify-center overflow-visible">
        <div
          data-profile-scroll-cover
          className="relative h-full w-full overflow-hidden rounded-lg transition-transform duration-150 ease-out will-change-transform"
        >
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              draggable={false}
              className="absolute inset-0 block h-full w-full"
              style={{ objectFit: "cover", objectPosition: "center center" }}
              onError={() => setCoverIdx((i) => i + 1)}
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
            >
              <Icon icon="solar:music-note-bold" width={28} height={28} aria-hidden />
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 px-0.5">
        <HoverMarqueeText
          text={file.name}
          active={hovered}
          className="text-[12px] font-semibold text-[var(--music-text-primary)]"
          layoutKey={`${file.path}:title`}
        />
        <div className="mt-0.5 min-w-0">
          <HoverMarqueeText
            text={artistLabel}
            active={hovered}
            className="text-[11px] text-[var(--music-text-muted)]"
            layoutKey={`${file.path}:artist`}
          />
        </div>
      </div>
    </button>
  );
}

function NextCover({ file }: { file: MediaFile }) {
  const path = bestCoverPath(file);
  const src = path ? convertFileSrc(path) : null;
  return (
    <div
      className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg"
      style={{ background: "var(--music-surface)" }}
    >
      {src ? (
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : null}
    </div>
  );
}
