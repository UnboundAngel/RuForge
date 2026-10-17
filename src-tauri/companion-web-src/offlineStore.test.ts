import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanionItem } from "./types";

type Gate = { item: CompanionItem; signal?: AbortSignal; finish: (r: "ok" | "failed" | "nospace" | "cancelled") => void };
const gates: Gate[] = [];
const discarded: string[] = [];

vi.mock("./offline", () => ({
  subscribe: () => () => {},
  listOffline: async () => [],
  removeOffline: async () => {},
  discardPartial: async (id: string) => void discarded.push(id),
  saveOffline: (item: CompanionItem, _p: unknown, signal?: AbortSignal) =>
    new Promise((resolve) => {
      const gate: Gate = { item, signal, finish: resolve as Gate["finish"] };
      signal?.addEventListener("abort", () => resolve("cancelled"));
      gates.push(gate);
    }),
}));
vi.mock("./intro", () => ({ requestIntro: () => false }));

const mk = (id: string): CompanionItem => ({ id, title: id }) as CompanionItem;
const tick = () => new Promise((r) => setTimeout(r, 0));

let store: typeof import("./offlineStore");
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("window", Object.assign(globalThis, { addEventListener: () => {} }));
  vi.stubGlobal("document", { addEventListener: () => {}, visibilityState: "hidden" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  gates.length = 0;
  discarded.length = 0;
  store = await import("./offlineStore");
});

describe("download queue", () => {
  it("runs two at a time and starts the next when one ends", async () => {
    ["a", "b", "c"].forEach((id) => void store.startSave(mk(id)));
    await tick();
    expect(gates.map((g) => g.item.id)).toEqual(["a", "b"]);
    gates[0]!.finish("ok");
    await tick();
    expect(gates.map((g) => g.item.id)).toEqual(["a", "b", "c"]);
  });

  it("cancels a waiting item without starting it", async () => {
    ["a", "b", "c"].forEach((id) => void store.startSave(mk(id)));
    await tick();
    store.cancelSave("c");
    gates[0]!.finish("ok");
    await tick();
    expect(gates.map((g) => g.item.id)).toEqual(["a", "b"]);
    expect(store.isSaving("c")).toBe(false);
  });

  it("aborts a running item and does not mark it failed", async () => {
    void store.startSave(mk("a"));
    await tick();
    store.cancelSave("a");
    await tick();
    expect(gates[0]!.signal!.aborted).toBe(true);
    expect(store.isSaving("a")).toBe(false);
  });

  it("keeps a failed item for retry and retries it", async () => {
    void store.startSave(mk("a"));
    await tick();
    gates[0]!.finish("failed");
    await tick();
    store.retryFailed();
    await tick();
    expect(gates).toHaveLength(2);
  });

  it("drops the queue and keeps nothing to retry when space runs out", async () => {
    ["a", "b", "c"].forEach((id) => void store.startSave(mk(id)));
    await tick();
    const notices: string[] = [];
    store.onNotice((m) => notices.push(m));
    gates[0]!.finish("nospace");
    await tick();
    expect(notices.some((m) => m.includes("Not enough space"))).toBe(true);
    expect(store.isSaving("c")).toBe(false);
    store.retryFailed();
    await tick();
    expect(gates.map((g) => g.item.id)).toEqual(["a", "b"]);
  });

  it("discards partial files when failed items are dismissed", async () => {
    void store.startSave(mk("a"));
    await tick();
    gates[0]!.finish("failed");
    await tick();
    store.dismissFailed();
    expect(discarded).toEqual(["a"]);
  });
});
