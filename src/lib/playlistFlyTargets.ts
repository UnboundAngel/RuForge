import { create } from "zustand";

import type { DownloadJob } from "../downloadQueue";
import { isAudioOnlyPath } from "../mediaKind";
import { extractYouTubeVideoId } from "../youtubeUrl";
import { playlistCardKey } from "./playlistCardKey";

/**
 * Finished playlist videos wait here until the user opens Playlists, then fly from the sidebar
 * download button into the playlist's card. The card is found through its `data-playlist-card`
 * and `data-squish-cover` attributes, so the library owns no landing code.
 */

/** Seen or forgotten after this long; flying them in later would be noise. */
const ARRIVAL_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_PER_GROUP = 6;

export type PlaylistArrival = {
  jobId: string;
  title: string | null;
  at: number;
  /** Decoded once at finish and cloned into the flyer, so the flight never depends on a src that changes. */
  image: HTMLImageElement | null;
};

export type PlaylistArrivalGroup = {
  /** Card keys that can identify this playlist: its title and its folder name. */
  keys: string[];
  arrivals: PlaylistArrival[];
  /** Videos that finished but did not fit the flight, so the count stays honest. */
  total: number;
};

export const usePlaylistArrivals = create<{ groups: Record<string, PlaylistArrivalGroup> }>(() => ({
  groups: {},
}));

const folderTitles = new Map<string, string>();

function folderId(folder: string): string {
  return folder.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

function folderBase(folder: string): string {
  const parts = folder.replace(/\//g, "\\").replace(/\\+$/, "").split("\\");
  return parts[parts.length - 1] ?? folder;
}

/** Remembers the playlist title a download folder was made for, since a finished job only knows the folder. */
export function rememberPlaylistFolderTitle(folder: string, title: string): void {
  const t = title.trim();
  if (folder.trim() && t) folderTitles.set(folderId(folder), t);
}

/** Jobs of a video playlist run: progress shows on the sidebar button, never as a full screen. */
export function isPlaylistRunJob(job: Pick<DownloadJob, "options" | "enqueueSource">): boolean {
  return (
    Boolean(job.options.playlistOutputFolder?.trim()) && job.enqueueSource !== "musicPlaylistAdd"
  );
}

export function jobThumbnailUrl(job: Pick<DownloadJob, "metadata" | "url">): string | null {
  const fromMeta = job.metadata?.thumbnail?.trim();
  if (fromMeta) return fromMeta;
  const id = extractYouTubeVideoId(job.url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

function preload(src: string | null): HTMLImageElement | null {
  if (!src) return null;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  void img.decode().catch(() => {});
  return img;
}

function prune(groups: Record<string, PlaylistArrivalGroup>): Record<string, PlaylistArrivalGroup> {
  const now = Date.now();
  const out: Record<string, PlaylistArrivalGroup> = {};
  for (const [id, g] of Object.entries(groups)) {
    const arrivals = g.arrivals.filter((a) => now - a.at < ARRIVAL_TTL_MS);
    if (arrivals.length > 0) out[id] = { ...g, arrivals };
  }
  return out;
}

/** Called when a video of a playlist run finished downloading. */
export function announcePlaylistArrival(job: DownloadJob, outputPath: string): void {
  const folder = job.options.playlistOutputFolder?.trim();
  if (!folder || isAudioOnlyPath(outputPath)) return;
  const id = folderId(folder);
  const title = folderTitles.get(id);
  const keys = [...new Set([title ? playlistCardKey(title) : "", playlistCardKey(folderBase(folder))])].filter(
    Boolean,
  );
  const arrival: PlaylistArrival = {
    jobId: job.id,
    title: job.metadata?.title?.trim() || job.title?.trim() || null,
    at: Date.now(),
    image: preload(jobThumbnailUrl(job)),
  };
  const groups = prune(usePlaylistArrivals.getState().groups);
  const prev = groups[id];
  const arrivals = [...(prev?.arrivals ?? []), arrival].slice(-MAX_PER_GROUP);
  groups[id] = { keys, arrivals, total: (prev?.total ?? 0) + 1 };
  usePlaylistArrivals.setState({ groups });
}

/** Takes a waiting group once, so only one landing plays it. */
export function claimPlaylistArrivals(id: string): PlaylistArrivalGroup | null {
  const { groups } = usePlaylistArrivals.getState();
  const group = groups[id];
  if (!group) return null;
  const { [id]: _taken, ...rest } = groups;
  usePlaylistArrivals.setState({ groups: rest });
  return group;
}

/** The cover of the library card for a playlist, when that card is in the document. */
export function findPlaylistCardCover(keys: string[]): HTMLElement | null {
  for (const key of keys) {
    const card = Array.from(document.querySelectorAll<HTMLElement>("[data-playlist-card]")).find(
      (el) => el.dataset.playlistCard === key,
    );
    const cover = card?.querySelector<HTMLElement>("[data-squish-cover]");
    if (cover) return cover;
  }
  return null;
}

/** Waiting thumbnails, newest first, for the sidebar stack. */
export function pendingPlaylistArrivals(
  groups: Record<string, PlaylistArrivalGroup>,
): PlaylistArrival[] {
  return Object.values(groups)
    .flatMap((g) => g.arrivals)
    .sort((a, b) => b.at - a.at);
}
