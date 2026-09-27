import { describe, expect, it } from "vitest";
import { IMPORT_PROMPT } from "./importPrompt";
import { IMPORT_MAX_ROWS, parseImport } from "./parseImport";

const row = (title: string, artist = "Artist", duration: string | null = "3:00") =>
  ({ title, artists: [artist], album: null, duration, unclear: false });

const doc = (tracks: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ ruforge_import: 1, playlist: { name: "Late Night", source: "spotify" }, tracks, ...extra }, null, 2);

function ok(reply: string) {
  const r = parseImport(reply);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("parseImport", () => {
  it("reads a fenced reply", () => {
    const v = ok("```json\n" + doc([row("Blinding Lights", "The Weeknd", "3:20")]) + "\n```");
    expect(v.name).toBe("Late Night");
    expect(v.source).toBe("spotify");
    expect(v.tracks).toEqual([
      { title: "Blinding Lights", artists: ["The Weeknd"], album: null, durationSec: 200, unclear: false },
    ]);
    expect(v.repaired).toBe(false);
  });

  it("ignores chatter before and after the JSON", () => {
    const v = ok(`Sure! Here's your playlist:\n\n${doc([row("A"), row("B")])}\n\nLet me know if you need anything else.`);
    expect(v.tracks.map((t) => t.title)).toEqual(["A", "B"]);
  });

  it("accepts a bare array as the track list", () => {
    const v = ok(JSON.stringify([row("A"), row("B")]));
    expect(v.tracks).toHaveLength(2);
    expect(v.name).toBeNull();
  });

  it("repairs trailing commas", () => {
    const v = ok('{"ruforge_import":1,"tracks":[{"title":"A","artists":["X"],},],}');
    expect(v.tracks[0].title).toBe("A");
    expect(v.repaired).toBe(true);
  });

  it("repairs smart quotes", () => {
    const v = ok("{“ruforge_import”: 1, “tracks”: [{“title”: “A”, “artists”: [“X”]}]}");
    expect(v.tracks[0].artists).toEqual(["X"]);
  });

  it("reports line and column when the JSON is broken", () => {
    const r = parseImport('{\n  "ruforge_import": 1,\n  "tracks": [ { "title": "A" "artists": ["X"] } ]\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/line 3, column \d+/);
  });

  it("splits an `artist` string on commas and ampersands only", () => {
    const v = ok(JSON.stringify([{ title: "A", artist: "Daft Punk, Pharrell Williams & Nile Rodgers" }, { title: "B", artist: "Simon and Garfunkel" }]));
    expect(v.tracks[0].artists).toEqual(["Daft Punk", "Pharrell Williams", "Nile Rodgers"]);
    expect(v.tracks[1].artists).toEqual(["Simon and Garfunkel"]);
  });

  it("drops a bad row mid-list and reports it", () => {
    const v = ok(doc([row("A"), { artists: ["X"] }, row("C"), { title: "D", artists: [] }]));
    expect(v.tracks.map((t) => t.title)).toEqual(["A", "C", "D"]);
    expect(v.rowErrors).toEqual(["Row 2: no title"]);
  });

  it("keeps a row whose duration doesn't parse", () => {
    const v = ok(doc([row("A", "X", "about 3 minutes"), row("B", "X", "1:02:03")]));
    expect(v.tracks.map((t) => t.durationSec)).toEqual([null, 3723]);
  });

  it("removes screenshot overlap", () => {
    const v = ok(doc([row("A"), row("B"), row("C"), row("B"), row("C"), row("D")]));
    expect(v.tracks.map((t) => t.title)).toEqual(["A", "B", "C", "D"]);
    expect(v.duplicatesRemoved).toBe(2);
  });

  it("keeps a deliberate repeat far apart", () => {
    const v = ok(doc([row("A"), row("B"), row("C"), row("D"), row("E"), row("A")]));
    expect(v.tracks).toHaveLength(6);
  });

  it("caps at 1000 rows", () => {
    const v = ok(doc(Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => row(`Song ${i}`))));
    expect(v.tracks).toHaveLength(IMPORT_MAX_ROWS);
    expect(v.truncated).toBe(1);
  });

  it("rejects other versions and unrelated JSON", () => {
    expect(parseImport(doc([row("A")], { ruforge_import: 2 })).ok).toBe(false);
    expect(parseImport('{"name": "not a playlist"}').ok).toBe(false);
    expect(parseImport("no json here").ok).toBe(false);
  });

  it("parses the example in its own prompt", () => {
    const v = ok(IMPORT_PROMPT);
    expect(v.tracks[0]).toMatchObject({ title: "Song title", artists: ["Artist 1", "Artist 2"], durationSec: 200 });
  });
});
