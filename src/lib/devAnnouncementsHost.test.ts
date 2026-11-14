import { describe, expect, it } from "vitest";
import { announcementToItem } from "./devAnnouncementsHost";

const NOW = Date.parse("2026-10-17T10:00:00");

const poll = {
  id: "next-feature",
  kind: "poll" as const,
  title: "What should I build next?",
  body: "Pick one.",
  published: "2026-10-15",
  ends: "2026-10-20",
  link: null,
  options: [
    { id: "a", label: "Movies mode" },
    { id: "b", label: "Download history" },
  ],
};

describe("announcementToItem", () => {
  it("records a poll under a stable id with one pick action per option until it ends", () => {
    const item = announcementToItem(poll, NOW);
    expect(item.id).toBe("dev:next-feature");
    expect(item.kind).toBe("dev-poll");
    expect(item.actions).toEqual(["poll-pick-a", "poll-pick-b"]);
    expect(item.ref.devUrl).toBeUndefined();
  });

  it("offers no pick actions once the end date has passed", () => {
    const item = announcementToItem({ ...poll, ends: "2026-10-16" }, NOW);
    expect(item.actions).toEqual([]);
  });

  it("gives a notice an Open action only when it has a link", () => {
    const base = { ...poll, id: "update-note", kind: "notice" as const, ends: null };
    expect(announcementToItem(base, NOW).actions).toEqual([]);
    const linked = announcementToItem({ ...base, link: "https://ruforge.app/changelog" }, NOW);
    expect(linked.actions).toEqual(["open-link"]);
    expect(linked.ref.devUrl).toBe("https://ruforge.app/changelog");
  });
});
