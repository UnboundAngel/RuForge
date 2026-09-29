import { openUrlInExplorer } from "@/watchlist/watchlistActions";

export function channelPageUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}`;
}

export function openChannelInExplorer(channelId: string): void {
  void openUrlInExplorer(channelPageUrl(channelId));
}
