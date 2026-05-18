import { formatStorageSize } from "../../formatStorageSize";

/** Approximate download size (hero / queue); same ceiling rules as library. */
export function formatApproxFileSize(bytes: number): string {
  return formatStorageSize(bytes);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
