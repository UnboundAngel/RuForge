import { useCallback, useMemo, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { isLocalImageKnownMissing, localImageSrc, markLocalImageMissing } from "@/lib/localImageSrc";

type Candidate = string | null | undefined;
type ImageCandidates = Candidate | readonly Candidate[];

function candidateList(candidates: ImageCandidates): string[] {
  const raw = Array.isArray(candidates) ? candidates : [candidates];
  return [...new Set(raw.filter((c): c is string => typeof c === "string" && c.trim() !== ""))];
}

/**
 * Tries `candidates` in order, stepping to the next on a load error. `src` is null once all
 * have failed; `path` is the candidate as passed (before `local` conversion).
 * A new candidate list starts over from the first.
 */
export function useImageFallback(candidates: ImageCandidates, opts: { local?: boolean; thumb?: boolean } = {}) {
  const raw = candidateList(candidates);
  const rawKey = raw.join("\n");
  const local = !!opts.local;
  // Filtered once per candidate list, so marking a miss below does not shift the walk mid-way.
  const list = useMemo(
    () => (local ? raw.filter((p) => !isLocalImageKnownMissing(p)) : raw),
    [rawKey, local],
  );
  const key = list.join("\n");
  const [failed, setFailed] = useState({ key, count: 0 });
  const count = failed.key === key ? failed.count : 0;
  const path = list[count] ?? null;
  // Several imgs can share one onError; each failed candidate must advance the walk only once.
  const onError = useCallback(() => {
    if (local && path) markLocalImageMissing(path);
    setFailed((f) => {
      const current = f.key === key ? f.count : 0;
      return current === count ? { key, count: count + 1 } : f;
    });
  }, [key, local, path, count]);
  const src = path && opts.local ? localImageSrc(path, { thumb: opts.thumb }) : path;
  return { src, path, onError };
}

type FallbackImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src: ImageCandidates;
  /** Candidates are local file paths, served through the asset protocol. */
  local?: boolean;
  /** With `local`: rendered at 128 CSS px or less, so a cached thumbnail is enough. */
  thumb?: boolean;
  /** Rendered instead of the img when there is nothing to show or every candidate failed. */
  fallback?: ReactNode;
};

/** The one img with a fallback: walks its candidates on error, then renders `fallback`. */
export function FallbackImg({ src, local, thumb, fallback = null, alt = "", draggable = false, ...img }: FallbackImgProps) {
  const { src: url, onError } = useImageFallback(src, { local, thumb });
  if (!url) return <>{fallback}</>;
  return <img {...img} src={url} alt={alt} draggable={draggable} onError={onError} />;
}
