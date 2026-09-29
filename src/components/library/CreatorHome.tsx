import type { MediaFile, PlaylistCollection } from "@/types";
import type { CreatorGridRenderer, CreatorPlaylistRenderer } from "./CreatorPage";
import type { CreatorSections } from "./creatorSections";
import { CreatorShelf } from "./CreatorShelf";
import { CreatorUploadsState } from "./CreatorUploadsState";
import type { ChannelVideosStatus } from "./useChannelVideos";
import type { FeedVideo, MixedGridItem } from "./youtubeFeed";

export const asFeed = (videos: FeedVideo[]): MixedGridItem<MediaFile>[] => videos.map((video) => ({ kind: "feed", video }));
export const asFiles = (files: MediaFile[]): MixedGridItem<MediaFile>[] => files.map((file) => ({ kind: "file", file }));

const count = (n: number) => <span className="text-sm font-medium tabular-nums text-stone-500">{n}</span>;

/**
 * Shelves sized by what they're worth: your downloads play here, so they get the biggest cards;
 * YouTube history is a reminder, so it gets the smallest.
 */
export function CreatorHome({
  channelId,
  own,
  playlists,
  sections,
  status,
  columns,
  gridClass,
  renderGrid,
  renderPlaylists,
}: {
  channelId: string;
  own: MediaFile[];
  playlists: PlaylistCollection[];
  sections: CreatorSections;
  status: ChannelVideosStatus;
  columns: number;
  gridClass: string;
  renderGrid: CreatorGridRenderer;
  renderPlaylists: CreatorPlaylistRenderer;
}) {
  const feedShelf = { feedOpensInExplorer: true, shelf: true };
  return (
    <div className="flex flex-col gap-14">
      {own.length > 0 ? (
        <CreatorShelf title="Your downloads" aside={count(own.length)}>
          {renderGrid(asFiles(own), Math.max(2, columns - 1), { shelf: true })}
        </CreatorShelf>
      ) : null}

      <CreatorShelf title="Latest uploads">
        <CreatorUploadsState
          channelId={channelId}
          status={status}
          count={sections.latest.length}
          columns={columns}
          gridClass={gridClass}
        >
          {renderGrid(asFeed(sections.latest), columns, feedShelf)}
        </CreatorUploadsState>
      </CreatorShelf>

      {sections.popular.length > 0 ? (
        <CreatorShelf title="Popular">{renderGrid(asFeed(sections.popular), columns, feedShelf)}</CreatorShelf>
      ) : null}

      {playlists.length > 0 ? (
        <CreatorShelf title="Playlists" aside={count(playlists.length)}>
          {renderPlaylists(playlists, { shelf: true })}
        </CreatorShelf>
      ) : null}

      {sections.watched.length > 0 ? (
        <CreatorShelf title="Watched on YouTube">
          {renderGrid(asFeed(sections.watched), columns + 1, feedShelf)}
        </CreatorShelf>
      ) : null}
    </div>
  );
}
