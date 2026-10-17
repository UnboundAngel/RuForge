import { create } from "zustand";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { CreatorTab } from "./creatorSections";

export type CreatorRef = { channelId: string; channel: string };

export type CreatorTabCounts = Partial<Record<CreatorTab, number>>;

/**
 * The title bar strip renders these tabs while a creator is open, so the page owns no second tab row.
 * A tag page (`tagId`) shares this store so only one library page is open at a time.
 */
export const useCreatorPage = create<{
  creator: CreatorRef | null;
  tagId: string | null;
  tab: CreatorTab;
  tabs: CreatorTab[];
  counts: CreatorTabCounts;
}>(() => ({ creator: null, tagId: null, tab: "home", tabs: ["home", "videos"], counts: {} }));

export function openCreatorPage(channelId: string, channel: string): void {
  // Creator pages live in the video library; a channel link on a game page has to leave Games to show one.
  const app = useRuforgeStore.getState();
  if (app.activeTab === "games") app.setActiveTab("media");
  const current = useCreatorPage.getState().creator;
  if (current?.channelId === channelId) return;
  useCreatorPage.setState({
    creator: { channelId, channel: channel.trim() },
    tagId: null,
    tab: "home",
    tabs: ["home", "videos"],
    counts: {},
  });
}

export function closeCreatorPage(): void {
  if (useCreatorPage.getState().creator) useCreatorPage.setState({ creator: null });
}

export function openTagPage(tagId: string): void {
  if (useCreatorPage.getState().tagId === tagId) return;
  useCreatorPage.setState({ tagId, creator: null });
}

/** Back to the library home from a creator or tag page. */
export function closeLibraryPage(): void {
  const s = useCreatorPage.getState();
  if (s.creator || s.tagId) useCreatorPage.setState({ creator: null, tagId: null });
}

export function setCreatorTab(tab: CreatorTab): void {
  useCreatorPage.setState({ tab });
}

export function publishCreatorTabs(tabs: CreatorTab[], counts: CreatorTabCounts): void {
  const s = useCreatorPage.getState();
  const same =
    s.tabs.length === tabs.length &&
    s.tabs.every((t, i) => t === tabs[i]) &&
    tabs.every((t) => s.counts[t] === counts[t]);
  if (!same) useCreatorPage.setState({ tabs, counts });
}

export const CREATOR_TAB_LABELS: Record<CreatorTab, string> = {
  home: "Home",
  videos: "Videos",
  downloaded: "Downloaded",
  playlists: "Playlists",
};
