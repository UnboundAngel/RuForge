import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type ChannelProfile = {
  title: string | null;
  handle: string | null;
  subscribers: string | null;
  videoCount: string | null;
  bannerUrl: string | null;
  avatarUrl: string | null;
  verified: boolean;
};

const requests = new Map<string, Promise<ChannelProfile | null>>();

function channelProfile(channelId: string): Promise<ChannelProfile | null> {
  let request = requests.get(channelId);
  if (!request) {
    request = invoke<ChannelProfile | null>("get_channel_profile", { channelId }).catch(() => null);
    requests.set(channelId, request);
  }
  return request;
}

/** `undefined` while loading, `null` when the channel page gave nothing usable. */
export function useChannelProfile(channelId: string): ChannelProfile | null | undefined {
  const [profile, setProfile] = useState<ChannelProfile | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setProfile(undefined);
    void channelProfile(channelId).then((p) => {
      if (live) setProfile(p);
    });
    return () => {
      live = false;
    };
  }, [channelId]);
  return profile;
}
