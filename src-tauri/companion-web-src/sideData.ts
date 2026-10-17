import type { ProgressPayload, SidecarResponse } from "./types";

type LocalProgress = { id: string; payload: ProgressPayload; at: number; pending: boolean };

const DB_NAME = "rf_companion_side";
const SIDECAR = "sidecar";
const PROGRESS = "progress";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SIDECAR);
      req.result.createObjectStore(PROGRESS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function writeSidecar(id: string, sidecar: SidecarResponse): Promise<void> {
  try {
    await run(SIDECAR, "readwrite", (s) => s.put(sidecar, id));
  } catch {}
}

export async function readSidecar(id: string): Promise<SidecarResponse | null> {
  try {
    return (await run<SidecarResponse | undefined>(SIDECAR, "readonly", (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

/** Local write on every flush; `pending` stays true until the PC has accepted it. */
export async function recordProgress(id: string, payload: ProgressPayload, pending: boolean): Promise<void> {
  try {
    const row: LocalProgress = { id, payload, at: Date.now(), pending };
    await run(PROGRESS, "readwrite", (s) => s.put(row));
  } catch {}
}

export async function readLocalProgress(id: string): Promise<LocalProgress | null> {
  try {
    return (await run<LocalProgress | undefined>(PROGRESS, "readonly", (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

/** Last write wins per id: a row is only replaced by a newer one, so the queue holds one entry per item. */
export async function flushProgressQueue(post: (id: string, p: ProgressPayload) => Promise<boolean>): Promise<void> {
  let rows: LocalProgress[] = [];
  try {
    rows = await run<LocalProgress[]>(PROGRESS, "readonly", (s) => s.getAll());
  } catch {
    return;
  }
  for (const row of rows.filter((r) => r.pending)) {
    if (!(await post(row.id, row.payload))) return;
    const current = await readLocalProgress(row.id);
    // A newer local write may have landed while posting; it stays pending.
    if (current && current.at === row.at) await recordProgress(row.id, row.payload, false);
  }
}

/** Resume point: a still-pending local write is newer than anything the PC knows. */
export function pickResume(
  local: LocalProgress | null,
  remote: { positionSecs: number; durationSecs?: number } | null,
): { positionSecs: number; durationSecs?: number } | null {
  if (local?.pending || !remote) return local ? local.payload : remote;
  return remote;
}

export async function clearSideData(): Promise<void> {
  try {
    await run(SIDECAR, "readwrite", (s) => s.clear());
    await run(PROGRESS, "readwrite", (s) => s.clear());
  } catch {}
}
