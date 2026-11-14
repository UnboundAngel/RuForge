import { useEffect, useRef, useState } from "react";

import type { PlaylistCollection } from "../types";
import { playlistDisplayTitle } from "@/lib/playlistDisplayTitle";
import { isVirtualPlaylistPath, parseVirtualPlaylistId, WATCH_LATER_ID } from "@/virtualPlaylists";
import { isDemoPlaylistPath } from "@/lib/demoPlaylistPath";
import { playlistCardKey } from "@/lib/playlistCardKey";
import { playlistHasNew, usePlaylistSeen } from "@/lib/playlistSeen";
import { formatHoursMinutes } from "./playlist-detail/playlistRows";
import { CreatorsMark, PlaylistCard } from "./library/PlaylistCard";
import { distinctChannels } from "./playlist-detail/PlaylistAvatarStack";
import { MetaParts } from "./library/VideoByline";
import { isVideoWatched } from "@/playbackStorage";

const hasUrlPayload = (dt: DataTransfer | null) =>
  !!dt && (dt.types.includes("text/uri-list") || dt.types.includes("text/plain")) && !dt.types.includes("Files");

export const PlaylistStackCard = ({
  playlist,
  onClick,
  onContextMenu,
  onUrlDrop,
  targetId,
}: {
  playlist: PlaylistCollection;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  /** Set on video playlists: dropped links are handled here instead of reaching the downloader. */
  onUrlDrop?: (dataTransfer: DataTransfer) => void;
  /** `data-onboarding-target` for the tour's spotlight. */
  targetId?: string;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dropArmed, setDropArmed] = useState(false);
  const onUrlDropRef = useRef(onUrlDrop);
  onUrlDropRef.current = onUrlDrop;
  const accepts = onUrlDrop != null;
  const demo = isDemoPlaylistPath(playlist.path);

  // Native listeners: the page-level drop intake is native too and would take the drop first.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !accepts) return;
    const over = (e: DragEvent) => {
      if (!hasUrlPayload(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropArmed(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
      setDropArmed(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasUrlPayload(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropArmed(false);
      if (e.dataTransfer) onUrlDropRef.current?.(e.dataTransfer);
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragenter", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragenter", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, [accepts]);

  const seen = usePlaylistSeen((s) => s.seen);
  const seenLoaded = usePlaylistSeen((s) => s.loaded);

  const mainThumbnail =
    playlist.stackThumbnailPath ||
    playlist.items[0]?.thumbnailPath ||
    playlist.items[0]?.ruforgePosterPath;
  const countLabel =
    playlist.itemCount === 0
      ? "No videos"
      : `${playlist.itemCount} video${playlist.itemCount === 1 ? "" : "s"}`;

  const isWatchLater = isVirtualPlaylistPath(playlist.path) && parseVirtualPlaylistId(playlist.path) === WATCH_LATER_ID;
  const showNew = seenLoaded && !isWatchLater && playlistHasNew(playlist, seen);

  const watched = playlist.items.filter((f) => isVideoWatched(f.path, f.duration)).length;
  const meta = (
    <MetaParts
      parts={[
        playlist.combinedDuration > 0 ? formatHoursMinutes(playlist.combinedDuration) : null,
        watched === 0 ? null : `${watched} of ${playlist.itemCount} watched`,
        distinctChannels(playlist.items).map((c) => c.channel).join(", ") || null,
      ]}
    />
  );

  return (
    <PlaylistCard
      rootRef={rootRef}
      dataKey={playlistCardKey(playlist.title)}
      cover={mainThumbnail}
      count={countLabel}
      mark={<CreatorsMark items={playlist.items} />}
      title={<span className="truncate">{isWatchLater ? "Watch later" : playlistDisplayTitle(playlist.title)}</span>}
      meta={meta}
      isNew={showNew && !demo}
      demo={demo}
      targetId={targetId}
      dropArmed={dropArmed}
      onClick={onClick}
      onContextMenu={onContextMenu}
    />
  );
};
