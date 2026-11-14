import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { PlaylistItem, VideoInfo } from "../types";
import type { VideoInfoCookieContext } from "../downloadVideoInfoFetch";

export type PlaylistStreamMeta = {
  title?: string | null;
  uploader?: string | null;
  channel?: string | null;
  count?: number | null;
};

type BatchPayload = {
  requestId: string;
  items: PlaylistItem[];
  meta?: PlaylistStreamMeta | null;
};

const BATCH_EVENT = "playlist-preview-batch";
/** Events and the command result travel separately; give the last batch a beat to land first. */
const END_GRACE_MS = 60;

/** Folds a streamed page of rows into the hero info. The first page creates it. */
export function mergePlaylistBatch(
  prev: VideoInfo | null,
  items: PlaylistItem[],
  meta: PlaylistStreamMeta | null,
): VideoInfo {
  const rows = [...(prev?.playlistItems ?? []), ...items];
  const duration = rows.reduce((sum, r) => sum + (r.duration > 0 ? r.duration : 0), 0);
  return {
    title: meta?.title?.trim() || prev?.title || "Playlist",
    thumbnail: prev?.thumbnail || rows.find((r) => r.thumbnail)?.thumbnail || "",
    duration,
    formats: prev?.formats ?? [],
    isPlaylist: true,
    playlistItems: rows,
    uploader: meta?.uploader ?? prev?.uploader ?? null,
    channel: meta?.channel ?? prev?.channel ?? null,
  };
}

/**
 * Lists a playlist in pages (5 rows, then 10 at a time). Returns a cancel function. `onEnd` runs once
 * after the last page, with an error string only when nothing could be listed.
 */
export function startPlaylistPreviewStream(opts: {
  url: string;
  cookies?: VideoInfoCookieContext;
  onBatch: (items: PlaylistItem[], meta: PlaylistStreamMeta | null) => void;
  onEnd: (total: number, error: string | null) => void;
}): () => void {
  const requestId = crypto.randomUUID();
  let ended = false;
  let unlisten: (() => void) | null = null;

  const stop = () => {
    ended = true;
    unlisten?.();
    unlisten = null;
  };

  void (async () => {
    unlisten = await listen<BatchPayload>(BATCH_EVENT, (e) => {
      if (ended || e.payload.requestId !== requestId) return;
      opts.onBatch(e.payload.items, e.payload.meta ?? null);
    });
    if (ended) {
      unlisten();
      return;
    }
    let total = 0;
    let error: string | null = null;
    try {
      total = await invoke<number>("stream_playlist_preview", {
        url: opts.url,
        requestId,
        browserCookies: opts.cookies?.browserCookies ?? "",
        cookieFile: opts.cookies?.cookieFile ?? "",
      });
    } catch (e: unknown) {
      error = String(e);
    }
    await new Promise((r) => setTimeout(r, END_GRACE_MS));
    if (ended) return;
    stop();
    opts.onEnd(total, error);
  })();

  return () => {
    if (ended) return;
    stop();
    void invoke("cancel_playlist_preview", { requestId }).catch(() => {});
  };
}
