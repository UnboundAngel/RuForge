import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn<typeof import("@tauri-apps/api/core").invoke>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: Parameters<typeof invoke>) => invoke(...args),
}));

import { commentsSidecarPaths, loadVideoComments } from "./loadVideoComments";

describe("commentsSidecarPaths", () => {
  it("uses stem.comments.json beside the media file", () => {
    const paths = commentsSidecarPaths("D:/Library/Videos/My Clip/My Clip.mp4");
    expect(paths[0]).toBe("D:/Library/Videos/My Clip/My Clip.comments.json");
  });

  it("tries stripped yt-dlp stream suffix stems", () => {
    const paths = commentsSidecarPaths("D:/Library/Videos/My Clip/My Clip.f399.mp4");
    expect(paths).toContain("D:/Library/Videos/My Clip/My Clip.f399.comments.json");
    expect(paths).toContain("D:/Library/Videos/My Clip/My Clip.comments.json");
  });

  it("uses backslashes when media path is Windows-style", () => {
    const paths = commentsSidecarPaths(String.raw`C:\Library\Videos\Clip\Clip.webm`);
    expect(paths[0]).toBe(String.raw`C:\Library\Videos\Clip\Clip.comments.json`);
  });
});

describe("loadVideoComments", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("builds a reply tree from flat v1 sidecar comments on disk", async () => {
    const sidecar = {
      v: 1,
      video_id: "abc",
      comment_count: 2,
      fetched_at: "2026-06-15T22:30:00Z",
      comments: [
        {
          id: "c1",
          text: "root comment",
          author: "alice",
          parent: "root",
          like_count: 1,
          _time_text: "1d",
        },
        {
          id: "c2",
          text: "nested reply",
          author: "bob",
          parent: "c1",
          like_count: 0,
          _time_text: "1d",
        },
      ],
    };

    invoke.mockResolvedValueOnce(JSON.stringify(sidecar));

    const result = await loadVideoComments({
      mediaPath: "C:/Videos/Clip/Clip.mp4",
      sourceUrl: "https://youtube.com/watch?v=abc",
      downloadCommentsEnabled: true,
    });
    expect(invoke).toHaveBeenCalledWith("read_video_comments_sidecar", {
      mediaPath: "C:/Videos/Clip/Clip.mp4",
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]?.id).toBe("c1");
    expect(result.comments[0]?.replies).toHaveLength(1);
    expect(result.comments[0]?.replies[0]?.text).toBe("nested reply");
  });

  it("returns missing when sidecar is absent and download comments is off", async () => {
    invoke.mockResolvedValueOnce(null);
    await expect(
      loadVideoComments({
        mediaPath: "C:/Videos/Clip/Clip.mp4",
        downloadCommentsEnabled: false,
      }),
    ).resolves.toEqual({ status: "missing" });
  });

  it("returns error when ensure fetch fails", async () => {
    invoke.mockResolvedValueOnce(null);
    invoke.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(
      loadVideoComments({
        mediaPath: "C:/Videos/Clip/Clip.mp4",
        sourceUrl: "https://youtube.com/watch?v=abc",
        downloadCommentsEnabled: true,
      }),
    ).resolves.toEqual({ status: "error" });
    expect(invoke).toHaveBeenLastCalledWith("ensure_video_comments_sidecar", {
      mediaPath: "C:/Videos/Clip/Clip.mp4",
      sourceUrl: "https://youtube.com/watch?v=abc",
      browserCookies: null,
      cookieFile: null,
    });
  });
});
