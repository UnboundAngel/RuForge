import { useMemo } from "react";

import { playlistSizeProgress, sumPlaylistDisplayBytes } from "../../playlistDownloadPlan";
import type { VideoInfo } from "../../types";

/** Running size over the kept rows (still growing while rows lack sizes) and the final total. */
export function usePlaylistHeroSize(
  videoInfo: VideoInfo | null,
  overrides: Record<string, boolean>,
  audioOnly: boolean,
  excluded: ReadonlySet<string>,
  sizeErrors: ReadonlyMap<string, string>,
) {
  return useMemo(() => {
    const items = videoInfo?.isPlaylist ? videoInfo.playlistItems : undefined;
    if (!items?.length) return { size: null, displayBytes: null };
    return {
      size: playlistSizeProgress(items, overrides, audioOnly, excluded, new Set(sizeErrors.keys())),
      displayBytes: sumPlaylistDisplayBytes(items, overrides, audioOnly, excluded),
    };
  }, [videoInfo, overrides, audioOnly, excluded, sizeErrors]);
}
