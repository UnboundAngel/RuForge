export type DownloadPhase = 'idle' | 'downloading' | 'processing' | 'complete' | 'error';

export type ProgressSnapshot = {
  loaded: number;
  total: number | null;
  speedBps: number;
  etaSec: number | null;
  percent: number;
};

const SPEED_EMA_ALPHA = 0.22;

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '';
  return `${formatBytes(bps)}/s`;
}

export function formatEta(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '';
  if (sec < 60) return `${Math.max(1, Math.round(sec))}s left`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s left`;
}

export function percentFromLoaded(loaded: number, total: number | null): number {
  if (total != null && total > 0) return Math.min(100, (loaded / total) * 100);
  return 0;
}

export function createSpeedTracker() {
  let lastAt = 0;
  let lastLoaded = 0;
  let ema = 0;

  return {
    reset() {
      lastAt = 0;
      lastLoaded = 0;
      ema = 0;
    },
    sample(loaded: number, now = performance.now()): number {
      if (lastAt === 0) {
        lastAt = now;
        lastLoaded = loaded;
        return 0;
      }
      const dt = (now - lastAt) / 1000;
      if (dt <= 0) return ema;
      const instant = Math.max(0, (loaded - lastLoaded) / dt);
      ema = ema === 0 ? instant : ema * (1 - SPEED_EMA_ALPHA) + instant * SPEED_EMA_ALPHA;
      lastAt = now;
      lastLoaded = loaded;
      return ema;
    },
  };
}

export function etaSeconds(loaded: number, total: number | null, speedBps: number): number | null {
  if (total == null || total <= 0 || speedBps <= 0) return null;
  const remaining = total - loaded;
  if (remaining <= 0) return 0;
  return remaining / speedBps;
}

export async function streamInstallerToBlob(
  url: string,
  signal: AbortSignal,
  onProgress: (snap: ProgressSnapshot) => void,
): Promise<Blob> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (res.status === 404) {
    throw new Error('not_found');
  }
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }

  const totalHeader = res.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : null;
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Streaming not supported');
  }

  const speed = createSpeedTracker();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      const speedBps = speed.sample(loaded);
      const percent = percentFromLoaded(loaded, total);
      onProgress({
        loaded,
        total: Number.isFinite(total) && total! > 0 ? total : null,
        speedBps,
        etaSec: etaSeconds(loaded, total, speedBps),
        percent: total != null && total > 0 ? percent : Math.min(99, loaded > 0 ? 50 : 0),
      });
    }
  }

  onProgress({
    loaded,
    total: loaded,
    speedBps: 0,
    etaSec: 0,
    percent: 100,
  });

  return new Blob(chunks, { type: res.headers.get('content-type') ?? 'application/octet-stream' });
}

export type InstallerFetchResult =
  | { kind: 'blob'; blob: Blob }
  | { kind: 'browser' };

/** Streams from each URL; falls back to a direct browser download (no fake progress). */
export async function fetchInstaller(
  urls: string[],
  directUrl: string,
  signal: AbortSignal,
  onProgress: (snap: ProgressSnapshot) => void,
): Promise<InstallerFetchResult> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      const blob = await streamInstallerToBlob(url, signal, onProgress);
      return { kind: 'blob', blob };
    } catch (err) {
      if (signal.aborted) throw err;
      lastError = err;
    }
  }

  triggerBrowserDownload(directUrl);
  return { kind: 'browser' };
}

/** Cross-origin safe: user gesture already happened via the Download button. */
export function triggerBrowserDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** Demo only: `/download?download=demo` */
export function runDemoDownload(
  signal: AbortSignal,
  onProgress: (snap: ProgressSnapshot) => void,
  onProcessing: () => void,
): Promise<void> {
  const totalBytes = 12.4 * 1024 * 1024;
  let loaded = 0;
  let speedMbps = 2.4;
  let last: number | null = null;
  let raf = 0;

  return new Promise((resolve, reject) => {
    const tick = (now: number) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      if (last == null) last = now;
      const dt = Math.min((now - last) / 1000, 0.12);
      last = now;
      const target = 1.8 + Math.random() * 5.2;
      speedMbps = Math.max(
        0.35,
        Math.min(7.5, speedMbps + (target - speedMbps) * 0.1 + (Math.random() - 0.5) * 0.2),
      );
      const speedBps = speedMbps * 1024 * 1024;
      loaded = Math.min(loaded + speedBps * dt, totalBytes);
      const percent = (loaded / totalBytes) * 100;
      onProgress({
        loaded,
        total: totalBytes,
        speedBps,
        etaSec: etaSeconds(loaded, totalBytes, speedBps),
        percent,
      });

      if (loaded < totalBytes) {
        raf = requestAnimationFrame(tick);
        return;
      }

      onProgress({
        loaded: totalBytes,
        total: totalBytes,
        speedBps: 0,
        etaSec: 0,
        percent: 100,
      });
      onProcessing();
      window.setTimeout(() => resolve(), 400);
    };

    signal.addEventListener(
      'abort',
      () => {
        cancelAnimationFrame(raf);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );

    raf = requestAnimationFrame(tick);
  });
}
