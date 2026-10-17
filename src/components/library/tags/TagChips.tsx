import { Gamepad2, Hash } from "lucide-react";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import type { LibraryTag } from "@/lib/libraryTags";
import { cn } from "@/lib/utils";
import { openTag } from "./openTag";
import { useGameIcon } from "./useVideoTags";

export function TagGlyph({ tag, size = 12, className }: { tag: LibraryTag; size?: number; className?: string }) {
  const icon = useGameIcon(tag.gameId);
  if (tag.kind !== "game") return <Hash size={size} strokeWidth={2.5} className={cn("shrink-0 text-stone-500", className)} />;
  const fallback = <Gamepad2 size={size} strokeWidth={2.25} className={cn("shrink-0 text-stone-400", className)} />;
  return (
    <FallbackImg
      src={icon}
      fallback={fallback}
      className={cn("shrink-0 rounded-[4px] object-contain", className)}
      style={{ width: size + 2, height: size + 2 }}
    />
  );
}

/**
 * A tag as a link in the byline's own voice: the game reads as its icon and name, plain tags as
 * `#name`. No pill, so a tagged card reads as metadata rather than a row of buttons.
 */
export function TagLink({ tag, className }: { tag: LibraryTag; className?: string }) {
  const game = tag.kind === "game";
  return (
    <button
      type="button"
      data-tooltip={game ? `Videos for ${tag.name}` : `Videos tagged ${tag.name}`}
      onClick={(e) => {
        e.stopPropagation();
        openTag(tag.id);
      }}
      className={cn(
        "group/tag inline-flex min-w-0 max-w-[11rem] items-center gap-1.5 text-[12px] font-semibold transition-colors duration-150 hover:text-[color:var(--accent)]",
        game ? "text-stone-300" : "text-stone-500",
        className,
      )}
    >
      {game ? (
        <TagGlyph tag={tag} size={13} />
      ) : (
        <span aria-hidden className="-mr-1 text-stone-600 transition-colors duration-150 group-hover/tag:text-[color:var(--accent)]">
          #
        </span>
      )}
      <HoverMarqueeText text={tag.name} slow className="min-w-0" />
    </button>
  );
}

/**
 * Tag marker on the thumbnail, the way a store marks a platform: the game's icon sits in the
 * corner and opens out to its name while the card is hovered. A video with only plain tags gets
 * a `#` marker instead. The full list opens from the marker when there is more than one tag.
 */
export function TagBadge({ tags, expanded }: { tags: readonly LibraryTag[]; expanded: boolean }) {
  if (!tags.length) return null;
  const [primary, ...rest] = tags;
  const label = rest.length ? `${primary.name} +${rest.length}` : primary.name;
  return (
    <div className="group/badge absolute left-2.5 top-2.5 z-30" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        data-tooltip={primary.kind === "game" ? `Videos for ${primary.name}` : `Videos tagged ${primary.name}`}
        onClick={() => openTag(primary.id)}
        className="flex h-7 max-w-full items-center rounded-[9px] bg-black/60 pl-[5px] pr-[5px] text-[11px] font-bold text-white/90 backdrop-blur-md transition-colors duration-150 hover:bg-black/80"
      >
        <TagGlyph tag={primary} size={16} className="text-white/80" />
        <span
          className={cn(
            "overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ease-out",
            expanded ? "ml-1.5 mr-1 max-w-[12rem] opacity-100" : "ml-0 mr-0 max-w-0 opacity-0",
          )}
        >
          {label}
        </span>
      </button>
      {rest.length ? (
        <div className="invisible absolute left-0 top-full z-40 pt-1.5 opacity-0 transition-opacity duration-150 group-hover/badge:visible group-hover/badge:opacity-100">
          <div className="flex w-max max-w-[16rem] flex-col items-start gap-2 rounded-[14px] bg-[color:var(--rf-popover-bg)] px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            {tags.map((tag) => (
              <TagLink key={tag.id} tag={tag} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
