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

describe("browserContext", () => {
  beforeEach(() => {
    store = {};
  });

  it("moves saved Edge and Brave choices to Internal", () => {
    store["ruforge-settings"] = JSON.stringify({ browserContext: "edge" });
    expect(loadMergedSettings().browserContext).toBe("ruforge");
    store["ruforge-settings"] = JSON.stringify({ browserContext: "brave" });
    expect(loadMergedSettings().browserContext).toBe("ruforge");
  });

  it("keeps Firefox, Zen and a picked cookies file", () => {
    store["ruforge-settings"] = JSON.stringify({ browserContext: "firefox" });
    expect(loadMergedSettings().browserContext).toBe("firefox");
    store["ruforge-settings"] = JSON.stringify({ browserContext: "zen" });
    expect(loadMergedSettings().browserContext).toBe("zen");
    store["ruforge-settings"] = JSON.stringify({ browserContext: "custom" });
    expect(loadMergedSettings().browserContext).toBe("custom");
  });
});
