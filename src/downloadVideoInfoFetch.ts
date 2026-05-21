import { invoke } from "@tauri-apps/api/core";
import { sanitizeVideoInfo } from "./components/downloader/downloaderFormat";
import type { VideoInfo } from "./types";

const METADATA_FETCH_TIMEOUT_MS = 120_000;

export type VideoInfoCookieContext = {
  browserCookies?: string;
  cookieFile?: string;
};

/** One in-flight `get_video_info` per URL + format + cookie context. */
const inflightByKey = new Map<string, Promise<VideoInfo>>();

function timeoutError(): Error {
  return new Error(
    "Metadata fetch timed out. Check your network, then try again or restart RuForge.",
  );
}

function cookieInflightSuffix(cookies?: VideoInfoCookieContext): string {
  if (!cookies) return "";
  const browser = cookies.browserCookies ?? "";
  const file = cookies.cookieFile ?? "";
  if (!browser && !file) return "";
  return `\x1f${browser}\x1f${file}`;
}

export function videoInfoFetchInflightKey(
  url: string,
  videoFormat: string,
  cookies?: VideoInfoCookieContext,
): string {
  const key = url.trim();
  if (!key) return "";
  return `${key}\x1f${videoFormat}${cookieInflightSuffix(cookies)}`;
}

export async function fetchVideoInfoWithTimeout(
  url: string,
  videoFormat: string,
  audioOnly = false,
  cookies?: VideoInfoCookieContext,
  timeoutMs = METADATA_FETCH_TIMEOUT_MS,
): Promise<VideoInfo> {
  const key = url.trim();
  if (!key) {
    throw new Error("URL is empty");
  }

  const inflightKey = videoInfoFetchInflightKey(key, videoFormat, cookies);
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
            browserCookies: cookies?.browserCookies ?? "",
            cookieFile: cookies?.cookieFile ?? "",
          }),
          new Promise<VideoInfo>((_, reject) => {
            timer = setTimeout(() => reject(timeoutError()), timeoutMs);
          }),
        ]);
        return sanitizeVideoInfo(result);
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
