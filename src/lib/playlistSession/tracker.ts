import type { MediaFile } from "../../types";
import { isAudioOnlyPath } from "../../mediaKind";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { noteVideoStarted } from "../videoQueue";
import { videoItemKey } from "./itemKey";
import { applyEnded, applyWatch, pickWatchTarget } from "./logic";
import { getActivePlaylistId, keyedItems, setActivePlaylistId } from "./playback";
import { canonicalPlaylistId, getSession, getSessions, hydratePlaylistSessions, writeSession } from "./state";

let tracking = false;

/** Ids of every playlist holding this video, keyed so a moved or re-downloaded copy still counts. */
function playlistsContaining(key: string): string[] {
  const ids: string[] = [];
  for (const e of useRuforgeStore.getState().entries) {
    if (e.kind === "playlist" && keyedItems(e).byKey.has(key)) ids.push(canonicalPlaylistId(e.path));
  }
  return ids;
}

function targetFor(key: string, fromPlaylist: boolean): string | null {
  const active = fromPlaylist ? getActivePlaylistId() : null;
  const target = pickWatchTarget(getSessions(), playlistsContaining(key), active);
  // A play that left its playlist (or never came from one) must not keep steering later plays.
  setActivePlaylistId(active != null && target === active ? active : null);
  return target;
}

/** A video started: it becomes the resume point of the playlist it belongs to. */
export function onVideoStarted(file: MediaFile, previous: MediaFile | null, fromPlaylist: boolean): void {
  if (isAudioOnlyPath(file.path)) return;
  noteVideoStarted(file, previous && !isAudioOnlyPath(previous.path) ? previous : null);
  const key = videoItemKey(file);
  const target = targetFor(key, fromPlaylist);
  if (target) writeSession(target, applyWatch(getSession(target), key, Date.now()));
}

/** A video really ended: the playlist it belongs to moves on to the next item. */
export function onVideoEnded(file: MediaFile): void {
  if (isAudioOnlyPath(file.path)) return;
  const key = videoItemKey(file);
  const target = pickWatchTarget(getSessions(), playlistsContaining(key), getActivePlaylistId());
  if (!target) return;
  const entry = useRuforgeStore.getState().entries.find(
    (e) => e.kind === "playlist" && canonicalPlaylistId(e.path) === target,
  );
  if (!entry || entry.kind !== "playlist") return;
  writeSession(target, applyEnded(getSession(target), keyedItems(entry).keys, key, Date.now()));
}

/** Idempotent. Loads saved progress and follows the player for the rest of the session. */
export function startPlaylistSessionTracking(): void {
  if (tracking) return;
  tracking = true;
  void hydratePlaylistSessions();
  useRuforgeStore.subscribe((state, prev) => {
    const file = state.playingFile;
    if (!file || file.path === prev.playingFile?.path) return;
    onVideoStarted(file, prev.playingFile, state.musicQueueSource?.kind === "playlist");
  });
}
