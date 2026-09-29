import type { ReactNode } from "react";
import { FollowChannelButton } from "@/components/watchlist/FollowChannelButton";
import type { MediaFile } from "@/types";
import { FeedVideoCard } from "./FeedVideoCard";
import { type HomeSection, shortsPerShelf } from "./homeSections";
import { openCreatorPage } from "./creatorPageStore";
import { ChannelAvatar } from "./VideoByline";
import type { MixedGridItem } from "./youtubeFeed";

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-5 flex items-center gap-3 text-xl font-bold tracking-tight text-stone-50">{children}</h2>;
}

const asItems = (files: MediaFile[]): MixedGridItem<MediaFile>[] => files.map((file) => ({ kind: "file", file }));

function ChannelHeading({ channel, channelId }: { channel: string; channelId: string | null }) {
  const body = (
    <>
      <ChannelAvatar channelId={channelId} channel={channel} className="h-8 w-8" />
      <span>
        More from <span className={channelId ? "transition-colors duration-150 group-hover/heading:text-[color:var(--accent)]" : ""}>{channel}</span>
      </span>
    </>
  );
  if (!channelId) return body;
  return (
    <button
      type="button"
      onClick={() => openCreatorPage(channelId, channel)}
      aria-label={`Open ${channel}'s page`}
      className="group/heading flex items-center gap-3 text-left"
    >
      {body}
    </button>
  );
}

/** The All tab as a YouTube-style home: video rows broken up by shelves of other shapes. */
export function LibraryHome({
  sections,
  columns,
  gridClass,
  renderGrid,
  renderPlaylists,
}: {
  sections: HomeSection<MediaFile>[];
  columns: number;
  gridClass: string;
  renderGrid: (items: MixedGridItem<MediaFile>[], columns: number) => ReactNode;
  renderPlaylists: () => ReactNode;
}) {
  const shortsColumns = shortsPerShelf(columns);
  return (
    <div className="flex flex-col gap-14">
      {sections.map((section) => {
        switch (section.kind) {
          case "grid":
            return (
              <section key={section.key}>
                {section.title ? <SectionTitle>{section.title}</SectionTitle> : null}
                {renderGrid(section.items, columns)}
              </section>
            );
          case "continue":
            return (
              <section key={section.key}>
                <SectionTitle>Continue watching</SectionTitle>
                {renderGrid(asItems(section.files), Math.max(2, columns - 1))}
              </section>
            );
          case "shorts":
            return (
              <section key={section.key}>
                <SectionTitle>Shorts</SectionTitle>
                <div className={gridClass} style={{ gridTemplateColumns: `repeat(${shortsColumns}, minmax(0, 1fr))` }}>
                  {section.videos.map((video) => (
                    <FeedVideoCard key={`short-${video.videoId}`} video={video} shape="short" />
                  ))}
                </div>
              </section>
            );
          case "watchlist":
            return (
              <section key={section.key}>
                <SectionTitle>
                  New from channels you follow
                  <span className="text-sm font-medium tabular-nums text-stone-500">{section.videos.length} new</span>
                </SectionTitle>
                {renderGrid(section.videos.map((video) => ({ kind: "feed", video })), columns)}
              </section>
            );
          case "playlists":
            return (
              <section key={section.key}>
                <SectionTitle>Your playlists</SectionTitle>
                {renderPlaylists()}
              </section>
            );
          case "channel":
            return (
              <section key={section.key}>
                <SectionTitle>
                  <ChannelHeading channel={section.channel} channelId={section.channelId} />
                  {section.channelId ? (
                    <FollowChannelButton channelId={section.channelId} channel={section.channel} className="ml-auto" />
                  ) : null}
                </SectionTitle>
                {renderGrid(section.items, columns)}
              </section>
            );
        }
      })}
    </div>
  );
}
