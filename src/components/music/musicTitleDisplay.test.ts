import { describe, expect, it } from "vitest";
import { displaySongTitle } from "./musicTitleDisplay";

describe("displaySongTitle", () => {
  it("drops upload noise brackets", () => {
    expect(displaySongTitle("LOST IN THE ECHO [Official Music Video]", "Linkin Park")).toBe("LOST IN THE ECHO");
  });

  it("drops the artist suffix and anything after it", () => {
    expect(displaySongTitle("By Myself - Linkin Park (Hybrid Theory 2000)", "Linkin Park")).toBe("By Myself");
  });

  it("drops the artist prefix", () => {
    expect(displaySongTitle("VOLA - Straight Lines (Official Music Video)", "VOLA")).toBe("Straight Lines");
  });

  it("keeps feat and live brackets", () => {
    expect(displaySongTitle("Facetime (feat. G Herbo)", "King Von")).toBe("Facetime (feat. G Herbo)");
    expect(displaySongTitle("Numb (Live)", "Linkin Park")).toBe("Numb (Live)");
  });

  it("never returns empty", () => {
    expect(displaySongTitle("[Official Video]", null)).toBe("[Official Video]");
  });
});
