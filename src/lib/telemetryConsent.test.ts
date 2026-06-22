import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTelemetryConsentSeen,
  hasSeenTelemetryConsent,
  markTelemetryConsentSeen,
} from "./telemetryConsentStorage";
import { getOrCreateInstallId } from "./telemetryInstallId";

function mockLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    length: 0,
  });
  return store;
}

describe("telemetryConsentStorage", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  it("starts unseen", () => {
    expect(hasSeenTelemetryConsent()).toBe(false);
  });

  it("marks consent seen", () => {
    markTelemetryConsentSeen();
    expect(hasSeenTelemetryConsent()).toBe(true);
  });

  it("clears consent seen for debug replay", () => {
    markTelemetryConsentSeen();
    clearTelemetryConsentSeen();
    expect(hasSeenTelemetryConsent()).toBe(false);
  });
});

describe("telemetryInstallId", () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
  });

  it("creates and reuses install id", () => {
    const first = getOrCreateInstallId();
    const second = getOrCreateInstallId();
    expect(first).toBe("11111111-1111-4111-8111-111111111111");
    expect(second).toBe(first);
  });
});
