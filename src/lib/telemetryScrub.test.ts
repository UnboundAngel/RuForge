import { beforeEach, describe, expect, it } from "vitest";

import {
  remainsSensitive,
  scrubText,
  scrubTextOrDrop,
  setPathRoots,
  telemetryBeforeBreadcrumb,
  telemetryBeforeSend,
} from "./telemetryScrub";

describe("telemetryScrub", () => {
  beforeEach(() => {
    setPathRoots([]);
  });

  it("scrubs URL in exception-style text", () => {
    const scrubbed = scrubTextOrDrop(
      "failed for https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(scrubbed).not.toBeNull();
    expect(scrubbed!).not.toContain("youtube.com");
    expect(scrubbed!).toContain("[url]");
  });

  it("scrubs Windows path in breadcrumb-style text", () => {
    const scrubbed = scrubTextOrDrop(String.raw`delete failed C:\Users\Angel\Videos\song.mp4`);
    expect(scrubbed).not.toBeNull();
    expect(scrubbed!).not.toContain(String.raw`C:\Users`);
    expect(scrubbed!).toContain("[path]");
  });

  it("scrubs yt-dlp stderr lines", () => {
    const stderr = "ERROR: Downloading webpage\nERROR: Extracting URL\nfile saved\n";
    const scrubbed = scrubText(stderr);
    expect(scrubbed).not.toContain("Downloading webpage");
    expect(scrubbed).toContain("[yt-dlp-output]");
  });

  it("scrubs cookie CLI args", () => {
    const scrubbed = scrubText(
      String.raw`yt-dlp --cookies-from-browser C:\tmp\cookies.txt run`,
    );
    expect(scrubbed).toContain("--cookies [redacted]");
    expect(scrubbed).not.toContain("cookies.txt");
  });

  it("scrubs UNC paths", () => {
    const scrubbed = scrubTextOrDrop(String.raw`share \\nas\media\video.mp4 missing`);
    expect(scrubbed).not.toContain(String.raw`\\nas`);
    expect(scrubbed).toContain("[path]");
  });

  it("replaces dynamic path roots", () => {
    setPathRoots([String.raw`C:\RuForge\Media`]);
    const scrubbed = scrubText(String.raw`scan failed under C:\RuForge\Media\Artist\track.mp4`);
    expect(scrubbed).not.toContain("RuForge");
    expect(scrubbed).toContain("[library-path]");
    expect(remainsSensitive(scrubbed)).toBe(false);
  });

  it("drops text when YouTube keyword survives scrub", () => {
    expect(scrubTextOrDrop("youtube cache flush failed")).toBeNull();
  });

  it("passes scrubbed Windows path through drop gate", () => {
    const scrubbed = scrubTextOrDrop(String.raw`failed at C:\secret\keep.mp4`);
    expect(scrubbed).not.toBeNull();
    expect(scrubbed!).toContain("[path]");
    expect(scrubbed!).not.toContain("secret");
  });

  it("drops console breadcrumbs unconditionally", () => {
    expect(
      telemetryBeforeBreadcrumb({ category: "console", message: "safe startup" }),
    ).toBeNull();
  });

  it("passes clean breadcrumbs through beforeBreadcrumb", () => {
    const out = telemetryBeforeBreadcrumb({ category: "navigation", message: "startup complete" });
    expect(out).toEqual({ category: "navigation", message: "startup complete" });
  });

  it("drops dirty breadcrumbs in beforeBreadcrumb", () => {
    expect(
      telemetryBeforeBreadcrumb({ category: "ui", message: "youtube cache flush failed" }),
    ).toBeNull();
  });

  it("passes clean events through beforeSend", () => {
    const out = telemetryBeforeSend({
      message: "startup complete",
      exception: { values: [{ type: "RuntimeError", value: "channel closed" }] },
    });
    expect(out).toEqual({
      message: "startup complete",
      exception: { values: [{ type: "RuntimeError", value: "channel closed" }] },
    });
  });

  it("drops beforeSend event when exception value fails drop gate", () => {
    const out = telemetryBeforeSend({
      exception: {
        values: [{ type: "DownloadError", value: "youtube cache flush failed" }],
      },
    });
    expect(out).toBeNull();
  });

  it("scrubs exception URL in beforeSend", () => {
    const out = telemetryBeforeSend({
      exception: {
        values: [
          {
            type: "DownloadError",
            value: "failed for https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          },
        ],
      },
    });
    expect(out).not.toBeNull();
    expect(out!.exception!.values![0].value).toContain("[url]");
    expect(out!.exception!.values![0].value).not.toContain("youtube.com");
  });

  it("strips console breadcrumbs from beforeSend output", () => {
    const out = telemetryBeforeSend({
      breadcrumbs: [
        { category: "console", message: "invoke failed" },
        { category: "navigation", message: "tab changed" },
      ],
    });
    expect(out!.breadcrumbs).toEqual([{ category: "navigation", message: "tab changed" }]);
  });
});
