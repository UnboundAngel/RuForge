import type { PollData, PollLoad } from "./pollApi";

// Dev-only fixtures so each page state can be screenshotted without the Pages Function.
const BASE: PollData = {
  id: "mock",
  title: "Which should come first?",
  body: "Two things are competing for the next release. Pick the one you would use more.",
  ends: "2026-12-01",
  closed: false,
  options: [
    { id: "a", label: "Download history log", count: 0 },
    { id: "b", label: "Scheduled downloads", count: 0 },
    { id: "c", label: "Subtitle search", count: 0 },
  ],
  total: 0,
  voted: null,
};

const COUNTS = [64, 41, 23];

function withCounts(poll: PollData, voted: string | null, closed: boolean): PollData {
  const options = poll.options.map((o, i) => ({ ...o, count: COUNTS[i] ?? 0 }));
  return { ...poll, options, total: COUNTS.reduce((a, b) => a + b, 0), voted, closed };
}

export function mockLoad(kind: string): PollLoad {
  if (kind === "missing") return { kind: "missing" };
  if (kind === "down") return { kind: "down" };
  if (kind === "voted") return { kind: "ready", poll: withCounts(BASE, "b", false) };
  if (kind === "closed") return { kind: "ready", poll: withCounts(BASE, "a", true) };
  return { kind: "ready", poll: BASE };
}

export function mockVote(option: string): PollData {
  return withCounts(BASE, option, false);
}
