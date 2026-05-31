/** Move one path within a path array (manual queue or combined queue list). */
export function reorderManualQueuePaths(
  queue: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (fromIndex === toIndex) return queue;
  if (fromIndex < 0 || fromIndex >= queue.length) return queue;
  if (toIndex < 0 || toIndex >= queue.length) return queue;
  const next = [...queue];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return queue;
  next.splice(toIndex, 0, item);
  return next;
}

/** Manual queue first, then next-up paths not already queued. */
export function buildCombinedQueuePaths(
  manualQueue: string[],
  nextUpPaths: string[],
): string[] {
  const seen = new Set(manualQueue);
  const tail = nextUpPaths.filter((p) => !seen.has(p));
  return [...manualQueue, ...tail];
}

/**
 * After a UI reorder, the combined list becomes the new manual queue
 * (next-up rows promote into manual queue; effectivePlaylist stays unchanged).
 */
export function manualQueueFromCombinedReorder(reorderedPaths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of reorderedPaths) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}
