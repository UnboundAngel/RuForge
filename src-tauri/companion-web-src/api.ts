import type {
  LibraryResponse,
  ProgressPayload,
  ProgressResponse,
  SidecarResponse,
  StreamTokenResponse,
} from "./types";

const FETCH_OPTS: RequestInit = { credentials: "same-origin" };

type ApiError = { kind: "network" | "session" | "stream" | "unknown"; code?: string };

export async function pairWithCode(code: string): Promise<
  { ok: true } | { ok: false; error: ApiError }
> {
  try {
    const res = await fetch("/pair", {
      ...FETCH_OPTS,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.status === 401 || res.status === 403) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: { kind: "session", code: data.error ?? "expired" } };
    }
    if (!res.ok) {
      return { ok: false, error: { kind: "unknown" } };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: { kind: "network" } };
  }
}
/** An unreachable PC over Tailscale can hang a request for a long time; fail fast and let the reconnect loop retry. */
const PROBE_TIMEOUT_MS = 4000;
const TOKEN_TIMEOUT_MS = 8000;

async function fetchWithTimeout(input: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type LibraryResult =
  | { ok: true; notModified: true; etag: string | null }
  | { ok: true; notModified: false; data: LibraryResponse; etag: string | null }
  | { ok: false; error: ApiError };

export async function fetchLibrary(etag?: string | null): Promise<LibraryResult> {
  try {
    const res = await fetchWithTimeout(
      "/library",
      { ...FETCH_OPTS, cache: "no-store", headers: etag ? { "If-None-Match": etag } : undefined },
      PROBE_TIMEOUT_MS,
    );
    const tag = res.headers.get("etag");
    if (res.status === 304) return { ok: true, notModified: true, etag: tag ?? etag ?? null };
    if (res.status === 401 || res.status === 403) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: { kind: "session", code: data.error } };
    }
    if (!res.ok) {
      return { ok: false, error: { kind: "unknown" } };
    }
    const data = (await res.json()) as LibraryResponse;
    return { ok: true, notModified: false, data, etag: tag };
  } catch {
    return { ok: false, error: { kind: "network" } };
  }
}

const MEDIA_URL_TTL_MS = 300_000;
const mediaUrls = new Map<string, { at: number; url: Promise<string | null> }>();

/** Cached stream URL so a prefetched item starts without a token round trip over the tunnel. */
export function fetchMediaUrl(id: string): Promise<string | null> {
  const hit = mediaUrls.get(id);
  if (hit && Date.now() - hit.at < MEDIA_URL_TTL_MS) return hit.url;
  const url = fetchStreamToken(id).then((u) => {
    if (!u && mediaUrls.get(id)?.url === url) mediaUrls.delete(id);
    return u;
  });
  mediaUrls.set(id, { at: Date.now(), url });
  return url;
}

export async function fetchStreamToken(
  id: string,
  params?: { kind?: "thumb" | "sprite"; idx?: number },
): Promise<string | null> {
  try {
    const qs = params
      ? "?" +
        new URLSearchParams(
          Object.fromEntries(
            Object.entries({ kind: params.kind, idx: String(params.idx ?? "") }).filter(
              ([, v]) => v !== "" && v !== "undefined",
            ),
          ) as Record<string, string>,
        ).toString()
      : "";
    const res = await fetchWithTimeout(
      `/stream-token/${encodeURIComponent(id)}${qs}`,
      { ...FETCH_OPTS, method: "POST" },
      TOKEN_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as StreamTokenResponse;
    return data.url ?? null;
  } catch {
    return null;
  }
}

export async function fetchSidecar(id: string): Promise<SidecarResponse | null> {
  try {
    const res = await fetch(`/sidecar/${encodeURIComponent(id)}`, FETCH_OPTS);
    if (!res.ok) return null;
    return (await res.json()) as SidecarResponse;
  } catch {
    return null;
  }
}

export async function fetchProgress(id: string): Promise<ProgressResponse | null> {
  try {
    const res = await fetch(`/progress/${encodeURIComponent(id)}`, FETCH_OPTS);
    if (!res.ok) return null;
    return (await res.json()) as ProgressResponse;
  } catch {
    return null;
  }
}

export async function postProgress(id: string, payload: ProgressPayload): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `/progress/${encodeURIComponent(id)}`,
      {
        ...FETCH_OPTS,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      TOKEN_TIMEOUT_MS,
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout("/healthz", { ...FETCH_OPTS, cache: "no-store" }, PROBE_TIMEOUT_MS);
    return res.ok;
  } catch {
    return false;
  }
}
