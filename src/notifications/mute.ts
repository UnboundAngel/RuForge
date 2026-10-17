import { useRuforgeStore } from "@/store/ruforgeStore";
import { normalizeMutedList, NOTIFICATION_MUTE_OPTIONS } from "./muteModel";
import type { NotificationMuteKey } from "./types";

export function currentMuted(): NotificationMuteKey[] {
  return useRuforgeStore.getState().settings.notificationMuted ?? [];
}

/** For toast and island call sites; the feed filters the same list in `selectors.ts`. */
export function isMuted(key: NotificationMuteKey): boolean {
  return currentMuted().includes(key);
}

export function setNotificationMuted(key: NotificationMuteKey, muted: boolean): void {
  if (!NOTIFICATION_MUTE_OPTIONS.some((o) => o.key === key)) return;
  const next = normalizeMutedList(muted ? [...currentMuted(), key] : currentMuted().filter((k) => k !== key));
  void useRuforgeStore.getState().updateSetting("notificationMuted", next);
}
