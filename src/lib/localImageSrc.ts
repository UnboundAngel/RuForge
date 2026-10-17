import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Asset URLs for local images. The asset protocol marks image responses cacheable for a week when
 * the URL carries `v` (`src-tauri/src/asset_protocol.rs`), so `v` must change whenever the bytes at
 * a path can. It is unique per page load, which covers files changed while the app was closed, plus
 * a generation that `bumpLocalImageGeneration` moves when the app replaces files in place.
 */
const LOAD_ID = Date.now().toString(36);
let generation = 0;

/** Failed loads are never cached by the webview, so a missing optional cover would 404 on every view. */
const knownMissing = new Set<string>();

/**
 * WebView2 keeps custom-scheme responses only in Blink's memory cache, which drops images no
 * element references after ~30 s; holding an off-DOM Image per thumb keeps revisits off the asset
 * handler. Thumbs are ~6 KB encoded and are never decoded off-DOM.
 */
const RETAIN_THUMBS = 1000;
const retainedThumbs = new Map<string, HTMLImageElement>();

function retainThumb(url: string): void {
  if (typeof Image === "undefined") return;
  const held = retainedThumbs.get(url);
  if (held) {
    retainedThumbs.delete(url);
    retainedThumbs.set(url, held);
    return;
  }
  const img = new Image();
  img.decoding = "async";
  img.onerror = () => retainedThumbs.delete(url);
  img.src = url;
  retainedThumbs.set(url, img);
  if (retainedThumbs.size > RETAIN_THUMBS) {
    const oldest = retainedThumbs.keys().next().value;
    if (oldest !== undefined) retainedThumbs.delete(oldest);
  }
}

export function bumpLocalImageGeneration(): void {
  generation += 1;
  knownMissing.clear();
  retainedThumbs.clear();
}

/** A library rescan may have written covers that were missing before. */
export function forgetMissingLocalImages(): void {
  knownMissing.clear();
}

export function markLocalImageMissing(path: string): void {
  knownMissing.add(path);
}

export function isLocalImageKnownMissing(path: string): boolean {
  return knownMissing.has(path);
}

export type LocalImageOptions = {
  /** Shown at 128 CSS px or less: serve a cached ~128 px thumbnail instead of the full file. */
  thumb?: boolean;
};

export function localImageSrc(path: string, opts: LocalImageOptions = {}): string {
  const base = convertFileSrc(path);
  const v = `v=${LOAD_ID}.${generation}`;
  if (!opts.thumb) return `${base}?${v}`;
  const url = `${base}?${v}&thumb=128`;
  retainThumb(url);
  return url;
}

export function localThumbSrc(path: string): string {
  return localImageSrc(path, { thumb: true });
}
