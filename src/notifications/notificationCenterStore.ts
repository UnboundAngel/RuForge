import { create } from "zustand";
import type { NotificationCenterFilter, NotificationCenterTab, NotificationItem } from "./types";

export const NOTIFICATION_CENTER_STORAGE_KEY = "ruforge-notification-center-v1";
export const LOCAL_ITEMS_CAP = 150;
export const READ_ITEM_MAX_AGE_MS = 30 * 86_400_000;
const SAVE_DEBOUNCE_MS = 300;

type NotificationCenterState = {
  /** Records owned by the center (download source today). Watchlist items live in Rust. */
  local: NotificationItem[];
  popoverOpen: boolean;
  tab: NotificationCenterTab;
  filter: NotificationCenterFilter;
  /** Overlay webview unavailable: the in-page popover needs the Explorer hidden, without the leave pause. */
  explorerCoveredByPopover: boolean;
  /** Video ids whose download was refused for storage this session. Never persisted. */
  storageHeldVideoIds: ReadonlySet<string>;
};

export const useNotificationCenterStore = create<NotificationCenterState>(() => ({
  local: [],
  popoverOpen: false,
  tab: "feed",
  filter: "all",
  explorerCoveredByPopover: false,
  storageHeldVideoIds: new Set(),
}));

export function markStorageHeld(videoId: string): void {
  const held = useNotificationCenterStore.getState().storageHeldVideoIds;
  if (held.has(videoId)) return;
  useNotificationCenterStore.setState({ storageHeldVideoIds: new Set([...held, videoId]) });
}

export function upsertItem(list: NotificationItem[], item: NotificationItem): NotificationItem[] {
  return [{ ...item, read: false }, ...list.filter((i) => i.id !== item.id)];
}

export function markItemsRead(list: NotificationItem[], ids: string[]): NotificationItem[] {
  const set = new Set(ids);
  if (!list.some((i) => !i.read && set.has(i.id))) return list;
  return list.map((i) => (!i.read && set.has(i.id) ? { ...i, read: true } : i));
}

export function markAllItemsRead(list: NotificationItem[]): NotificationItem[] {
  if (!list.some((i) => !i.read)) return list;
  return list.map((i) => (i.read ? i : { ...i, read: true }));
}

/** Old read items go first; past the cap the oldest go regardless of read state. */
export function pruneItems(list: NotificationItem[], now: number): NotificationItem[] {
  const kept = list
    .filter((i) => !i.read || now - i.createdAt <= READ_ITEM_MAX_AGE_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, LOCAL_ITEMS_CAP);
  const unchanged = kept.length === list.length && kept.every((i, idx) => i === list[idx]);
  return unchanged ? list : kept;
}

export function parseStoredItems(raw: string | null): NotificationItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items.filter(
      (i): i is NotificationItem =>
        !!i &&
        typeof i === "object" &&
        typeof (i as NotificationItem).id === "string" &&
        typeof (i as NotificationItem).createdAt === "number" &&
        Array.isArray((i as NotificationItem).actions),
    );
  } catch {
    return [];
  }
}

export function upsertLocal(item: NotificationItem): void {
  useNotificationCenterStore.setState((s) => ({
    local: pruneItems(upsertItem(s.local, item), Date.now()),
  }));
}

export function markLocalRead(ids: string[]): void {
  useNotificationCenterStore.setState((s) => ({ local: markItemsRead(s.local, ids) }));
}

export function markAllLocalRead(): void {
  useNotificationCenterStore.setState((s) => ({ local: markAllItemsRead(s.local) }));
}

export function pruneLocal(now: number): void {
  useNotificationCenterStore.setState((s) => ({ local: pruneItems(s.local, now) }));
}

export function setNotificationPopoverOpen(open: boolean): void {
  useNotificationCenterStore.setState({ popoverOpen: open });
}

export function setExplorerCoveredByPopover(covered: boolean): void {
  if (useNotificationCenterStore.getState().explorerCoveredByPopover === covered) return;
  useNotificationCenterStore.setState({ explorerCoveredByPopover: covered });
}

export function setNotificationTab(tab: NotificationCenterTab): void {
  useNotificationCenterStore.setState({ tab });
}

export function setNotificationFilter(filter: NotificationCenterFilter): void {
  useNotificationCenterStore.setState({ filter });
}

/** Items recorded before the load finished win over their stored copies. */
export function loadLocal(): void {
  let stored: NotificationItem[] = [];
  try {
    stored = parseStoredItems(localStorage.getItem(NOTIFICATION_CENTER_STORAGE_KEY));
  } catch {
    return;
  }
  useNotificationCenterStore.setState((s) => {
    const ids = new Set(s.local.map((i) => i.id));
    return { local: [...s.local, ...stored.filter((i) => !ids.has(i.id))] };
  });
}

function writeLocal(items: NotificationItem[]): void {
  try {
    localStorage.setItem(NOTIFICATION_CENTER_STORAGE_KEY, JSON.stringify({ items }));
  } catch {
    /* quota or private mode: the feed still works for this session */
  }
}

/** Main only: other windows share localStorage and must never write this key. */
export function startLocalPersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
    writeLocal(useNotificationCenterStore.getState().local);
  };
  const unsubscribe = useNotificationCenterStore.subscribe((s, prev) => {
    if (s.local === prev.local) return;
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      writeLocal(useNotificationCenterStore.getState().local);
    }, SAVE_DEBOUNCE_MS);
  });
  window.addEventListener("beforeunload", flush);
  return () => {
    unsubscribe();
    window.removeEventListener("beforeunload", flush);
    flush();
  };
}
