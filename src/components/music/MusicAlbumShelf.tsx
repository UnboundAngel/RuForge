import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  musicAlbumCardWidthPx,
  musicAlbumShelfFitCount,
} from "@/lib/musicAlbumShelfLayout";

type Props<T> = {
  items: T[];
  gap?: number;
  title?: string;
  renderItem: (item: T) => React.ReactNode;
  keyFn: (item: T) => string;
  className?: string;
};

export function MusicAlbumShelf<T>({
  items,
  gap = 40,
  title,
  renderItem,
  keyFn,
  className = "",
}: Props<T>) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(4);
  const [page, setPage] = useState(0);

  const measure = useCallback(() => {
    const el = measureRef.current;
    if (!el) return;
    const cardWidth = musicAlbumCardWidthPx();
    setVisibleCount(musicAlbumShelfFitCount(el.clientWidth, cardWidth, gap));
  }, [gap]);

  useEffect(() => {
    measure();
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(items.length / visibleCount)),
    [items.length, visibleCount],
  );

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const pageItems = useMemo(() => {
    const start = page * visibleCount;
    return items.slice(start, start + visibleCount);
  }, [items, page, visibleCount]);

  const canPageLeft = page > 0;
  const canPageRight = page < pageCount - 1;
  const showPagination = pageCount > 1;

  return (
    <section className={`w-full min-w-0 ${className}`}>
      {(title || showPagination) && (
        <div className={`flex items-center justify-between ${title ? "mb-5" : "mb-3"}`}>
          {title ? (
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "var(--music-text-primary)" }}>
              {title}
            </h2>
          ) : (
            <span />
          )}
          {showPagination && (
            <div className="flex items-center gap-2 shrink-0">
              <ShelfArrow direction="left" disabled={!canPageLeft} onClick={() => setPage((p) => p - 1)} />
              <ShelfArrow direction="right" disabled={!canPageRight} onClick={() => setPage((p) => p + 1)} />
            </div>
          )}
        </div>
      )}
      <div ref={measureRef} className="w-full min-w-0 overflow-hidden">
        <div className="flex min-w-0" style={{ gap: `${gap}px` }}>
          {pageItems.map((item) => (
            <div key={keyFn(item)} className="shrink-0">
              {renderItem(item)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShelfArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
      style={{
        borderColor: disabled ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.25)",
        background: disabled ? "transparent" : "rgba(255, 255, 255, 0.08)",
        color: disabled ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.9)",
      }}
      aria-label={direction === "left" ? "Previous albums" : "Next albums"}
    >
      <Icon size={16} strokeWidth={2.5} />
    </button>
  );
}
