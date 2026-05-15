export function formatApproxFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (bytes >= gb) {
    const n = bytes / gb;
    return `${n >= 10 ? n.toFixed(1) : n.toFixed(2)} GB`;
  }
  if (bytes >= mb) {
    const n = bytes / mb;
    return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} MB`;
  }
  const n = bytes / kb;
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} KB`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
