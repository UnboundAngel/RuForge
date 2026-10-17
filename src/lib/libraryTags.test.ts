import { describe, expect, it } from "vitest";
import type { GameRecord } from "./gamesSettings";
import {
  EMPTY_LIBRARY_TAGS,
  addManualTag,
  allTags,
  applyRules,
  createPlainTag,
  gameTagId,
  moveRule,
  normalizeLibraryTags,
  parseLibraryTagsSnapshot,
  pickNewerSnapshot,
  reconcileGames,
  removeVideoTag,
  ruleMatches,
  serializeLibraryTags,
  tagsAfterRules,
  videoKey,
  type LibraryTagsState,
  type TagRule,
} from "./libraryTags";

const game = (id: string, name: string): GameRecord => ({ id, name, exe: `${id}.exe`, enabled: true, autoGhost: true });
const MC = game("mc", "Minecraft");
const TR = game("tr", "Terraria");
const MC_TAG = gameTagId("mc");
const TR_TAG = gameTagId("tr");

const rule = (id: string, patch: Partial<TagRule>): TagRule => ({
  id,
  field: "title",
  op: "includes",
  text: "",
  tagId: "",
  enabled: true,
  ...patch,
});

function state(patch: Partial<LibraryTagsState> = {}): LibraryTagsState {
  return { ...EMPTY_LIBRARY_TAGS, tags: [{ id: "speed", name: "Speedrun" }], ...patch };
}

const known = new Set([MC_TAG, TR_TAG, "speed"]);

describe("ruleMatches", () => {
  it("includes is a case-insensitive substring", () => {
    expect(ruleMatches(rule("r", { text: "minecraft" }), { title: "Best MINECRAFT seeds" })).toBe(true);
    expect(ruleMatches(rule("r", { text: "terraria" }), { title: "Best Minecraft seeds" })).toBe(false);
  });

  it("is compares the whole field, ignoring case and outer spaces", () => {
    const r = rule("r", { field: "channel", op: "is", text: " Dream " });
    expect(ruleMatches(r, { title: "x", channel: "dream" })).toBe(true);
    expect(ruleMatches(r, { title: "x", channel: "Dream Team" })).toBe(false);
  });

  it("treats the text as plain characters, not a pattern", () => {
    expect(ruleMatches(rule("r", { text: "a.c" }), { title: "abc" })).toBe(false);
    expect(ruleMatches(rule("r", { text: "(any%)" }), { title: "Run (Any%) WR" })).toBe(true);
    expect(ruleMatches(rule("r", { text: ".*" }), { title: "anything" })).toBe(false);
  });

  it("never matches empty text or a missing field", () => {
    expect(ruleMatches(rule("r", { text: "  " }), { title: "anything" })).toBe(false);
    expect(ruleMatches(rule("r", { field: "description", text: "seed" }), { title: "seed" })).toBe(false);
  });
});

describe("game tag exclusivity", () => {
  it("adding a second game tag by hand replaces the first", () => {
    let s = addManualTag(state(), "yt:a", MC_TAG);
    s = addManualTag(s, "yt:a", "speed");
    s = addManualTag(s, "yt:a", TR_TAG);
    expect(s.videos["yt:a"]).toEqual([
      { tagId: "speed", source: "manual" },
      { tagId: TR_TAG, source: "manual" },
    ]);
  });

  it("two matching game rules give one game tag", () => {
    const s = state({
      rules: [
        rule("r1", { text: "minecraft", tagId: MC_TAG }),
        rule("r2", { text: "terraria", tagId: TR_TAG }),
      ],
    });
    const refs = tagsAfterRules(s, "yt:a", { title: "Minecraft vs Terraria" }, known);
    expect(refs).toEqual([{ tagId: MC_TAG, source: "rule:r1" }]);
  });

  it("plain tags stack next to the game tag", () => {
    const s = state({
      rules: [
        rule("r1", { text: "minecraft", tagId: MC_TAG }),
        rule("r2", { text: "speedrun", tagId: "speed" }),
      ],
    });
    const refs = tagsAfterRules(s, "yt:a", { title: "Minecraft speedrun" }, known);
    expect(refs.map((r) => r.tagId)).toEqual([MC_TAG, "speed"]);
  });
});

describe("rule order", () => {
  const rules = [
    rule("r1", { text: "minecraft", tagId: MC_TAG }),
    rule("r2", { text: "terraria", tagId: TR_TAG }),
  ];
  const title = { title: "Minecraft vs Terraria" };

  it("the first game rule in the list wins", () => {
    expect(tagsAfterRules(state({ rules }), "k", title, known)[0].tagId).toBe(MC_TAG);
  });

  it("reordering changes the winner on the next run", () => {
    const reordered = moveRule(rules, ["r2", "r1"]);
    expect(reordered.map((r) => r.id)).toEqual(["r2", "r1"]);
    let s = applyRules(state({ rules }), [{ key: "k", input: title }], known).state;
    s = applyRules({ ...s, rules: reordered }, [{ key: "k", input: title }], known).state;
    expect(s.videos.k).toEqual([{ tagId: TR_TAG, source: "rule:r2" }]);
  });

  it("disabled rules and rules without a tag are skipped", () => {
    const s = state({
      rules: [rule("r1", { text: "minecraft", tagId: MC_TAG, enabled: false }), rule("r2", { text: "minecraft" })],
    });
    expect(tagsAfterRules(s, "k", title, known)).toEqual([]);
  });
});

describe("manual beats rules", () => {
  it("a manual game tag blocks every game rule", () => {
    let s = state({ rules: [rule("r1", { text: "minecraft", tagId: MC_TAG })] });
    s = addManualTag(s, "k", TR_TAG);
    s = applyRules(s, [{ key: "k", input: { title: "Minecraft" } }], known).state;
    expect(s.videos.k).toEqual([{ tagId: TR_TAG, source: "manual" }]);
  });

  it("adding a rule tag by hand turns it manual, so a later rule edit keeps it", () => {
    let s = state({ rules: [rule("r1", { text: "minecraft", tagId: MC_TAG })] });
    s = applyRules(s, [{ key: "k", input: { title: "Minecraft" } }], known).state;
    s = addManualTag(s, "k", MC_TAG);
    s = { ...s, rules: [rule("r1", { text: "something else", tagId: MC_TAG })] };
    s = applyRules(s, [{ key: "k", input: { title: "Minecraft" } }], known).state;
    expect(s.videos.k).toEqual([{ tagId: MC_TAG, source: "manual" }]);
  });

  it("rule tags follow the rules; manual tags do not", () => {
    let s = state({ rules: [rule("r1", { text: "speedrun", tagId: "speed" })] });
    s = addManualTag(s, "k", MC_TAG);
    s = applyRules(s, [{ key: "k", input: { title: "speedrun" } }], known).state;
    expect(s.videos.k.map((r) => r.tagId)).toEqual([MC_TAG, "speed"]);
    s = applyRules({ ...s, rules: [] }, [{ key: "k", input: { title: "speedrun" } }], known).state;
    expect(s.videos.k).toEqual([{ tagId: MC_TAG, source: "manual" }]);
  });
});

describe("removed stays removed", () => {
  const rules = [rule("r1", { text: "minecraft", tagId: MC_TAG })];
  const target = [{ key: "k", input: { title: "Minecraft" } }];

  it("a rule never re-adds a tag the user took off", () => {
    let s = applyRules(state({ rules }), target, known).state;
    expect(s.videos.k).toHaveLength(1);
    s = removeVideoTag(s, "k", MC_TAG);
    expect(s.suppressed.k).toEqual([MC_TAG]);
    s = applyRules(s, target, known).state;
    expect(s.videos.k).toBeUndefined();
  });

  it("adding it back by hand lifts the block", () => {
    let s = applyRules(state({ rules }), target, known).state;
    s = removeVideoTag(s, "k", MC_TAG);
    s = addManualTag(s, "k", MC_TAG);
    expect(s.suppressed.k).toBeUndefined();
    expect(s.videos.k).toEqual([{ tagId: MC_TAG, source: "manual" }]);
  });

  it("a removed game tag lets the next matching game rule in", () => {
    const two = [...rules, rule("r2", { text: "terraria", tagId: TR_TAG })];
    let s = applyRules(state({ rules: two }), [{ key: "k", input: { title: "Minecraft Terraria" } }], known).state;
    s = removeVideoTag(s, "k", MC_TAG);
    s = applyRules(s, [{ key: "k", input: { title: "Minecraft Terraria" } }], known).state;
    expect(s.videos.k).toEqual([{ tagId: TR_TAG, source: "rule:r2" }]);
  });
});

describe("applyRules", () => {
  it("counts videos that gained each tag and leaves untouched state alone", () => {
    const s = state({ rules: [rule("r1", { text: "minecraft", tagId: MC_TAG })] });
    const targets = [
      { key: "a", input: { title: "Minecraft 1" } },
      { key: "b", input: { title: "Minecraft 2" } },
      { key: "c", input: { title: "Cooking" } },
    ];
    const first = applyRules(s, targets, known);
    expect(first.added.get(MC_TAG)).toBe(2);
    const second = applyRules(first.state, targets, known);
    expect(second.added.size).toBe(0);
    expect(second.state).toBe(first.state);
  });
});

describe("reconcileGames", () => {
  let n = 0;
  const makeId = () => `r${++n}`;

  it("seeds one default rule per game, once", () => {
    const first = reconcileGames(state(), [MC], makeId);
    expect(first.seeded).toHaveLength(1);
    expect(first.seeded[0]).toMatchObject({ field: "title", op: "includes", text: "Minecraft", tagId: MC_TAG });
    const withoutRule = { ...first.state, rules: [] };
    const again = reconcileGames(withoutRule, [MC], makeId);
    expect(again.seeded).toHaveLength(0);
    expect(again.state.rules).toEqual([]);
  });

  it("deleting a game deletes its tag everywhere", () => {
    let s = reconcileGames(state(), [MC, TR], makeId).state;
    s = addManualTag(s, "a", MC_TAG);
    s = addManualTag(s, "a", "speed");
    s = removeVideoTag(addManualTag(s, "b", MC_TAG), "b", MC_TAG);
    const next = reconcileGames(s, [TR], makeId).state;
    expect(next.rules.every((r) => r.tagId !== MC_TAG)).toBe(true);
    expect(next.videos.a).toEqual([{ tagId: "speed", source: "manual" }]);
    expect(next.suppressed.b).toBeUndefined();
    expect(next.seededGames).toEqual(["tr"]);
    expect(allTags(next, [TR]).map((t) => t.id)).toEqual([TR_TAG, "speed"]);
  });
});

describe("videoKey", () => {
  it("prefers the YouTube id so a moved file keeps its tags", () => {
    const a = videoKey({ path: "C:\\a\\x.mp4", sourceId: "dQw4w9WgXcQ" });
    const b = videoKey({ path: "D:\\moved\\renamed.mp4", sourceId: "dQw4w9WgXcQ" });
    expect(a).toBe(b);
    expect(videoKey({ path: "C:\\a\\x.mp4", sourceId: null, sourceUrl: "https://youtu.be/dQw4w9WgXcQ" })).toBe(a);
  });

  it("falls back to the normalized path", () => {
    expect(videoKey({ path: "C:/A/X.mp4", sourceId: null })).toBe("path:c:\\a\\x.mp4");
  });
});

describe("plain tags and storage", () => {
  it("creating a tag reuses one with the same name", () => {
    const first = createPlainTag(state(), "  speedrun ", () => "new");
    expect(first.tag?.id).toBe("speed");
    const second = createPlainTag(state(), "Lore", () => "lore");
    expect(second.state.tags.map((t) => t.id)).toEqual(["speed", "lore"]);
  });

  it("normalize keeps one game tag per video and drops junk", () => {
    const s = normalizeLibraryTags({
      tags: [{ id: "a", name: "A" }, { id: "game:x", name: "bad" }, { name: "no id" }],
      rules: [{ id: "r", field: "nope", op: "regex", text: "x", tagId: "a" }],
      videos: {
        k: [
          { tagId: MC_TAG, source: "manual" },
          { tagId: TR_TAG, source: "rule:r" },
          { tagId: "a", source: "weird" },
        ],
      },
    });
    expect(s.tags).toEqual([{ id: "a", name: "A" }]);
    expect(s.rules[0]).toMatchObject({ field: "title", op: "includes", enabled: true });
    expect(s.videos.k).toEqual([{ tagId: MC_TAG, source: "manual" }]);
  });

  it("the newer snapshot wins whole", () => {
    const a = parseLibraryTagsSnapshot(serializeLibraryTags(state(), 10));
    const b = parseLibraryTagsSnapshot(serializeLibraryTags(EMPTY_LIBRARY_TAGS, 20));
    expect(pickNewerSnapshot(a, b).source).toBe("file");
    expect(pickNewerSnapshot(b, a).source).toBe("local");
    expect(pickNewerSnapshot(a, null).source).toBe("local");
    expect(parseLibraryTagsSnapshot("{bad")).toBeNull();
  });
});
