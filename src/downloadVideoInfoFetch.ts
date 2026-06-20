import { invoke } from "@tauri-apps/api/core";

import { sanitizeVideoInfo } from "./components/downloader/downloaderFormat";

import type { VideoInfo } from "./types";

import { normalizeYouTubeUrlForCompare } from "./youtubeUrl";



const METADATA_FETCH_TIMEOUT_MS = 120_000;



export type VideoInfoCookieContext = {

  browserCookies?: string;

  cookieFile?: string;

};



/** One in-flight `get_video_info` per URL + format + cookie context (+ display lane). */

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



function displayOnlyInflightSuffix(displayOnly: boolean): string {

  return displayOnly ? "\x1fdisplay" : "";

}



export function videoInfoFetchInflightKey(

  url: string,

  videoFormat: string,

  cookies?: VideoInfoCookieContext,

  displayOnly = false,

): string {

  const key = normalizeYouTubeUrlForCompare(url);

  if (!key) return "";

  return `${key}\x1f${videoFormat}${displayOnlyInflightSuffix(displayOnly)}${cookieInflightSuffix(cookies)}`;

}



async function invokeGetVideoInfo(

  url: string,

  videoFormat: string,

  audioOnly: boolean,

  cookies: VideoInfoCookieContext | undefined,

  displayOnly: boolean,

  timeoutMs: number,

): Promise<VideoInfo> {

  const key = url.trim();

  if (!key) {

    throw new Error("URL is empty");

  }



  const inflightKey = videoInfoFetchInflightKey(key, videoFormat, cookies, displayOnly);

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

            displayOnly,

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



export async function fetchVideoInfoWithTimeout(

  url: string,

  videoFormat: string,

  audioOnly = false,

  cookies?: VideoInfoCookieContext,

  timeoutMs = METADATA_FETCH_TIMEOUT_MS,

): Promise<VideoInfo> {

  return invokeGetVideoInfo(url, videoFormat, audioOnly, cookies, false, timeoutMs);

}



/** Queue-row hydration: one unfiltered simulate; hero paste keeps full dual-size fetch. */

export async function fetchVideoInfoForQueueHydration(

  url: string,

  videoFormat: string,

  audioOnly = false,

  cookies?: VideoInfoCookieContext,

  timeoutMs = METADATA_FETCH_TIMEOUT_MS,

): Promise<VideoInfo> {

  return invokeGetVideoInfo(url, videoFormat, audioOnly, cookies, true, timeoutMs);

}


