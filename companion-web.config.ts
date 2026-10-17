import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Names the shell cache after the build so a new build always swaps the shell and never mixes old and new assets.
function stampServiceWorker(): Plugin {
  let outDir = "";
  return {
    name: "stamp-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = path.join(outDir, "sw.js");
      if (!fs.existsSync(swPath)) return;
      const hash = createHash("sha256");
      for (const name of ["index.html", ...fs.readdirSync(path.join(outDir, "assets")).sort()]) {
        const file = name === "index.html" ? path.join(outDir, name) : path.join(outDir, "assets", name);
        hash.update(name).update(fs.readFileSync(file));
      }
      const sw = fs.readFileSync(swPath, "utf8").replace('"rf-shell-v2"', `"rf-shell-${hash.digest("hex").slice(0, 10)}"`);
      fs.writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  root: path.resolve(__dirname, "src-tauri/companion-web-src"),
  plugins: [react(), stampServiceWorker()],
  build: {
    outDir: path.resolve(__dirname, "src-tauri/companion-web"),
    emptyOutDir: true,
  },
  base: "/",
});
