import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AUDIO_OUTPUT_DEVICE_KEY,
  getAudioOutputDeviceId,
  setAudioOutputDeviceId,
  subscribeAudioOutputDeviceId,
} from "./audioOutputDevices";

function installMemoryLocalStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
}

describe("audioOutputDevices storage", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    localStorage.removeItem(AUDIO_OUTPUT_DEVICE_KEY);
  });

  it("defaults to empty system default", () => {
    expect(getAudioOutputDeviceId()).toBe("");
  });

  it("persists and clears device id", () => {
    setAudioOutputDeviceId("sink-1");
    expect(getAudioOutputDeviceId()).toBe("sink-1");
    expect(localStorage.getItem(AUDIO_OUTPUT_DEVICE_KEY)).toBe("sink-1");
    setAudioOutputDeviceId("");
    expect(getAudioOutputDeviceId()).toBe("");
    expect(localStorage.getItem(AUDIO_OUTPUT_DEVICE_KEY)).toBeNull();
  });

  it("notifies subscribers on change", () => {
    let ticks = 0;
    const unsub = subscribeAudioOutputDeviceId(() => {
      ticks += 1;
    });
    setAudioOutputDeviceId("a");
    setAudioOutputDeviceId("b");
    unsub();
    setAudioOutputDeviceId("c");
    expect(ticks).toBe(2);
  });
});
