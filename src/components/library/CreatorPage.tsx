import { useMemo, type ReactNode } from "react";
import { ChevronLeft, ExternalLink, RotateCcw } from "lucide-react";
import { FollowChannelButton } from "@/components/watchlist/FollowChannelButton";
import type { MediaFile } from "@/types";
import { watchedFromChannel } from "./channelShelf";
import { type CreatorRef, closeCreatorPage } from "./creatorPageStore";
import { creatorFiles, creatorSections } from "./creatorSections";
import { SectionTitle } from "./LibraryHome";
import { openChannelInExplorer } from "./openChannel";
import { loadChannelVideos, useChannelVideos } from "./useChannelVideos";
import { ChannelAvatar } from "./VideoByline";
import type { FeedVideo, MixedGridItem } from "./youtubeFeed";

export type CreatorGridRenderer = (
  items: MixedGridItem<MediaFile>[],
  cols?: number,
  opts?: { feedOpensInExplorer?: boolean },
) => ReactNode;

const asFeed = (videos: FeedVideo[]): MixedGridItem<MediaFile>[] => videos.map((video) => ({ kind: "feed", video }));

function LoadingRow({ columns, gridClass }: { columns: number; gridClass: string }) {
  return (
    <div className={gridClass} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} aria-busy>
      {Array.from({ length: columns }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="aspect-video animate-pulse rounded-[var(--r-media,16px)] bg-[color:var(--rf-well-raised)]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-[color:var(--rf-well-raised)]" />
        </div>
      ))}
    </div>
  );
}

/** A creator inside RuForge: their uploads play in Explorer, their downloads play here. */
export function CreatorPage({
  creator,
  files,
  libraryIds,
  columns,
  gridClass,
  renderGrid,
}: {
  creator: CreatorRef;
  files: MediaFile[];
  libraryIds: ReadonlySet<string>;
  columns: number;
  gridClass: string;
  renderGrid: CreatorGridRenderer;
}) {
  const { channelId, channel } = creator;
  const { byChannel, status, history } = useChannelVideos([channelId], true);
  const state = status[channelId] ?? "loading";
  const recent = byChannel[channelId] ?? [];
  const own = useMemo(() => creatorFiles(files, channelId, channel), [files, channelId, channel]);
  const sections = useMemo(
    () => creatorSections(recent, watchedFromChannel(history, channelId, channel), libraryIds, columns),
    [recent, history, channelId, channel, libraryIds, columns],
  );

  const stats = [
    own.length > 0 ? `${own.length} downloaded` : null,
    recent.length > 0 ? `${recent.length} recent uploads` : null,
  ].filter(Boolean);

  return (
    <div className="pt-12 pb-8">
      <button
        type="button"
        onClick={closeCreatorPage}
        className="mb-6 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-stone-500 transition-colors duration-150 hover:text-stone-200"
      >
        <ChevronLeft size={14} strokeWidth={2.5} />
        Library
      </button>

      <header className="mb-12 flex items-center gap-6">
        <ChannelAvatar channelId={channelId} channel={channel} className="h-24 w-24 text-3xl!" />
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-black tracking-tight text-stone-50">{channel}</h1>
          {stats.length > 0 ? <p className="mt-1.5 text-sm font-medium text-stone-400">{stats.join(" · ")}</p> : null}
          <div className="mt-4 flex items-center gap-2">
            <FollowChannelButton channelId={channelId} channel={channel} />
            <button
              type="button"
              onClick={() => openChannelInExplorer(channelId)}
              className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 text-[12px] font-semibold text-stone-200 transition-colors duration-150 hover:bg-white/[0.12]"
            >
              Open in YouTube
              <ExternalLink size={12} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-14">
        <section>
          <SectionTitle>Latest uploads</SectionTitle>
          {state === "loading" && recent.length === 0 ? (
            <LoadingRow columns={columns} gridClass={gridClass} />
          ) : state === "error" && recent.length === 0 ? (
            <div className="flex items-center gap-3 text-sm text-stone-400">
              Couldn't load uploads from YouTube.
              <button
                type="button"
                onClick={() => void loadChannelVideos(channelId, { force: true })}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-stone-500 transition-colors duration-150 hover:text-stone-200"
              >
                <RotateCcw size={12} strokeWidth={2.5} />
                Retry
              </button>
            </div>
          ) : sections.latest.length > 0 ? (
            renderGrid(asFeed(sections.latest), columns, { feedOpensInExplorer: true })
          ) : (
            <p className="text-sm text-stone-400">You already have everything they uploaded recently.</p>
          )}
        </section>

        {sections.popular.length > 0 ? (
          <section>
            <SectionTitle>Popular</SectionTitle>
            {renderGrid(asFeed(sections.popular), columns, { feedOpensInExplorer: true })}
          </section>
        ) : null}

        {sections.watched.length > 0 ? (
          <section>
            <SectionTitle>Watched on YouTube</SectionTitle>
            {renderGrid(asFeed(sections.watched), columns, { feedOpensInExplorer: true })}
          </section>
        ) : null}

        {own.length > 0 ? (
          <section>
            <SectionTitle>In your library</SectionTitle>
            {renderGrid(own.map((file) => ({ kind: "file", file })), columns)}
          </section>
        ) : null}
      </div>
    </div>
  );
}
