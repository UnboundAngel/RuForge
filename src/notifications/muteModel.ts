import type { NotificationItem, NotificationKind, NotificationMuteKey } from "./types";

export const NOTIFICATION_MUTE_OPTIONS: readonly { key: NotificationMuteKey; label: string; description: string }[] = [
  { key: "uploads", label: "Channel uploads", description: "New videos, premieres and live streams from followed channels." },
  { key: "downloads", label: "Finished downloads", description: "A download completed and the file is ready." },
  { key: "problems", label: "Download problems", description: "Failures, timeouts and downloads held for storage." },
  { key: "milestones", label: "Milestones", description: "Quiet achievements from your activity stats." },
  { key: "security", label: "Security notices", description: "Blocked navigation and probing from web pages." },
];

const MUTE_KEYS: ReadonlySet<string> = new Set(NOTIFICATION_MUTE_OPTIONS.map((o) => o.key));

const KIND_TO_MUTE: Record<NotificationKind, NotificationMuteKey> = {
  upload: "uploads",
  premiere: "uploads",
  live: "uploads",
  "download-finished": "downloads",
  "download-failed": "problems",
  "download-timed-out": "problems",
  "download-blocked": "problems",
  "security-blocked": "security",
  "stats-milestone": "milestones",
};

export function muteKeyForKind(kind: NotificationKind): NotificationMuteKey {
  return KIND_TO_MUTE[kind];
}

export function muteLabel(key: NotificationMuteKey): string {
  return NOTIFICATION_MUTE_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

/** Drops anything a hand-edited settings file or a forged overlay action put in the list. */
export function normalizeMutedList(value: unknown): NotificationMuteKey[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<NotificationMuteKey>();
  for (const v of value) if (typeof v === "string" && MUTE_KEYS.has(v)) seen.add(v as NotificationMuteKey);
  return [...seen];
}

export function isKindMuted(kind: NotificationKind, muted: readonly NotificationMuteKey[]): boolean {
  return muted.includes(KIND_TO_MUTE[kind]);
}

export function filterMuted(items: NotificationItem[], muted: readonly NotificationMuteKey[]): NotificationItem[] {
  return muted.length === 0 ? items : items.filter((i) => !isKindMuted(i.kind, muted));
}
