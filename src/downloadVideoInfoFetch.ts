import { invoke } from "@tauri-apps/api/core";
import type { VideoInfo } from "./types";

const METADATA_FETCH_TIMEOUT_MS = 120_000;

/** One in-flight `get_video_info` per URL + video quality format (snapshot holds both audio and video sizes). */
const inflightByKey = new Map<string, Promise<VideoInfo>>();

function timeoutError(): Error {
  return new Error(
    "Metadata fetch timed out. Check your network, then try again or restart RuForge.",
  );
}

export function videoInfoFetchInflightKey(url: string, videoFormat: string): string {
  const key = url.trim();
  if (!key) return "";
  return `${key}\x1f${videoFormat}`;
}

export async function fetchVideoInfoWithTimeout(
  url: string,
  videoFormat: string,
  audioOnly = false,
  timeoutMs = METADATA_FETCH_TIMEOUT_MS,
): Promise<VideoInfo> {
  const key = url.trim();
  if (!key) {
    throw new Error("URL is empty");
  }

  const inflightKey = videoInfoFetchInflightKey(key, videoFormat);
  let p = inflightByKey.get(inflightKey);
  if (!p) {
    p = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          invoke<VideoInfo>("get_video_info", {
            url: key,
            format: videoFormat,
            audioOnly,
          }),
          new Promise<VideoInfo>((_, reject) => {
            timer = setTimeout(() => reject(timeoutError()), timeoutMs);
          }),
        ]);
        return result;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    })();
    inflightByKey.set(inflightKey, p);
    void p.finally(() => {
      inflightByKey.delete(inflightKey);
    });
  }

  return p;
}
