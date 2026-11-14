import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import { RecommendedVideoPlaylistCard } from "./RecommendedVideoPlaylistCard";
import { suggestVideoPlaylists } from "./videoPlaylistSuggestions";

/**
 * Playlists the library could make for you, one click each. Last thing on the Playlists page.
 * The games extra hands in its own cards so both kinds share one shelf.
 */
export function RecommendedVideoPlaylists({
  files,
  existingTitles,
  gameCards,
  gridClassName,
  gridStyle,
}: {
  files: readonly MediaFile[];
  existingTitles: readonly string[];
  gameCards: ReactNode;
  gridClassName: string;
  gridStyle: CSSProperties;
}) {
  const createVirtualPlaylist = useRuforgeStore((s) => s.createVirtualPlaylist);
  const notify = useRuforgeStore((s) => s.notify);
  const suggestions = useMemo(() => suggestVideoPlaylists(files, existingTitles), [files, existingTitles]);
  if (suggestions.length === 0 && !gameCards) return null;

  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-bold tracking-tight text-stone-50">Recommended</h2>
      <div className={gridClassName} style={gridStyle}>
        {gameCards}
        {suggestions.map((s) => (
          <RecommendedVideoPlaylistCard
            key={s.id}
            suggestion={s}
            onCreate={() => {
              createVirtualPlaylist(s.title, s.files.map((x) => x.path));
              notify(`Created "${s.title}" with ${s.files.length} videos`);
            }}
          />
        ))}
      </div>
    </section>
  );
}
