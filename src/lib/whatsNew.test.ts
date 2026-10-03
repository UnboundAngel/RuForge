import { describe, expect, it } from "vitest";
import { parseWhatsNew } from "./whatsNew";

describe("parseWhatsNew", () => {
  it("turns area bullets into tiles and fixes into extras", () => {
    const c = parseWhatsNew(
      [
        "**RuForge 0.5.0**",
        "# Follow your channels",
        "- **Library**: A YouTube-style home.",
        "* **Music:** Playlists and more.",
        "- **Fixes**: Steadier playback.",
        "Some trailing prose.",
      ].join("\n"),
    );
    expect(c.headline).toBe("Follow your channels");
    expect(c.tiles).toEqual([
      { key: "library", label: "Library", text: "A YouTube-style home." },
      { key: "music", label: "Music", text: "Playlists and more." },
    ]);
    expect(c.extras).toEqual(["Steadier playback."]);
  });

  it("skips a heading that only names the version", () => {
    expect(parseWhatsNew("## RuForge v0.5.1\n- **Island**: x").headline).toBeNull();
  });

  it("returns no tiles for plain prose", () => {
    expect(parseWhatsNew("Just a paragraph of notes.").tiles).toEqual([]);
  });
});
