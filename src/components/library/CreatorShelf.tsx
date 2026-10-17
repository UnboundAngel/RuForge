import type { ReactNode } from "react";
import { EdgeSquishScroll } from "@/components/ui/EdgeSquishScroll";
import { SectionTitle } from "./LibraryHome";

/** A titled row that scrolls sideways; edge arrows show on hover and page by one screen of cards. */
export function CreatorShelf({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {/* Card hovers paint 12px past the card; the padding keeps them inside the scroll box. */}
      <EdgeSquishScroll arrows wrapItems={false} className="-mx-3 -mt-3" contentClassName="block px-3 pt-3 pb-3">
        {children}
      </EdgeSquishScroll>
    </section>
  );
}
