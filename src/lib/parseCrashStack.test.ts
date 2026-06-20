import { describe, expect, it } from "vitest";

import {
  formatCrashMessage,
  inferErrorName,
  parseCrashDetails,
} from "./parseCrashStack";

describe("parseCrashDetails", () => {
  it("keeps message plus first app frame only", () => {
    const message = "TypeError: Cannot read properties of undefined (reading 'map')";
    const detail =
      "    at MediaView (src/components/MediaView.tsx:142:18)\n    at App (src/App.tsx:1804:19)\n    at renderWithHooks (react-dom.development.js:15486:18)";

    const parsed = parseCrashDetails(message, detail);

    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]?.file).toBe("exception/TypeError");
    expect(parsed.sections[0]?.defaultOpen).toBe(false);
    expect(parsed.sections[1]?.file).toBe("src/components/MediaView.tsx");
    expect(parsed.sections[1]?.lineHint).toBe("L142:18");
    expect(parsed.sections[1]?.defaultOpen).toBe(true);
  });

  it("infers TypeError when React only passes the message string", () => {
    expect(inferErrorName("Cannot read properties of undefined (reading 'trim')")).toBe(
      "TypeError",
    );
    expect(formatCrashMessage("Cannot read properties of undefined (reading 'trim')")).toBe(
      "TypeError: Cannot read properties of undefined (reading 'trim')",
    );
  });

  it("strips vite query params from dev stack paths", () => {
    const detail =
      "    at MusicRowContextMenu (http://localhost:1420/src/components/music/MusicRowContextMenu.tsx?t=123:29:39)";

    const parsed = parseCrashDetails(
      "Cannot read properties of undefined (reading 'trim')",
      detail,
      { errorName: "TypeError" },
    );

    expect(parsed.sections[1]?.file).toBe("src/components/music/MusicRowContextMenu.tsx");
    expect(parsed.sections[1]?.lineHint).toBe("L29:39");
  });

  it("wraps plain fatal detail when there is no stack", () => {
    const message = "Out of memory";
    const detail = "The WebView2 renderer process exited unexpectedly.";

    const parsed = parseCrashDetails(message, detail);

    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[1]?.file).toBe("runtime/details");
    expect(parsed.sections[1]?.body).toContain("WebView2");
  });
});
