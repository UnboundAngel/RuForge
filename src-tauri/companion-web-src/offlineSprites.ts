import { fetchSidecar, fetchStreamToken } from "./api";
import { writeSidecar } from "./sideData";

const CACHE = "rf-offline-sprites";
const key = (id: string, idx: number) => `/__sprite/${encodeURIComponent(id)}/${idx}`;
const urls = new Map<string, string>();

/** Scrub preview sheets for a saved video; best effort, the video itself plays without them. */
export async function cacheSprites(id: string): Promise<void> {
  try {
    const sidecar = await fetchSidecar(id);
    if (!sidecar) return;
    await writeSidecar(id, sidecar);
    const count = sidecar.scrubSpriteCount ?? 0;
    if (count <= 0) return;
    const cache = await caches.open(CACHE);
    for (let idx = 0; idx < count; idx++) {
      const url = await fetchStreamToken(id, { kind: "sprite", idx });
      if (!url) continue;
      const res = await fetch(url, { credentials: "same-origin" });
      if (res.ok) await cache.put(key(id, idx), res);
    }
  } catch {}
}

export async function cachedSpriteUrl(id: string, idx: number): Promise<string | null> {
  const k = key(id, idx);
  const known = urls.get(k);
  if (known) return known;
  try {
    const hit = await (await caches.open(CACHE)).match(k);
    if (!hit) return null;
    const url = URL.createObjectURL(await hit.blob());
    urls.set(k, url);
    return url;
  } catch {
    return null;
  }
}

export async function dropSprites(id: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE);
    const prefix = `/__sprite/${encodeURIComponent(id)}/`;
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      if (!path.startsWith(prefix)) continue;
      await cache.delete(req);
      const url = urls.get(path);
      if (url) URL.revokeObjectURL(url);
      urls.delete(path);
    }
  } catch {}
}
