import type { PlaylistItem } from "../../types";
import { setPlaylistRowsExcluded } from "../../lib/playlistPreviewState";
import { PlaylistPreviewList } from "./PlaylistPreviewList";
import { PlaylistPreviewRow } from "./PlaylistPreviewRow";
import type { useDownloaderView } from "./useDownloaderView";

type Hero = ReturnType<typeof useDownloaderView>;

/** The playlist rows under the hero: reorder, cancel per row, search, audio toggle per row. */
export function HeroPlaylistList({ d, items }: { d: Hero; items: PlaylistItem[] }) {
  const queued = Boolean(d.batchQueuePlaylistView);
  return (
    <PlaylistPreviewList
      items={items}
      itemKey={d.playlistItemKey}
      itemTitle={(item) => item.title}
      onReorder={d.reorderPlaylistItems}
      disabled={queued}
      listing={d.playlistListing}
      excluded={queued ? undefined : d.playlistExcluded}
      anchor={d.playlistAnchor}
      onSetExcluded={queued ? undefined : setPlaylistRowsExcluded}
      className="h-[260px] overflow-y-auto pb-8 [mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent)] sm:h-[300px] rf-scrollbar"
      gridClassName="grid grid-cols-1 content-start gap-1 lg:grid-cols-2"
      renderRow={(item, idx, lifted, controls) => {
        const batchJob = queued ? d.batchQueueJobs.find((j) => j.id === item.id) : null;
        const rowKey = batchJob ? batchJob.id : d.playlistItemKey(item, idx + 1);
        const rowAudio = batchJob
          ? batchJob.options.audioOnly === true
          : d.resolveAudioOnlyForPlaylistItem(rowKey, d.playlistItemAudioOverrides, d.heroAudioOnly);
        const dup = batchJob
          ? d.isBatchQueueJobDuplicate(item.webpageUrl)
          : d.isPlaylistItemDuplicate(item);
        return (
          <PlaylistPreviewRow
            number={controls.number}
            key={`playlist-row-${idx}-${item.webpageUrl ?? item.title}`}
            lifted={lifted}
            item={item}
            audioOnly={rowAudio}
            duplicate={dup}
            batchJob={batchJob}
            excluded={queued ? undefined : controls.excluded}
            onToggleExcluded={queued ? undefined : controls.onToggleExcluded}
            sizeError={item.id ? d.playlistSizeErrors.get(item.id) : undefined}
            onToggleAudio={() =>
              batchJob
                ? d.toggleBatchQueueJobAudio(batchJob.id, !rowAudio)
                : d.togglePlaylistItemAudio(rowKey, !rowAudio)
            }
          />
        );
      }}
    />
  );
}
