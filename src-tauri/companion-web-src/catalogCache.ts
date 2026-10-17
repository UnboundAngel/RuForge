import type { CompanionItem } from "./types";

export type CachedCatalog = {
  items: CompanionItem[];
  /** Server ETag, sent back as If-None-Match so a warm revalidate is a 304. */
  etag: string | null;
  /** Kept so a 304 still knows whether the PC was mid-scan. */
  refreshing: boolean;
  fetchedAt: number;
};

const DB_NAME = "rf_companion_catalog";
const STORE = "catalog";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function readCatalog(): Promise<CachedCatalog | null> {
  try {
    const hit = await run<CachedCatalog | undefined>("readonly", (s) => s.get(KEY));
    return hit && Array.isArray(hit.items) ? hit : null;
  } catch {
    return null;
  }
}

export async function writeCatalog(catalog: CachedCatalog): Promise<void> {
  try {
    await run("readwrite", (s) => s.put(catalog, KEY));
  } catch {}
}

/** Keeps the items and only moves the timestamp, for a 304 revalidate. */
export async function touchCatalog(fetchedAt: number): Promise<void> {
  const hit = await readCatalog();
  if (hit) await writeCatalog({ ...hit, fetchedAt });
}

export async function clearCatalog(): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(KEY));
  } catch {}
}
