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

describe("telemetry consent shell ordering", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  function shouldOpenOnboarding(postInstall: unknown, consentPending: boolean): boolean {
    if (postInstall) return false;
    if (consentPending) return false;
    return true;
  }

  function renderLayer(postInstall: unknown, consentPending: boolean): string {
    if (postInstall) return "postInstall";
    if (consentPending) return "telemetryConsent";
    return "main";
  }

  it("blocks onboarding while consent is pending", () => {
    const consentPending = !hasSeenTelemetryConsent();
    expect(consentPending).toBe(true);
    expect(shouldOpenOnboarding(null, consentPending)).toBe(false);
    expect(renderLayer(null, consentPending)).toBe("telemetryConsent");
  });

  it("allows onboarding after consent is marked seen", () => {
    markTelemetryConsentSeen();
    const consentPending = !hasSeenTelemetryConsent();
    expect(consentPending).toBe(false);
    expect(shouldOpenOnboarding(null, consentPending)).toBe(true);
    expect(renderLayer(null, consentPending)).toBe("main");
  });

  it("prefers post-install over consent", () => {
    const consentPending = !hasSeenTelemetryConsent();
    expect(renderLayer({ version: "0.1.11" }, consentPending)).toBe("postInstall");
    expect(shouldOpenOnboarding({ version: "0.1.11" }, consentPending)).toBe(false);
  });
});
