import type {
  LibraryResponse,
  ProgressPayload,
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
export async function fetchLibrary(): Promise<
  { ok: true; data: LibraryResponse } | { ok: false; error: ApiError }
> {
  try {
    const res = await fetch("/library", FETCH_OPTS);
    if (res.status === 401 || res.status === 403) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: { kind: "session", code: data.error } };
    }
    if (!res.ok) {
      return { ok: false, error: { kind: "unknown" } };
    }
    const data = (await res.json()) as LibraryResponse;
    return { ok: true, data };
  } catch {
    return { ok: false, error: { kind: "network" } };
  }
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
          ),
        ).toString()
      : "";
    const res = await fetch(
      `/stream-token/${encodeURIComponent(id)}${qs}`,
      { ...FETCH_OPTS, method: "POST" },
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

export async function postProgress(id: string, payload: ProgressPayload): Promise<void> {
  try {
    await fetch(`/progress/${encodeURIComponent(id)}`, {
      ...FETCH_OPTS,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // best-effort
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch("/healthz", { ...FETCH_OPTS, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
