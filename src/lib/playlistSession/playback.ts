import type { MediaFile, PlaylistCollection } from "../../types";
import { musicQueueSource } from "../../components/music/musicQueueSource";
import { isAudioOnlyPath } from "../../mediaKind";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { virtualPlaylistPath } from "../../virtualPlaylists";
import { videoItemKey } from "./itemKey";
import {
  applyPlan,
  planPlayFrom,
  planResume,
  planShuffle,
  planStartOver,
  setStartKey,
  type PlaybackPlan,
} from "./logic";
import { canonicalPlaylistId, getSession, writeSession } from "./state";

/** Playlist the player is currently running out of; null for library or search plays. */
let activePlaylistId: string | null = null;

export function getActivePlaylistId(): string | null {
  return activePlaylistId;
}

export function setActivePlaylistId(id: string | null): void {
  activePlaylistId = id;
}

/** Folder playlists are keyed by path, virtual ones by record id; callers may pass either form. */
export function findPlaylistEntry(playlistId: string): PlaylistCollection | null {
  const id = canonicalPlaylistId(playlistId);
  const virtual = virtualPlaylistPath(id);
  for (const e of useRuforgeStore.getState().entries) {
    if (e.kind === "playlist" && (e.path === id || e.path === virtual)) return e;
  }
  return null;
}

export function videoItems(entry: PlaylistCollection): MediaFile[] {
  return entry.items.filter((f) => !isAudioOnlyPath(f.path));
}

/** Unique item keys in playlist order, with the file each key stands for. */
export function keyedItems(entry: PlaylistCollection): { keys: string[]; byKey: Map<string, MediaFile> } {
  const byKey = new Map<string, MediaFile>();
  for (const f of videoItems(entry)) {
    const k = videoItemKey(f);
    if (!byKey.has(k)) byKey.set(k, f);
  }
  return { keys: [...byKey.keys()], byKey };
}

type Planner = (keys: string[]) => PlaybackPlan | null;

/** Single launch path so card and detail share one queue source and one session. */
function launch(playlistId: string, plan: Planner, fromStart = false): void {
  const id = canonicalPlaylistId(playlistId);
  const entry = findPlaylistEntry(id);
  if (!entry) return;
  const { keys, byKey } = keyedItems(entry);
  const made = plan(keys);
  const file = made ? byKey.get(made.currentKey) : undefined;
  if (!made || !file) return;
  const queue = made.order.map((k) => byKey.get(k)).filter((f): f is MediaFile => f != null);
  writeSession(id, applyPlan(getSession(id), made, Date.now()));
  activePlaylistId = id;
  const store = useRuforgeStore.getState();
  void store.handlePlayFile(file, queue, musicQueueSource("playlist", entry.title)).then(() => {
    if (fromStart) useRuforgeStore.getState().clearPlayerResumeAt();
  });
}

export function resume(playlistId: string): void {
  launch(playlistId, (keys) => planResume(getSession(playlistId), keys));
}

export function startOver(playlistId: string): void {
  launch(playlistId, (keys) => planStartOver(getSession(playlistId), keys), true);
}

export function shuffle(playlistId: string): void {
  launch(playlistId, (keys) => planShuffle(keys));
}

export function playFrom(playlistId: string, itemKey: string): void {
  launch(playlistId, (keys) => planPlayFrom(getSession(playlistId), keys, itemKey));
}

export function setStartVideo(playlistId: string, itemKey: string | null): void {
  writeSession(playlistId, setStartKey(getSession(playlistId), itemKey));
}
