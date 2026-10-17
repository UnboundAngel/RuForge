import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// RUFORGE_PUBLIC_BUILD=1 forces the stub even when src/games exists (installer builds).
// @ts-expect-error process is a nodejs global
const publicBuild = process.env.RUFORGE_PUBLIC_BUILD === "1";

const gamesEntry = !publicBuild && fs.existsSync(path.resolve(__dirname, "src/games/index.ts"))
  ? path.resolve(__dirname, "src/games/index.ts")
  : path.resolve(__dirname, "src/games-stub/index.ts");

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@games": gamesEntry,
    },
  },
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1431 } : undefined,
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/website/**",
        "**/*.md",
        "**/*.mdc",
        "**/*.txt",
        "**/*.jsonl",
        // Release note drafts stay watched so the Debugging draft preview shows edits on reload.
        (p: string) => {
          const rel = p.replace(/\\/g, "/").split("/docs/")[1];
          if (rel === undefined) return false;
          return !/^(agents|agents\/release|agents\/release\/notes-[^/]+\.json)$/.test(rel);
        },
        "**/scripts/**",
        "**/.cursor/**",
        "**/.screenshots/**",
      ],
    },
    headers: { "Cache-Control": "no-store" },
  },
  test: {
    environment: "node",
  },
}));
