import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { MediaFile, PlaylistCollection } from "@/types";
import { watchedFromChannel } from "./channelShelf";
import { CreatorHeader } from "./CreatorHeader";
import { asFeed, asFiles, CreatorHome } from "./CreatorHome";
import { type CreatorRef, closeCreatorPage } from "./creatorPageStore";
import { type CreatorTab, creatorFiles, creatorPlaylists, creatorSections, creatorTabs } from "./creatorSections";
import { CreatorTabs } from "./CreatorTabs";
import { CreatorUploadsState } from "./CreatorUploadsState";
import { useChannelProfile } from "./useChannelProfile";
import { useChannelVideos } from "./useChannelVideos";
import type { MixedGridItem } from "./youtubeFeed";

export type CreatorGridRenderer = (
  items: MixedGridItem<MediaFile>[],
  cols?: number,
  opts?: { feedOpensInExplorer?: boolean; shelf?: boolean },
) => ReactNode;

export type CreatorPlaylistRenderer = (playlists: PlaylistCollection[], opts?: { shelf?: boolean }) => ReactNode;

/** Loose downloads plus playlist items, once each: the creator page counts everything you own. */
function ownedFiles(files: MediaFile[], playlists: PlaylistCollection[]): MediaFile[] {
  const seen = new Set<string>();
  const out: MediaFile[] = [];
  for (const file of [...files, ...playlists.flatMap((p) => p.items)]) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    out.push(file);
  }
  return out;
}

/** A creator inside RuForge: their uploads play in Explorer, their downloads play here. */
export function CreatorPage({
  creator,
  files,
  playlists,
  libraryIds,
  columns,
  gridClass,
  renderGrid,
  renderPlaylists,
}: {
  creator: CreatorRef;
  files: MediaFile[];
  playlists: PlaylistCollection[];
  libraryIds: ReadonlySet<string>;
  columns: number;
  gridClass: string;
  renderGrid: CreatorGridRenderer;
  renderPlaylists: CreatorPlaylistRenderer;
}) {
  const { channelId, channel } = creator;
  const profile = useChannelProfile(channelId);
  const { byChannel, status, history } = useChannelVideos([channelId], true);
  const state = status[channelId] ?? "loading";
  const recent = byChannel[channelId] ?? [];
  const own = useMemo(
    () => creatorFiles(ownedFiles(files, playlists), channelId, channel),
    [files, playlists, channelId, channel],
  );
  const theirPlaylists = useMemo(() => creatorPlaylists(playlists, channelId, channel), [playlists, channelId, channel]);
  const sections = useMemo(
    () => creatorSections(recent, watchedFromChannel(history, channelId, channel), libraryIds),
    [recent, history, channelId, channel, libraryIds],
  );
  const tabs = creatorTabs({ downloaded: own.length, playlists: theirPlaylists.length });
  const [picked, setPicked] = useState<CreatorTab>("home");
  const tab = tabs.includes(picked) ? picked : "home";

  const panel =
    tab === "videos" ? (
      <CreatorUploadsState channelId={channelId} status={state} count={sections.uploads.length} columns={columns} gridClass={gridClass}>
        {renderGrid(asFeed(sections.uploads), columns, { feedOpensInExplorer: true })}
      </CreatorUploadsState>
    ) : tab === "downloaded" ? (
      renderGrid(asFiles(own), columns)
    ) : tab === "playlists" ? (
      renderPlaylists(theirPlaylists)
    ) : (
      <CreatorHome
        channelId={channelId}
        own={own}
        playlists={theirPlaylists}
        sections={sections}
        status={state}
        columns={columns}
        gridClass={gridClass}
        renderGrid={renderGrid}
        renderPlaylists={renderPlaylists}
      />
    );

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

      <CreatorHeader channelId={channelId} channel={channel} profile={profile} downloaded={own.length} />

      <div className="mb-10">
        <CreatorTabs tabs={tabs} active={tab} onChange={setPicked} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {panel}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
