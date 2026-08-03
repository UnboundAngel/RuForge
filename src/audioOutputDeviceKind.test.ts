import { describe, expect, it } from "vitest";

import { classifyAudioOutputDeviceKind } from "./audioOutputDeviceKind";

describe("classifyAudioOutputDeviceKind", () => {
  it("classifies system default", () => {
    expect(classifyAudioOutputDeviceKind("System default")).toBe("default");
  });

  it("classifies headphones by name", () => {
    expect(classifyAudioOutputDeviceKind("Headphones (TREBLAB HD77)")).toBe(
      "headphones",
    );
    expect(classifyAudioOutputDeviceKind("Headset (Corsair)")).toBe("headphones");
  });

  it("classifies display / HDMI endpoints", () => {
    expect(
      classifyAudioOutputDeviceKind("AW2726DM (NVIDIA High Definition Audio)"),
    ).toBe("display");
    expect(
      classifyAudioOutputDeviceKind("G274QPF E2 (NVIDIA High Definition Audio)"),
    ).toBe("display");
  });

  it("keeps Speakers (Realtek) as speakers", () => {
    expect(classifyAudioOutputDeviceKind("Speakers (Realtek(R) Audio)")).toBe(
      "speakers",
    );
    expect(
      classifyAudioOutputDeviceKind("Speakers (fifine Microphone)"),
    ).toBe("speakers");
  });

  it("classifies virtual cable / steam streaming", () => {
    expect(
      classifyAudioOutputDeviceKind("CABLE In 16ch (VB-Audio Virtual Cable)"),
    ).toBe("virtual");
    expect(
      classifyAudioOutputDeviceKind("CABLE Input (VB-Audio Virtual Cable)"),
    ).toBe("virtual");
    expect(
      classifyAudioOutputDeviceKind("Speakers (Steam Streaming Speakers)"),
    ).toBe("virtual");
  });

  it("classifies bluetooth", () => {
    expect(classifyAudioOutputDeviceKind("Headphones (Galaxy Buds Bluetooth)")).toBe(
      "headphones",
    );
    expect(classifyAudioOutputDeviceKind("Speakers (JBL Flip Bluetooth)")).toBe(
      "bluetooth",
    );
  });
});
