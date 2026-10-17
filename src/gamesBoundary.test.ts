import { describe, expect, it } from "vitest";

/** Core modules only; Games tree is excluded from the glob. */
const coreSources = import.meta.glob(
  [
    "./**/*.{ts,tsx}",
    "!./games/**",
    "!./games-stub/**",
    "!./gamesBoundary.test.ts",
    "!**/*.test.ts",
    "!**/*.test.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** Import path that reaches into the Games tree instead of the `@games` barrel. */
function isDirectGamesImport(spec: string): boolean {
  if (spec === "@games" || spec.startsWith("@games/")) return false;
  if (spec === "@/games" || spec.startsWith("@/games/")) return true;
  if (spec === "games" || spec.startsWith("games/")) return true;
  if (/(?:^|\/)games(?:\/|$)/.test(spec) && !spec.includes("games-stub")) return true;
  return false;
}

const IMPORT_RE = /from\s+["']([^"']+)["']/g;

describe("games boundary", () => {
  it("core files import Games only through @games", () => {
    const leaks: string[] = [];
    for (const [file, text] of Object.entries(coreSources)) {
      IMPORT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IMPORT_RE.exec(text))) {
        if (isDirectGamesImport(m[1])) {
          leaks.push(`${file.replace(/^\.\//, "src/")}: ${m[1]}`);
        }
      }
    }
    expect(leaks, `direct src/games imports:\n${leaks.join("\n")}`).toEqual([]);
  });
});
