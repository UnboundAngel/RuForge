const HYDRATION_CONCURRENCY = 2;

let activeCount = 0;
const waitQueue: Array<() => void> = [];
const coalescedByKey = new Map<string, Promise<unknown>>();

function drainWaitQueue(): void {
  while (activeCount < HYDRATION_CONCURRENCY && waitQueue.length > 0) {
    const next = waitQueue.shift();
    if (next) next();
  }
}

function runWithSlot<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      activeCount += 1;
      void task()
        .then(resolve, reject)
        .finally(() => {
          activeCount -= 1;
          drainWaitQueue();
        });
    };

    if (activeCount < HYDRATION_CONCURRENCY) {
      start();
    } else {
      waitQueue.push(start);
    }
  });
}

export const downloadQueueHydrationPool = {
  run<T>(dedupeKey: string, task: () => Promise<T>): Promise<T> {
    const key = dedupeKey.trim();
    if (!key) return runWithSlot(task);

    const existing = coalescedByKey.get(key);
    if (existing) return existing as Promise<T>;

    const promise = runWithSlot(task).finally(() => {
      coalescedByKey.delete(key);
    });
    coalescedByKey.set(key, promise);
    return promise;
  },
};
