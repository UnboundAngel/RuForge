import { createContext, useContext, useMemo } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { useLibraryTags } from "@/lib/libraryTagsStore";
import { allTags, orderVideoTags, videoKey, type LibraryTag, type VideoTagRef } from "@/lib/libraryTags";
import type { MediaFile } from "@/types";

/** Game exe icons by game id, loaded once per library view instead of once per card. */
export const GameIconsContext = createContext<Record<string, string>>({});

export function useGameIcon(gameId: string | undefined): string | null {
  const icons = useContext(GameIconsContext);
  return gameId ? (icons[gameId] ?? null) : null;
}

export function useAllTags(): LibraryTag[] {
  const plain = useLibraryTags((s) => s.tags);
  const games = useRuforgeStore((s) => s.settings.games);
  return useMemo(() => allTags({ tags: plain }, games), [plain, games]);
}

const NO_REFS: VideoTagRef[] = [];

export type VideoTag = LibraryTag & { source: VideoTagRef["source"] };

/** Game tag first, then plain tags; refs to tags that no longer exist drop out. */
export function useVideoTags(file: Pick<MediaFile, "path" | "sourceId" | "sourceUrl">): VideoTag[] {
  const key = useMemo(() => videoKey(file), [file.path, file.sourceId, file.sourceUrl]);
  const refs = useLibraryTags((s) => s.videos[key] ?? NO_REFS);
  const tags = useAllTags();
  return useMemo(() => {
    if (!refs.length) return [];
    const byId = new Map(tags.map((t) => [t.id, t]));
    const out: VideoTag[] = [];
    for (const ref of orderVideoTags(refs)) {
      const tag = byId.get(ref.tagId);
      if (tag) out.push({ ...tag, source: ref.source });
    }
    return out;
  }, [refs, tags]);
}
