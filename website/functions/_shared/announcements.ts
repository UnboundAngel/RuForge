import { ANNOUNCE_PUBKEY_HEX } from "./announcePubkey";
import type { Env } from "./types";

export interface PollOption {
  id: string;
  label: string;
}

export interface AnnouncementItem {
  id: string;
  kind: "notice" | "poll";
  title: string;
  body: string;
  published: string;
  ends?: string;
  options?: PollOption[];
}

const CACHE_MS = 60_000;
let cache: { at: number; items: AnnouncementItem[] } | null = null;

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Returns the verified items, or null when the file is missing, unsigned or tampered with. */
export async function loadSignedItems(env: Env, request: Request): Promise<AnnouncementItem[] | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  try {
    const res = await env.ASSETS.fetch(new URL("/announcements.json", request.url));
    if (!res.ok) return null;
    const doc = (await res.json()) as { payload?: unknown; sig?: unknown };
    if (typeof doc.payload !== "string" || typeof doc.sig !== "string") return null;
    const payload = fromBase64(doc.payload);
    const key = await crypto.subtle.importKey("raw", fromHex(ANNOUNCE_PUBKEY_HEX), { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, fromBase64(doc.sig), payload);
    if (!ok) return null;
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as { version?: number; items?: AnnouncementItem[] };
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
    cache = { at: Date.now(), items: parsed.items };
    return parsed.items;
  } catch {
    return null;
  }
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isClosed(item: AnnouncementItem): boolean {
  return !!item.ends && todayUtc() > item.ends;
}
