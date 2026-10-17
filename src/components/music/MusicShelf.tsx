import type { ReactNode } from "react";
import { EdgeSquishScroll } from "@/components/ui/EdgeSquishScroll";
import { cn } from "@/lib/utils";

export const MUSIC_SHELF_GAP_HOME_PX = 20;
export const MUSIC_SHELF_GAP_RECENT_PX = 40;

/** Titled Music row of cards: squish scroller with the hover edge arrows. */
export function MusicShelf({
  title,
  gap,
  className,
  children,
}: {
  title?: string;
  /** Px between cards; defaults to the scroller's own gap. */
  gap?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("w-full min-w-0", className)}>
      {title ? (
        <h2 className="mb-5 text-2xl font-bold tracking-tight" style={{ color: "var(--music-text-primary)" }}>
          {title}
        </h2>
      ) : null}
      <EdgeSquishScroll arrows wrapItems={false} gap={gap} contentClassName="pb-2">
        {children}
      </EdgeSquishScroll>
    </section>
  );
}
