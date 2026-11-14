import {
  canonicalYouTubeDownloaderUrl,
  extractYouTubeUrlFromText,
  youtubeUrlsMatch,
} from "../../youtubeUrl";

/** Raw URL-ish strings from a browser drag payload (trimmed lines, URI comments stripped). */
export function parseDroppedUrls(dataTransfer: DataTransfer): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const pushLine = (line: string) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) pushLine(line);
  }

  if (out.length === 0) {
    const plain = dataTransfer.getData("text/plain");
    if (plain) {
      for (const line of plain.split(/\r?\n/)) pushLine(line);
    }
  }

  return out;
}

/** Canonical YouTube watch or playlist URLs (non-YouTube dropped strings are ignored). */
export function filterSupportedYouTubeUrls(urls: string[]): string[] {
  const canonList: string[] = [];
  const seen = new Set<string>();

  for (const raw of urls) {
    const canon =
      canonicalYouTubeDownloaderUrl(raw.trim()) ?? extractYouTubeUrlFromText(raw);
    if (!canon) continue;
    if (seen.has(canon)) continue;
    if (canonList.some((c) => youtubeUrlsMatch(c, canon))) continue;
    seen.add(canon);
    canonList.push(canon);
  }

  return canonList;
}

export function mimeTypesMayCarryUri(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const types = dataTransfer.types;
  if (!types || typeof types.includes !== "function") return false;
  return (
    types.includes("text/uri-list") ||
    types.includes("text/plain") ||
    types.includes("application/x-moz-url")
  );
}

let internalDragActive = false;

/**
 * True while a drag that started inside the app (row reorder) is in flight. External drags
 * (a link from a browser) never fire dragstart in this document, so they stay intake material.
 */
export function isInternalDrag(): boolean {
  return internalDragActive;
}

if (typeof document !== "undefined") {
  document.addEventListener("dragstart", () => { internalDragActive = true; }, true);
  document.addEventListener("dragend", () => { internalDragActive = false; }, true);
}
