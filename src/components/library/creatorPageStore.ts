import { create } from "zustand";
import type { CreatorTab } from "./creatorSections";

export type CreatorRef = { channelId: string; channel: string };

export type CreatorTabCounts = Partial<Record<CreatorTab, number>>;

/** The title bar strip renders these tabs while a creator is open, so the page owns no second tab row. */
export const useCreatorPage = create<{
  creator: CreatorRef | null;
  tab: CreatorTab;
  tabs: CreatorTab[];
  counts: CreatorTabCounts;
}>(() => ({ creator: null, tab: "home", tabs: ["home", "videos"], counts: {} }));

export function openCreatorPage(channelId: string, channel: string): void {
  const current = useCreatorPage.getState().creator;
  if (current?.channelId === channelId) return;
  useCreatorPage.setState({
    creator: { channelId, channel: channel.trim() },
    tab: "home",
    tabs: ["home", "videos"],
    counts: {},
  });
}

export function closeCreatorPage(): void {
  if (useCreatorPage.getState().creator) useCreatorPage.setState({ creator: null });
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
