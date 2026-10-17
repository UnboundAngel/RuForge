import { describe, expect, it } from "vitest";
import { featureIdFromPath } from "./lib/scheduled/registry";

/** Core modules only; scheduled feature folders are excluded from the glob. */
const coreSources = import.meta.glob(
  ["./**/*.{ts,tsx}", "!./scheduled/**", "!./scheduledBoundary.test.ts", "!**/*.test.ts", "!**/*.test.tsx"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const IMPORT_RE = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

/** Public builds have no `src/scheduled/`, so a direct import breaks them. */
function isDirectScheduledImport(spec: string): boolean {
  if (/(?:lib|components)\/scheduled\//.test(spec)) return false;
  return /(?:^|\/)scheduled\//.test(spec);
}

describe("scheduled boundary", () => {
  it("core reaches scheduled features only through the registry glob", () => {
    const leaks: string[] = [];
    for (const [file, text] of Object.entries(coreSources)) {
      IMPORT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IMPORT_RE.exec(text))) {
        if (isDirectScheduledImport(m[1])) leaks.push(`${file.replace(/^\.\//, "src/")}: ${m[1]}`);
      }
    }
    expect(leaks, `direct src/scheduled imports:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("reads the feature id from a glob path", () => {
    expect(featureIdFromPath("../../scheduled/some-feature/index.tsx")).toBe("some-feature");
    expect(featureIdFromPath("../../scheduled/some-feature/parts/index.ts")).toBeNull();
  });
});
