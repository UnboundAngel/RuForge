import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  playbackPosKey,
  readResumeSeconds,
  RESUME_REWIND_SEC,
  writePlaybackPos,
} from "./playbackStorage";

let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    store = {};
  },
});

describe("readResumeSeconds", () => {
  const path = "/videos/sample.mp4";

  beforeEach(() => {
    store = {};
    localStorage.removeItem(playbackPosKey(path));
    localStorage.removeItem(`ruforge-playback-dur:${path}`);
  });

  it("rewinds video resume by the configured offset", () => {
    writePlaybackPos(path, 120, 600);
    expect(readResumeSeconds(path, 600, { rewindSeconds: RESUME_REWIND_SEC })).toBe(110);
  });

  it("returns exact position when no rewind is requested", () => {
    writePlaybackPos(path, 120, 600);
    expect(readResumeSeconds(path, 600)).toBe(120);
  });

  it("uses stored duration when element duration is not ready yet", () => {
    writePlaybackPos(path, 120, 600);
    expect(readResumeSeconds(path, 0, { rewindSeconds: RESUME_REWIND_SEC })).toBe(110);
  });
});
