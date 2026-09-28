import { convertFileSrc } from "@tauri-apps/api/core";
import { channelAvatarPath } from "@/components/library/VideoByline";

/** The island webview has no fetch path of its own, so main resolves avatars and pushes the src. */
const resolved = new Map<string, string | null>();
const listeners = new Set<() => void>();

export function islandAvatarSrc(channelId: string): string | null {
  if (resolved.has(channelId)) return resolved.get(channelId) ?? null;
  resolved.set(channelId, null);
  void channelAvatarPath(channelId).then((path) => {
    if (!path) return;
    resolved.set(channelId, convertFileSrc(path));
    for (const fn of listeners) fn();
  });
  return null;
}

export function subscribeIslandAvatars(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
