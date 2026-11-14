import { beforeAll, describe, expect, it, vi } from "vitest";
import type { MediaFile } from "../../types";
import {
  EMPTY_VIDEO_QUEUE,
  nextVideo,
  previousVideo,
  queueAdd,
  queueOnStarted,
  queuePlayNext,
  videoEndPlan,
} from "./logic";

const f = (name: string) => ({ path: `C:\\v\\${name}.mp4`, name, duration: 60 }) as MediaFile;
const [a, b, c, d, q1, q2] = ["a", "b", "c", "d", "q1", "q2"].map(f) as [
  MediaFile,
  MediaFile,
  MediaFile,
  MediaFile,
  MediaFile,
  MediaFile,
];
const order = [a, b, c, d];

describe("queue edits", () => {
  it("play next goes to the front, add goes to the back, no doubles", () => {
    let s = queueAdd(EMPTY_VIDEO_QUEUE, q1);
    s = queuePlayNext(s, q2);
    expect(s.items).toEqual([q2, q1]);
    expect(queueAdd(s, q1)).toBe(s);
    expect(queuePlayNext(s, q1).items).toEqual([q1, q2]);
  });
});

describe("next and previous", () => {
  it("plays queued videos before the order, then resumes after the interrupted video", () => {
    let s = queueAdd(queueAdd(EMPTY_VIDEO_QUEUE, q1), q2);
    expect(nextVideo(b, order, s)).toBe(q1);

    s = queueOnStarted(s, q1, b);
    expect(s.items).toEqual([q2]);
    expect(s.resumeAfter).toBe(b);
    expect(nextVideo(q1, order, s)).toBe(q2);

    s = queueOnStarted(s, q2, q1);
    expect(s.resumeAfter).toBe(b);
    expect(nextVideo(q2, order, s)).toBe(c);
    expect(previousVideo(q2, order, s)).toBe(a);

    s = queueOnStarted(s, c, q2);
    expect(s.resumeAfter).toBeNull();
    expect(nextVideo(c, order, s)).toBe(d);
  });

  it("stops at the ends of the order", () => {
    expect(nextVideo(d, order, EMPTY_VIDEO_QUEUE)).toBeNull();
    expect(previousVideo(a, order, EMPTY_VIDEO_QUEUE)).toBeNull();
  });
});

describe("end plan", () => {
  beforeAll(() => {
    // Suggestion picking reads watched state from localStorage.
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });

  it("is null outside a playlist or queue", () => {
    expect(videoEndPlan(b, order, false, EMPTY_VIDEO_QUEUE)).toBeNull();
  });

  it("autoplays the next playlist item mid-list and not at the last item", () => {
    expect(videoEndPlan(b, order, true, EMPTY_VIDEO_QUEUE)?.autoplay).toBe(true);
    expect(videoEndPlan(b, order, true, EMPTY_VIDEO_QUEUE)?.suggestions[0]).toBe(c);
    expect(videoEndPlan(d, order, true, EMPTY_VIDEO_QUEUE)?.autoplay).toBe(false);
  });

  it("puts queued videos first", () => {
    const s = queueAdd(EMPTY_VIDEO_QUEUE, q1);
    expect(videoEndPlan(b, order, true, s)).toEqual({ suggestions: [q1], autoplay: true });
  });

  it("continues the order after a queued video ends", () => {
    const s = { items: [], resumeAfter: b };
    expect(videoEndPlan(q1, order, false, s)?.suggestions[0]).toBe(c);
  });
});
