import { describe, expect, it } from "vitest";
import { applyMediaOutputState, holdMediaMute } from "./applyMediaOutputState";

const fakeEl = (muted = false) => ({ muted, volume: 1 }) as unknown as HTMLMediaElement;

describe("holdMediaMute", () => {
  it("keeps the element muted through player re-applies and restores the prior state", () => {
    const el = fakeEl(false);
    const release = holdMediaMute(el);
    applyMediaOutputState(el, 0.5, false);
    expect(el.muted).toBe(true);
    expect(el.volume).toBeCloseTo(0.25);
    release();
    expect(el.muted).toBe(false);
  });

  it("restores the mute state requested during the hold", () => {
    const el = fakeEl(false);
    const release = holdMediaMute(el);
    applyMediaOutputState(el, 1, true);
    release();
    expect(el.muted).toBe(true);
  });

  it("applies normally without a hold", () => {
    const el = fakeEl(true);
    applyMediaOutputState(el, 1, false);
    expect(el.muted).toBe(false);
  });
});
