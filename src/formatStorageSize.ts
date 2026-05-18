const KB = 1024;
const MB = KB * KB;
const GB = MB * KB;

/** Whole MB/GB/KB only; always rounds up (4.3 GiB → 5 GB). */
export function formatStorageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= GB) return `${Math.ceil(bytes / GB)} GB`;
  if (bytes >= MB) return `${Math.ceil(bytes / MB)} MB`;
  if (bytes >= KB) return `${Math.ceil(bytes / KB)} KB`;
  return `${Math.ceil(bytes)} B`;
}
