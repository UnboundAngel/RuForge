import { useEffect, useState } from "react";
import type { FeedVideo } from "@/components/library/youtubeFeed";
import { searchYoutubeVideos } from "./videoSuggestions";

const DEBOUNCE_MS = 400;

/** Debounced YouTube search; `results` stays null until the query is long enough to search. */
export function useYoutubeSearch(query: string) {
  const [results, setResults] = useState<FeedVideo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      void searchYoutubeVideos(q)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  return { results, loading, active: q.length >= 2 };
}
