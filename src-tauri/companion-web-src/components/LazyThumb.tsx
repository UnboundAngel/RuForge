import { useEffect, useRef, useState } from "react";
import { fetchStreamToken } from "../api";

type Props = {
  id: string;
  hasThumb: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

const thumbCache = new Map<string, string | null | "pending">();

export function LazyThumb({ id, hasThumb, className, style, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(() => {
    const cached = thumbCache.get(id);
    return typeof cached === "string" ? cached : null;
  });

  useEffect(() => {
    if (!hasThumb) return;

    const cached = thumbCache.get(id);
    if (cached && cached !== "pending") {
      setSrc(cached);
      return;
    }
    if (cached === null) return;

    const el = ref.current;
    if (!el) return;

    const load = async () => {
      if (thumbCache.get(id) === "pending") return;
      thumbCache.set(id, "pending");
      const url = await fetchStreamToken(id, { kind: "thumb" });
      thumbCache.set(id, url);
      if (url) setSrc(url);
    };

    if (!("IntersectionObserver" in window)) {
      void load();
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          obs.disconnect();
          void load();
        }
      },
      { rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [id, hasThumb]);

  return (
    <div ref={ref} className={className} style={style}>
      {src ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : children}
    </div>
  );
}

export function clearThumbCache() {
  thumbCache.clear();
}
