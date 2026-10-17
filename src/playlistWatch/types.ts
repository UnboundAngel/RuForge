export type PlaylistNewVideo = { id: string; title: string };

/** Pulled from Rust through the private mailbox; mirrors `PlaylistNewRecord`. */
export type PlaylistNewRecord = {
  listId: string;
  listUrl: string;
  title: string;
  outputDir: string;
  folderName: string;
  videos: PlaylistNewVideo[];
  at: number;
};

export const PLAYLIST_WATCH_EVENT = "playlist-watch-new";
