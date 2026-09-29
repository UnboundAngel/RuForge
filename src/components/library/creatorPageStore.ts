import { create } from "zustand";

export type CreatorRef = { channelId: string; channel: string };

export const useCreatorPage = create<{ creator: CreatorRef | null }>(() => ({ creator: null }));

export function openCreatorPage(channelId: string, channel: string): void {
  const current = useCreatorPage.getState().creator;
  if (current?.channelId === channelId) return;
  useCreatorPage.setState({ creator: { channelId, channel: channel.trim() } });
}

export function closeCreatorPage(): void {
  if (useCreatorPage.getState().creator) useCreatorPage.setState({ creator: null });
}
