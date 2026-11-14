import { useMemo, useSyncExternalStore } from "react";
import { markItemsWatched, removeWatched } from "./bulk";
import { isStarted, sessionOf } from "./logic";
import { playFrom, resume, setStartVideo, shuffle, startOver } from "./playback";
import { canonicalPlaylistId, getSession, getSessions, subscribeSessions } from "./state";
import { startPlaylistSessionTracking } from "./tracker";

export { videoItemKey } from "./itemKey";
export { startPlaylistSessionTracking, onVideoEnded as playlistVideoEnded } from "./tracker";

export type PlaylistSessionView = {
  started: boolean;
  currentKey: string | null;
  startKey: string | null;
  shuffled: boolean;
  lastPlayedAt: number | null;
};

/** Season state of one playlist: started once anything played or it was shuffled. Re-renders on change. */
export function usePlaylistSession(playlistId: string): PlaylistSessionView {
  startPlaylistSessionTracking();
  const session = useSyncExternalStore(
    subscribeSessions,
    () => sessionOf(getSessions(), canonicalPlaylistId(playlistId)),
  );
  return useMemo(
    () => ({
      started: isStarted(session),
      currentKey: session.currentKey,
      startKey: session.startKey,
      shuffled: session.shuffled,
      lastPlayedAt: session.lastPlayedAt,
    }),
    [session],
  );
}

/** Continue the current video from its saved position, in the same order (shuffled order included). */
export function playlistResume(playlistId: string): void {
  startPlaylistSessionTracking();
  resume(playlistId);
}

/** Begin at the start video in playlist order and clear any shuffle. */
export function playlistStartOver(playlistId: string): void {
  startPlaylistSessionTracking();
  startOver(playlistId);
}

/** Play a new shuffled order; shuffling counts as starting the playlist. */
export function playlistShuffle(playlistId: string): void {
  startPlaylistSessionTracking();
  shuffle(playlistId);
}

/** Play one item now and keep the playlist's current order (shuffled stays shuffled). */
export function playlistPlayFrom(playlistId: string, itemKey: string): void {
  startPlaylistSessionTracking();
  playFrom(playlistId, itemKey);
}

/** Sets the video Start over begins at (null resets to the first item). Does not touch the order. */
export function setPlaylistStartVideo(playlistId: string, itemKey: string | null): void {
  setStartVideo(playlistId, itemKey);
}

/** When the playlist last played, or null if never. Plain read for sorting; does not subscribe. */
export function playlistLastPlayedAt(playlistId: string): number | null {
  return getSession(playlistId).lastPlayedAt;
}

/** Marks the given items watched or unwatched using the saved playback positions the library reads. */
export function markPlaylistItemsWatched(playlistId: string, keys: string[], watched: boolean): void {
  markItemsWatched(playlistId, keys, watched);
}

/** Removes every watched video from a virtual playlist (folder playlists are not changed). */
export function removeWatchedFromPlaylist(playlistId: string): Promise<void> {
  return removeWatched(playlistId);
}
