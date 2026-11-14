import { describe, expect, it } from "vitest";
import {
  classifyDownloadFailure,
  plainDownloadFailureMessage,
  shouldAutoRetryFailure,
} from "./downloadFailureReason";

describe("classifyDownloadFailure", () => {
  it.each([
    ["ERROR: [youtube] abc: Private video. Sign in if you've been granted access", "private"],
    ["ERROR: [youtube] abc: Video unavailable. This video has been removed by the uploader", "deleted"],
    ["ERROR: Join this channel to get access to members-only content", "members_only"],
    ["ERROR: Sign in to confirm your age. This video may be inappropriate for some users", "age_restricted"],
    ["ERROR: The uploader has not made this video available in your country", "region_blocked"],
    ["ERROR: Unable to download webpage: <urlopen error timed out>", "network"],
    ["something strange", "other"],
    ["", "other"],
  ])("%s -> %s", (raw, kind) => {
    expect(classifyDownloadFailure(raw)).toBe(kind);
  });

  it("classifies its own plain messages the same way", () => {
    for (const raw of [
      "Private video. Sign in if you've been granted access",
      "Video unavailable",
      "members-only content",
      "Sign in to confirm your age",
      "not available in your country",
      "connection reset",
    ]) {
      const kind = classifyDownloadFailure(raw);
      expect(classifyDownloadFailure(plainDownloadFailureMessage(raw))).toBe(kind);
    }
  });

  it("keeps unknown errors verbatim", () => {
    expect(plainDownloadFailureMessage("weird failure")).toBe("weird failure");
  });
});

describe("shouldAutoRetryFailure", () => {
  it("skips permanent reasons", () => {
    expect(shouldAutoRetryFailure("failed", "Private video")).toBe(false);
    expect(shouldAutoRetryFailure("failed", "Video unavailable")).toBe(false);
    expect(shouldAutoRetryFailure("failed", "members-only content")).toBe(false);
  });

  it("retries transient failures and timeouts", () => {
    expect(shouldAutoRetryFailure("failed", "connection reset")).toBe(true);
    expect(shouldAutoRetryFailure("failed", "unknown")).toBe(true);
    expect(shouldAutoRetryFailure("timed_out", "Private video")).toBe(true);
  });
});
