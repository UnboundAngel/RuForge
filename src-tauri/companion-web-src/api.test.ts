import { afterEach, describe, expect, it, vi } from "vitest";
import { checkHealth, fetchLibrary } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubFetch(impl: (input: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("fetchLibrary", () => {
  it("sends the stored tag and reports a 304 without a body", async () => {
    const spy = stubFetch(async () => new Response(null, { status: 304, headers: { ETag: '"v1-10"' } }));
    const res = await fetchLibrary('"v1-10"');
    expect(res).toEqual({ ok: true, notModified: true, etag: '"v1-10"' });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["If-None-Match"]).toBe('"v1-10"');
  });

  it("returns items and the new tag on 200", async () => {
    stubFetch(async () =>
      Response.json({ items: [{ id: "a", title: "A" }], refreshing: false }, { headers: { ETag: '"v2-10"' } }),
    );
    const res = await fetchLibrary(null);
    expect(res.ok && !res.notModified && res.data.items[0]!.id).toBe("a");
    expect(res.ok && res.etag).toBe('"v2-10"');
  });

  it("maps 401 to a session error with the server code", async () => {
    stubFetch(async () => Response.json({ error: "session_revoked" }, { status: 401 }));
    expect(await fetchLibrary()).toEqual({ ok: false, error: { kind: "session", code: "session_revoked" } });
  });

  it("gives up on a hung PC instead of waiting forever", async () => {
    vi.useFakeTimers();
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const pending = fetchLibrary();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toEqual({ ok: false, error: { kind: "network" } });
  });
});

describe("checkHealth", () => {
  it("times out to false", async () => {
    vi.useFakeTimers();
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const pending = checkHealth();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toBe(false);
  });
});
