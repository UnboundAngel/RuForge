import { fetchStreamToken } from "./api";
import { cacheSprites, dropSprites } from "./offlineSprites";
import { readSettings } from "./settings";
import type { CompanionItem } from "./types";

export type OfflineEntry = CompanionItem & { savedAt: number; byteSize: number };

type Backend = "opfs" | "cache";
type Record_ = { id: string; item: CompanionItem; savedAt: number; byteSize: number; backend: Backend };

const DB_NAME = "rf_companion_offline";
const STORE = "entries";
const DIR = "rf-offline";
const CACHE = "rf-offline-media";

const listeners = new Set<() => void>();
let persistAsked = false;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const getRecord = (id: string) => tx<Record_ | undefined>("readonly", (s) => s.get(id));
const getAll = () => tx<Record_[]>("readonly", (s) => s.getAll());
const putRecord = (r: Record_) => tx("readwrite", (s) => s.put(r));
const delRecord = (id: string) => tx("readwrite", (s) => s.delete(id));

// Safari before 26 has OPFS but no main-thread createWritable, so probe for it.
function opfsUsable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    "createWritable" in FileSystemFileHandle.prototype
  );
}

async function opfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

const fileName = (id: string) => encodeURIComponent(id);
const cacheKey = (id: string) => `/__offline/${encodeURIComponent(id)}`;

async function removeBlob(id: string, backend: Backend) {
  try {
    if (backend === "opfs") {
      await (await opfsDir()).removeEntry(fileName(id));
    } else {
      await (await caches.open(CACHE)).delete(cacheKey(id));
    }
  } catch {}
}

export async function isOffline(id: string): Promise<boolean> {
  try {
    return !!(await getRecord(id));
  } catch {
    return false;
  }
}

export async function listOffline(): Promise<OfflineEntry[]> {
  try {
    const all = await getAll();
    return all
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((r) => ({ ...r.item, savedAt: r.savedAt, byteSize: r.byteSize }));
  } catch {
    return [];
  }
}

export async function offlineUsageBytes(): Promise<number> {
  try {
    return (await getAll()).reduce((n, r) => n + r.byteSize, 0);
  } catch {
    return 0;
  }
}

export async function removeOffline(id: string): Promise<void> {
  try {
    const rec = await getRecord(id);
    if (rec) await removeBlob(id, rec.backend);
    await delRecord(id);
    await dropSprites(id);
  } catch {}
  notify();
}

export async function offlineUrl(id: string): Promise<string | null> {
  try {
    const rec = await getRecord(id);
    if (!rec) return null;
    if (rec.backend === "opfs") {
      const handle = await (await opfsDir()).getFileHandle(fileName(id));
      return URL.createObjectURL(await handle.getFile());
    }
    const hit = await (await caches.open(CACHE)).match(cacheKey(id));
    return hit ? URL.createObjectURL(await hit.blob()) : null;
  } catch {
    return null;
  }
}

async function evictToLimit(keepId: string) {
  const capBytes = readSettings().storageLimitMb * 1024 * 1024;
  const all = (await getAll()).sort((a, b) => a.savedAt - b.savedAt);
  let total = all.reduce((n, r) => n + r.byteSize, 0);
  for (const r of all) {
    if (total <= capBytes) break;
    if (r.id === keepId) continue;
    await removeBlob(r.id, r.backend);
    await delRecord(r.id);
    total -= r.byteSize;
  }
}

export type SaveResult = "ok" | "cancelled" | "failed" | "nospace";

/** Headroom so a save never fills the quota to the last byte. */
const SPACE_MARGIN = 50 * 1024 * 1024;

async function hasRoomFor(bytes: number): Promise<boolean> {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (!quota) return true;
    return quota - (usage ?? 0) >= bytes + SPACE_MARGIN;
  } catch {
    return true;
  }
}

async function partialSize(id: string): Promise<number> {
  try {
    return (await (await (await opfsDir()).getFileHandle(fileName(id))).getFile()).size;
  } catch {
    return 0;
  }
}

/** Drops a half-written download that will not be resumed. */
export async function discardPartial(id: string): Promise<void> {
  if (await getRecord(id).catch(() => undefined)) return;
  await removeBlob(id, "opfs");
  await removeBlob(id, "cache");
}

/** A tab killed mid-download leaves a file with no record; nothing resumes it after a relaunch. */
async function sweepOrphans(): Promise<void> {
  try {
    const known = new Set((await getAll()).map((r) => r.id));
    if (opfsUsable()) {
      const dir = await opfsDir();
      const stale: string[] = [];
      for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
        if (!known.has(decodeURIComponent(name))) stale.push(name);
      }
      for (const name of stale) await dir.removeEntry(name).catch(() => {});
    }
    if (typeof caches !== "undefined") {
      const cache = await caches.open(CACHE);
      for (const req of await cache.keys()) {
        const id = decodeURIComponent(new URL(req.url).pathname.replace("/__offline/", ""));
        if (!known.has(id)) await cache.delete(req);
      }
    }
  } catch {}
}

const swept = sweepOrphans();

export async function saveOffline(
  item: CompanionItem,
  onProgress?: (frac: number) => void,
  signal?: AbortSignal,
): Promise<SaveResult> {
  const backend: Backend = opfsUsable() ? "opfs" : "cache";
  try {
    if (!persistAsked) {
      persistAsked = true;
      void navigator.storage?.persist?.();
    }
    await swept;
    const url = await fetchStreamToken(item.id);
    if (signal?.aborted) return "cancelled";
    if (!url) return "failed";

    // A failed attempt keeps its bytes so the retry asks only for the rest.
    let offset = backend === "opfs" ? await partialSize(item.id) : 0;
    let res = await fetch(url, {
      credentials: "same-origin",
      signal,
      headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
    });
    if (res.status === 416) {
      await removeBlob(item.id, backend);
      offset = 0;
      res = await fetch(url, { credentials: "same-origin", signal });
    }
    if (!res.ok || !res.body) return "failed";
    if (res.status !== 206) offset = 0;

    const remaining = Number(res.headers.get("content-length")) || 0;
    const total = remaining > 0 ? offset + remaining : 0;
    if (remaining > 0 && !(await hasRoomFor(remaining))) {
      await res.body.cancel().catch(() => {});
      await removeBlob(item.id, backend);
      return "nospace";
    }
    let received = offset;
    const reader = res.body.getReader();
    const report = () => {
      if (total > 0) onProgress?.(Math.min(1, received / total));
    };
    report();

    if (backend === "opfs") {
      const handle = await (await opfsDir()).getFileHandle(fileName(item.id), { create: true });
      const writable = await handle.createWritable({ keepExistingData: offset > 0 });
      if (offset > 0) await writable.seek(offset);
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
          received += value.byteLength;
          report();
        }
        await writable.close();
      } catch (e) {
        // Closing commits what was written; abort would throw the partial away.
        if (signal?.aborted) await writable.abort().catch(() => {});
        else await writable.close().catch(() => {});
        throw e;
      }
    } else {
      const counted = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          received += value.byteLength;
          report();
          controller.enqueue(value);
        },
        cancel: (reason) => reader.cancel(reason),
      });
      await (await caches.open(CACHE)).put(
        cacheKey(item.id),
        new Response(counted, {
          headers: { "Content-Type": res.headers.get("content-type") ?? "application/octet-stream" },
        }),
      );
    }

    if (received === 0) throw new Error("empty");
    onProgress?.(1);
    await putRecord({ id: item.id, item, savedAt: Date.now(), byteSize: received, backend });
    await evictToLimit(item.id);
    notify();
    if (item.mediaType === "video") void cacheSprites(item.id);
    return "ok";
  } catch {
    if (signal?.aborted) {
      await removeBlob(item.id, backend);
      return "cancelled";
    }
    if (backend === "cache") await removeBlob(item.id, backend);
    return "failed";
  }
}
