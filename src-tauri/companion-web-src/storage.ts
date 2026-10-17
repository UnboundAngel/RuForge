import { clearCatalog } from "./catalogCache";
import { listOffline, offlineUsageBytes, removeOffline } from "./offline";
import { clearSideData } from "./sideData";

const ART = "rf-art";

export type StorageUsage = { savedBytes: number; savedCount: number; artBytes: number; artCount: number };

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export async function readUsage(): Promise<StorageUsage> {
  let artBytes = 0;
  let artCount = 0;
  try {
    const cache = await caches.open(ART);
    for (const req of await cache.keys()) {
      if (!new URL(req.url).pathname.startsWith("/art/")) continue;
      artCount++;
      artBytes += Number((await cache.match(req))?.headers.get("content-length")) || 0;
    }
  } catch {}
  const saved = await listOffline().catch(() => []);
  return { savedBytes: await offlineUsageBytes().catch(() => 0), savedCount: saved.length, artBytes, artCount };
}

export async function clearArtCache(): Promise<void> {
  try {
    await caches.delete(ART);
  } catch {}
}

export async function removeAllSaved(): Promise<void> {
  for (const e of await listOffline().catch(() => [])) await removeOffline(e.id);
}

/** Unpair or revoke: saved songs stay, everything cached from the PC goes. */
export async function wipeCachedData(): Promise<void> {
  await Promise.all([clearCatalog(), clearSideData(), clearArtCache()]);
  navigator.serviceWorker?.controller?.postMessage({ type: "art-clear" });
}

export function ago(at: number, now = Date.now()): string {
  const mins = Math.floor((now - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export function askPersistentStorage() {
  try {
    void navigator.storage?.persist?.();
  } catch {}
}
