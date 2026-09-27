import { useEffect, useRef } from "react";
import { loadMoreYoutubeFeed } from "./useYoutubeFeed";

/** Sits under the mixed grid and pulls the next feed page once it scrolls near view. */
export function FeedLoadMore() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMoreYoutubeFeed();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="h-px" aria-hidden />;
}
