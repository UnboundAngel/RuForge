import { describe, expect, it } from "vitest";
import {
  EMPTY_SESSION,
  applyEnded,
  applyPlan,
  applyWatch,
  isStarted,
  parseSessions,
  pickWatchTarget,
  planPlayFrom,
  planResume,
  planShuffle,
  planStartOver,
  reconcileOrder,
  setStartKey,
} from "./logic";

const KEYS = ["a", "b", "c", "d"];

/** Deterministic "random" that always picks index 0, which reverses a Fisher-Yates pass. */
const lowRandom = () => 0;

describe("resume", () => {
  it("falls back to the start video, then the first item, when nothing played", () => {
    expect(planResume(EMPTY_SESSION, KEYS)?.currentKey).toBe("a");
    expect(planResume(setStartKey(EMPTY_SESSION, "c"), KEYS)?.currentKey).toBe("c");
  });

  it("continues the current video in playlist order with no completion threshold", () => {
    const s = applyWatch(EMPTY_SESSION, "b", 10);
    const plan = planResume(s, KEYS)!;
    expect(plan.currentKey).toBe("b");
    expect(plan.order).toEqual(KEYS);
    expect(plan.shuffled).toBe(false);
  });

  it("keeps the shuffled order and folds in videos added since", () => {
    const shuffled = applyPlan(EMPTY_SESSION, planShuffle(KEYS, lowRandom)!, 1);
    const stored = shuffled.order;
    const plan = planResume(shuffled, [...KEYS, "e"])!;
    expect(plan.shuffled).toBe(true);
    expect(plan.order).toEqual([...stored, "e"]);
    expect(plan.currentKey).toBe(shuffled.currentKey);
  });

  it("ignores a current video that left the playlist", () => {
    const s = applyWatch(EMPTY_SESSION, "gone", 1);
    expect(planResume(s, KEYS)?.currentKey).toBe("a");
  });

  it("returns null for an empty playlist", () => {
    expect(planResume(EMPTY_SESSION, [])).toBeNull();
  });
});

describe("start over", () => {
  it("begins at the start video in playlist order and clears the shuffle", () => {
    const shuffled = setStartKey(applyPlan(EMPTY_SESSION, planShuffle(KEYS, lowRandom)!, 1), "c");
    const plan = planStartOver(shuffled, KEYS)!;
    expect(plan).toEqual({ order: KEYS, currentKey: "c", shuffled: false });
    expect(applyPlan(shuffled, plan, 2).order).toEqual([]);
    expect(applyPlan(shuffled, plan, 2).shuffled).toBe(false);
  });

  it("defaults to the first item when the start video is gone", () => {
    expect(planStartOver(setStartKey(EMPTY_SESSION, "gone"), KEYS)?.currentKey).toBe("a");
  });
});

describe("shuffle", () => {
  it("counts as started and persists the order for resume", () => {
    const plan = planShuffle(KEYS, lowRandom)!;
    const s = applyPlan(EMPTY_SESSION, plan, 5);
    expect(isStarted(s)).toBe(true);
    expect(s.order).toEqual(plan.order);
    expect([...s.order].sort()).toEqual(KEYS);
    expect(planResume(s, KEYS)!.order).toEqual(plan.order);
  });

  it("play from keeps a shuffled order but does not reshuffle", () => {
    const s = applyPlan(EMPTY_SESSION, planShuffle(KEYS, lowRandom)!, 5);
    const plan = planPlayFrom(s, KEYS, "d")!;
    expect(plan.order).toEqual(s.order);
    expect(plan.currentKey).toBe("d");
    expect(planPlayFrom(s, KEYS, "nope")).toBeNull();
  });
});

describe("advance at end", () => {
  it("moves current to the next item when a video ends", () => {
    const s = applyWatch(EMPTY_SESSION, "b", 1);
    expect(applyEnded(s, KEYS, "b", 2).currentKey).toBe("c");
  });

  it("follows the shuffled order", () => {
    const s = applyPlan(EMPTY_SESSION, planShuffle(KEYS, lowRandom)!, 1);
    const [first, second] = s.order;
    expect(applyEnded(s, KEYS, first!, 2).currentKey).toBe(second);
  });

  it("clears current after the last item and resume then restarts at the start video", () => {
    const s = applyEnded(applyWatch(EMPTY_SESSION, "d", 1), KEYS, "d", 2);
    expect(s.currentKey).toBeNull();
    expect(isStarted(s)).toBe(true);
    expect(planResume(s, KEYS)?.currentKey).toBe("a");
  });

  it("leaves the session alone when the ended video is not in the playlist", () => {
    const s = applyWatch(EMPTY_SESSION, "b", 1);
    expect(applyEnded(s, KEYS, "zzz", 2)).toBe(s);
  });
});

describe("watching from elsewhere", () => {
  it("moves the resume point of a started playlist", () => {
    const started = applyWatch(EMPTY_SESSION, "a", 1);
    const moved = applyWatch(started, "c", 9);
    expect(moved.currentKey).toBe("c");
    expect(moved.lastPlayedAt).toBe(9);
    expect(moved.startedAt).toBe(1);
  });

  it("targets the launching playlist, else the most recently played started one", () => {
    const sessions = {
      old: applyWatch(EMPTY_SESSION, "a", 5),
      recent: applyWatch(EMPTY_SESSION, "a", 50),
      untouched: setStartKey(EMPTY_SESSION, "a"),
    };
    expect(pickWatchTarget(sessions, ["old", "recent", "untouched"], null)).toBe("recent");
    expect(pickWatchTarget(sessions, ["old", "recent"], "old")).toBe("old");
    expect(pickWatchTarget(sessions, ["untouched"], null)).toBeNull();
    expect(pickWatchTarget(sessions, ["recent"], "elsewhere")).toBe("recent");
  });
});

describe("persistence shape", () => {
  it("reads a saved file and survives junk", () => {
    const s = applyPlan(EMPTY_SESSION, planShuffle(KEYS, lowRandom)!, 3);
    const round = parseSessions(JSON.parse(JSON.stringify({ version: 1, sessions: { p: s } })));
    expect(round.p).toEqual(s);
    expect(parseSessions(null)).toEqual({});
    expect(parseSessions({ sessions: { p: 7, q: { order: [1, "x"], shuffled: "yes" } } })).toEqual({
      q: { ...EMPTY_SESSION, order: ["x"] },
    });
  });

  it("reconcileOrder drops removed and appends new", () => {
    expect(reconcileOrder(["c", "x", "a"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });
});
