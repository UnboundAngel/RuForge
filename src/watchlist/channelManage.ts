import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { ChannelsUiState } from "./types";
import { followChannel, resolveChannel, setAutoDownload, unfollowChannel } from "./watchlistActions";
import { useWatchlistStore } from "./watchlistStore";

/** Matches Rust's MANUAL_REFRESH_COOLDOWN_SECS; Rust ignores calls inside it silently. */
export const CHECK_NOW_COOLDOWN_MS = 120_000;
const FALLBACK_FOLLOW_ERROR = "Could not find that channel.";

export const useChannelsUiStore = create<ChannelsUiState>(() => ({
  followPending: false,
  followMessage: null,
  followSeq: 0,
  checkNowUntil: 0,
}));

export function errorText(e: unknown, fallback: string): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e instanceof Error && e.message.trim()) return e.message;
  return fallback;
}

export function isFollowing(channelId: string): boolean {
  return !!useWatchlistStore.getState().snapshot?.channels.some((c) => c.channelId === channelId);
}

export async function followFromPanel(input: string): Promise<void> {
  const trimmed = input.trim();
  if (!trimmed || useChannelsUiStore.getState().followPending) return;
  useChannelsUiStore.setState({ followPending: true, followMessage: null });
  try {
    const ch = await resolveChannel(trimmed);
    if (isFollowing(ch.channelId)) {
      useChannelsUiStore.setState((s) => ({
        followMessage: { tone: "info", text: `Already following ${ch.title}.` },
        followSeq: s.followSeq + 1,
      }));
      return;
    }
    await followChannel(ch);
    useChannelsUiStore.setState((s) => ({
      followMessage: { tone: "info", text: `Following ${ch.title}.` },
      followSeq: s.followSeq + 1,
    }));
  } catch (e) {
    useChannelsUiStore.setState({ followMessage: { tone: "error", text: errorText(e, FALLBACK_FOLLOW_ERROR) } });
  } finally {
    useChannelsUiStore.setState({ followPending: false });
  }
}

export function clearChannelFollowMessage(): void {
  if (useChannelsUiStore.getState().followMessage) useChannelsUiStore.setState({ followMessage: null });
}

export function setChannelAutoDownload(channelId: string, enabled: boolean): void {
  if (!isFollowing(channelId)) return;
  void setAutoDownload(channelId, enabled).catch((e) => console.error("set_channel_auto_download failed", e));
}

export function unfollowFromPanel(channelId: string): void {
  if (!isFollowing(channelId)) return;
  void unfollowChannel(channelId).catch((e) => console.error("unfollow_channel failed", e));
}

export async function checkChannelsNow(now = Date.now()): Promise<void> {
  if (now < useChannelsUiStore.getState().checkNowUntil) return;
  useChannelsUiStore.setState({ checkNowUntil: now + CHECK_NOW_COOLDOWN_MS });
  try {
    await invoke("refresh_watchlist_now");
  } catch (e) {
    console.error("refresh_watchlist_now failed", e);
    useChannelsUiStore.setState({ checkNowUntil: 0 });
  }
}
