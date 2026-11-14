import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { upsertLocal } from "@/notifications/notificationCenterStore";
import { pollActions } from "@/notifications/devActions";
import { startDevVotes } from "@/notifications/devVotes";
import type { NotificationItem } from "@/notifications/types";

const EVENT = "dev-announcements";
const SEEN_KEY = "ruforge-dev-announcements-seen-v1";

/** Rust has verified the signature and every field; this only shapes what it hands over. */
type DevAnnouncement = {
  id: string;
  kind: "notice" | "poll";
  title: string;
  body: string;
  published: string;
  ends: string | null;
  link: string | null;
  options?: { id: string; label: string }[] | null;
};

function loadSeen(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* quota: the item may record again next launch, which only costs a duplicate row */
  }
}

function dayMs(date: string, endOfDay: boolean): number {
  return Date.parse(`${date}T${endOfDay ? "23:59:59" : "12:00:00"}`);
}

/** Pure so the row shape is testable without Tauri. */
export function announcementToItem(a: DevAnnouncement, now: number): NotificationItem {
  const poll = a.kind === "poll";
  const endsAt = a.ends ? dayMs(a.ends, true) : null;
  const options = a.options ?? [];
  const actions: NotificationItem["actions"] = poll ? pollActions(options, endsAt, now) : a.link ? ["open-link"] : [];
  return {
    id: `dev:${a.id}`,
    source: "dev",
    kind: poll ? "dev-poll" : "dev-notice",
    title: a.title,
    subtitle: a.body,
    thumbnail: null,
    channelId: null,
    createdAt: Math.min(dayMs(a.published, false), now),
    read: false,
    actions,
    ref: { devUrl: a.link ?? undefined, endsAt, devOptions: poll ? options : undefined },
  };
}

async function pull(): Promise<void> {
  try {
    const list = await invoke<DevAnnouncement[]>("announcements_get");
    const seen = loadSeen();
    const fresh = list.filter((a) => !seen.has(a.id));
    if (fresh.length === 0) return;
    const now = Date.now();
    // Mark seen before recording: a read or pruned row must never return as unread on the next fetch.
    for (const a of fresh) seen.add(a.id);
    saveSeen(seen);
    for (const a of fresh) upsertLocal(announcementToItem(a, now));
  } catch (e) {
    console.warn("[devAnnouncements] pull failed", e);
  }
}

/** Main window only: empty ping from Rust after a verified fetch, then pull through the command. */
export async function startDevAnnouncementHost(): Promise<() => void> {
  void pull();
  const stopVotes = startDevVotes();
  const unlisten = await listen(EVENT, () => void pull());
  return () => {
    stopVotes();
    unlisten();
  };
}
