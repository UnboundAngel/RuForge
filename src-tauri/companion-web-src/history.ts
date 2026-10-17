const KEY = "rf_companion_recent";
const MAX = 40;

export function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecent(id: string): string[] {
  const next = [id, ...readRecent().filter((v) => v !== id)].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}
