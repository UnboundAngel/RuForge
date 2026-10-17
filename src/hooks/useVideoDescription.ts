import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type VideoDescriptionMeta = {
  text: string | null;
  viewCount: number | null;
  uploadDate: string | null;
};

type InfoMeta = { description: string | null; viewCount: number | null; uploadDate: string | null };

const EMPTY: VideoDescriptionMeta = { text: null, viewCount: null, uploadDate: null };
const cache = new Map<string, VideoDescriptionMeta>();
const inflight = new Map<string, Promise<VideoDescriptionMeta>>();

function loadMeta(path: string): Promise<VideoDescriptionMeta> {
  const pending = inflight.get(path);
  if (pending) return pending;
  const p = invoke<InfoMeta>("library_info_meta", { path })
    .then((m) => ({ text: m.description ?? null, viewCount: m.viewCount ?? null, uploadDate: m.uploadDate ?? null }))
    .catch((e) => {
      console.warn("reading video description failed", e);
      return EMPTY;
    })
    .then((meta) => {
      cache.set(path, meta);
      inflight.delete(path);
      return meta;
    });
  inflight.set(path, p);
  return p;
}

export type VideoDescriptionState = VideoDescriptionMeta & { loading: boolean };

/** The creator's description, view count and upload date from the `.info.json` sidecar, read once per path per session. */
export function useVideoDescription(path: string | null | undefined): VideoDescriptionState {
  const [state, setState] = useState<VideoDescriptionState>(() =>
    path && cache.has(path)
      ? { ...cache.get(path)!, loading: false }
      : { ...EMPTY, loading: Boolean(path) },
  );

  useEffect(() => {
    if (!path) {
      setState({ ...EMPTY, loading: false });
      return;
    }
    const hit = cache.get(path);
    if (hit) {
      setState({ ...hit, loading: false });
      return;
    }
    setState({ ...EMPTY, loading: true });
    let cancelled = false;
    void loadMeta(path).then((meta) => {
      if (!cancelled) setState({ ...meta, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}
