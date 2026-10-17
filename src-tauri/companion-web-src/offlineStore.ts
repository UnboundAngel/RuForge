import { useSyncExternalStore } from "react";
import { discardPartial, listOffline, removeOffline, saveOffline, subscribe } from "./offline";
import { requestIntro } from "./intro";
import type { CompanionItem } from "./types";

type Snapshot = {
  saved: ReadonlySet<string>;
  /** Items downloading now, with 0 to 1 progress. */
  progress: ReadonlyMap<string, number>;
  /** Items waiting for a free slot. */
  queued: ReadonlySet<string>;
  failed: ReadonlyMap<string, CompanionItem>;
  /** Everything not yet finished, for the title of the downloads chip. */
  pending: number;
};

type Job = {
  item: CompanionItem;
  ctrl: AbortController | null;
  frac: number;
  done: (ok: boolean) => void;
};

// Two at a time keeps a phone radio busy without starving the song that is playing.
const MAX_ACTIVE = 2;
const PROGRESS_EMIT_MS = 120;

let snap: Snapshot = { saved: new Set(), progress: new Map(), queued: new Set(), failed: new Map(), pending: 0 };
const listeners = new Set<() => void>();
const jobs = new Map<string, Job>();
const failed = new Map<string, CompanionItem>();
let active = 0;
let emitTimer = 0;

function emit(saved: ReadonlySet<string> = snap.saved) {
  window.clearTimeout(emitTimer);
  emitTimer = 0;
  const progress = new Map<string, number>();
  const queued = new Set<string>();
  for (const [id, job] of jobs) {
    if (job.ctrl) progress.set(id, job.frac);
    else queued.add(id);
  }
  snap = { saved, progress, queued, failed: new Map(failed), pending: jobs.size };
  listeners.forEach((fn) => fn());
}

/** Per-chunk progress would re-render every row on screen; fold it into a few updates a second. */
function emitSoon() {
  if (emitTimer) return;
  emitTimer = window.setTimeout(() => emit(), PROGRESS_EMIT_MS);
}

async function refresh() {
  const all = await listOffline();
  emit(new Set(all.map((e) => e.id)));
}

subscribe(() => void refresh());
void refresh();

export function useOfflineState(): Snapshot {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => snap,
  );
}

export function isSaving(id: string): boolean {
  return jobs.has(id);
}

export function isSaved(id: string): boolean {
  return snap.saved.has(id);
}

const QUEUE_KEY = "rf_companion_save_queue";
let reachable = true;
const noticeListeners = new Set<(message: string) => void>();

export function setReachable(value: boolean) {
  reachable = value;
}

export function onNotice(fn: (message: string) => void): () => void {
  noticeListeners.add(fn);
  return () => {
    noticeListeners.delete(fn);
  };
}

const notice = (message: string) => noticeListeners.forEach((fn) => fn(message));

function readQueue(): CompanionItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: CompanionItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {}
}

/** Saves asked for while the PC was out of reach. They run only while the app is open; iOS gives no background time. */
export async function runSaveQueue(): Promise<void> {
  const queue = readQueue();
  writeQueue([]);
  await Promise.all(queue.map((item) => startSave(item)));
}

async function run(id: string, job: Job) {
  job.ctrl = new AbortController();
  active++;
  emit();
  const result = await saveOffline(
    job.item,
    (frac) => {
      job.frac = frac;
      emitSoon();
    },
    job.ctrl.signal,
  );
  active--;
  jobs.delete(id);
  if (result === "failed") failed.set(id, job.item);
  else failed.delete(id);
  if (result === "nospace") stopForSpace(job.item);
  job.done(result === "ok");
  await refresh();
  pump();
}

/** Retrying cannot help, so drop everything still waiting and say why once. */
function stopForSpace(item: CompanionItem) {
  for (const [id, job] of [...jobs]) {
    if (job.ctrl) continue;
    jobs.delete(id);
    job.done(false);
  }
  notice(`Not enough space on this phone to save "${item.title}".`);
}

function pump() {
  for (const [id, job] of jobs) {
    if (active >= MAX_ACTIVE) return;
    if (!job.ctrl) void run(id, job);
  }
}

/** Resolves false when the save is skipped, cancelled, or fails; callers on the autosave path ignore it. */
export function startSave(item: CompanionItem): Promise<boolean> {
  if (jobs.has(item.id) || snap.saved.has(item.id)) return Promise.resolve(false);
  if (!reachable) {
    const queue = readQueue();
    if (!queue.some((q) => q.id === item.id)) writeQueue([...queue, item]);
    notice("Will save when your PC is back.");
    return Promise.resolve(false);
  }
  failed.delete(item.id);
  return new Promise<boolean>((done) => {
    jobs.set(item.id, { item, ctrl: null, frac: 0, done });
    emit();
    pump();
  });
}

/** Returns how many were new. Skips what is saved or already in line. */
export function saveMany(items: CompanionItem[], label: string): number {
  const fresh = items.filter((i) => !jobs.has(i.id) && !snap.saved.has(i.id));
  if (fresh.length === 0) {
    notice(`${label} is already saved.`);
    return 0;
  }
  for (const item of fresh) void startSave(item);
  if (reachable) notice(`Saving ${fresh.length} ${fresh.length === 1 ? "item" : "items"} from ${label}.`);
  return fresh.length;
}

export function cancelSave(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  if (job.ctrl) {
    job.ctrl.abort();
    return;
  }
  jobs.delete(id);
  job.done(false);
  emit();
}

function dropFailed() {
  for (const id of failed.keys()) void discardPartial(id);
  failed.clear();
}

export function cancelAll() {
  for (const id of [...jobs.keys()]) cancelSave(id);
  dropFailed();
  emit();
}

export function retryFailed() {
  for (const item of [...failed.values()]) void startSave(item);
}

export function dismissFailed() {
  dropFailed();
  emit();
}

// iOS kills sockets while the app is suspended; the partial bytes are still there, so pick up where it stopped.
const RESUME_DELAY_MS = 1500;
let resumeTimer = 0;
function resumeSoon() {
  window.clearTimeout(resumeTimer);
  resumeTimer = window.setTimeout(() => {
    if (document.visibilityState === "visible" && reachable && failed.size > 0) retryFailed();
  }, RESUME_DELAY_MS);
}
document.addEventListener("visibilitychange", resumeSoon);
window.addEventListener("online", resumeSoon);

export async function toggleSaved(item: CompanionItem): Promise<void> {
  if (jobs.has(item.id)) {
    cancelSave(item.id);
    return;
  }
  if (snap.saved.has(item.id)) await removeOffline(item.id);
  else if (!requestIntro("save", item)) await startSave(item);
}
