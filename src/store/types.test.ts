import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, loadMergedSettings } from "./types";

let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { store = {}; },
});

describe("showExportInTitlebar", () => {
  beforeEach(() => {
    store = {};
  });

  it("defaults to hidden", () => {
    expect(DEFAULT_SETTINGS.showExportInTitlebar).toBe(false);
    expect(loadMergedSettings().showExportInTitlebar).toBe(false);
  });

  it("stays hidden for saved settings from before the toggle existed", () => {
    store["ruforge-settings"] = JSON.stringify({ accentColor: "#EDCF9B" });
    expect(loadMergedSettings().showExportInTitlebar).toBe(false);
  });

  it("keeps an explicit opt-in", () => {
    store["ruforge-settings"] = JSON.stringify({ showExportInTitlebar: true });
    expect(loadMergedSettings().showExportInTitlebar).toBe(true);
  });
});
