import { describe, expect, it } from "vitest";
import { pickSettingsSource } from "./settingsFileSync";

const SETTINGS = JSON.stringify({ games: [{ id: "example-game" }] });

describe("pickSettingsSource", () => {
  it("lets the file win when it holds settings, even if localStorage was wiped", () => {
    expect(pickSettingsSource(SETTINGS, null, false)).toBe("file");
    expect(pickSettingsSource(SETTINGS, "{}", false)).toBe("file");
  });

  it("seeds a missing file from localStorage", () => {
    expect(pickSettingsSource(null, SETTINGS, false)).toBe("seed");
  });

  it("does nothing on a fresh install", () => {
    expect(pickSettingsSource(null, null, false)).toBe("none");
    expect(pickSettingsSource(null, "garbage", false)).toBe("none");
  });

  it("leaves a damaged file alone instead of replacing the good cache with it", () => {
    expect(pickSettingsSource("{oops", SETTINGS, false)).toBe("none");
    expect(pickSettingsSource("[]", SETTINGS, false)).toBe("none");
  });

  it("never syncs when the read itself failed", () => {
    expect(pickSettingsSource(null, SETTINGS, true)).toBe("none");
    expect(pickSettingsSource(SETTINGS, SETTINGS, true)).toBe("none");
  });
});
