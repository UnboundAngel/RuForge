import { useEffect, useMemo } from "react";
import { videoKey, type LibraryTag } from "@/lib/libraryTags";
import { useLibraryTags } from "@/lib/libraryTagsStore";
import type { MediaFile } from "@/types";
import { asFiles } from "../CreatorHome";
import type { CreatorGridRenderer } from "../CreatorPage";
import { closeLibraryPage } from "../creatorPageStore";
import { openTag } from "./openTag";
import { TagRulesPanel } from "./TagRulesPanel";
import { useAllTags } from "./useVideoTags";

function countLabel(n: number): string {
  return `${n} video${n === 1 ? "" : "s"}`;
}

/** A library view of one plain tag. Game tags live on their game page in the Games view. */
export function TagPage({
  tagId,
  files,
  columns,
  renderGrid,
}: {
  tagId: string;
  files: MediaFile[];
  columns: number;
  renderGrid: CreatorGridRenderer;
}) {
  const tags = useAllTags();
  const tag = tags.find((t) => t.id === tagId) ?? null;
  const isGame = tag?.kind === "game";
  const videos = useLibraryTags((s) => s.videos);
  const tagged = useMemo(
    () =>
      files
        .filter((f) => videos[videoKey(f)]?.some((r) => r.tagId === tagId))
        .sort((a, b) => b.created - a.created),
    [files, videos, tagId],
  );

  useEffect(() => {
    if (!tag) closeLibraryPage();
    else if (isGame) {
      closeLibraryPage();
      openTag(tag.id);
    }
  }, [tag, isGame]);

  useEffect(() => {
    const onMouseBack = (e: MouseEvent) => {
      if (e.button !== 3) return;
      e.preventDefault();
      closeLibraryPage();
    };
    window.addEventListener("mouseup", onMouseBack);
    return () => window.removeEventListener("mouseup", onMouseBack);
  }, []);

  if (!tag || isGame) return null;

  return (
    <div className="pt-16 pb-8">
      <TagHeader tag={tag} count={tagged.length} />
      <TagRulesPanel tag={tag} />
      {tagged.length ? (
        renderGrid(asFiles(tagged), columns)
      ) : (
        <div className="py-20 text-center">
          <p className="text-sm font-medium text-stone-400">nothing tagged {tag.name} yet</p>
          <p className="mt-1.5 text-xs font-medium text-stone-600">
            add a rule above, or right-click a video and pick Tags…
          </p>
        </div>
      )}
    </div>
  );
}

function TagHeader({ tag, count }: { tag: LibraryTag; count: number }) {
  return (
    <div className="pb-5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">Tag</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-stone-50">{tag.name}</h1>
      <p className="mt-1.5 text-sm font-medium text-stone-400">{countLabel(count)}</p>
    </div>
  );
}
