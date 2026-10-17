// Supervised Vite for `tauri dev`. Vite exits when its stdin ends or it gets SIGTERM, so a dying
// Tauri CLI pipe silently killed the dev server and left the webview on "localhost refused".
// CI=true turns off the stdin watcher; this loop restarts Vite on any other exit. The webview's
// HMR client reconnects and reloads by itself once the port is back.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const PORT = 1430;

mkdirSync(path.join(root, "logs"), { recursive: true });
const log = createWriteStream(path.join(root, "logs", "vite-dev.log"), { flags: "a" });
const note = (msg) => {
  const line = `[dev-vite ${new Date().toISOString()}] ${msg}\n`;
  log.write(line);
  process.stdout.write(line);
};

const portBusy = () =>
  new Promise((resolve) => {
    const sock = net.connect({ port: PORT, host: "127.0.0.1" });
    sock.once("connect", () => (sock.destroy(), resolve(true)));
    sock.once("error", () => resolve(false));
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let child = null;
let stopping = false;
const stop = () => {
  stopping = true;
  child?.kill();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

let fastExits = 0;
while (!stopping) {
  if (await portBusy()) {
    // Another Vite already serves 1430 (earlier run); stay alive so tauri keeps its dev session.
    await sleep(1000);
    continue;
  }
  const started = Date.now();
  note("starting vite");
  child = spawn(process.execPath, [viteBin], {
    cwd: root,
    env: { ...process.env, CI: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => (log.write(d), process.stdout.write(d)));
  child.stderr.on("data", (d) => (log.write(d), process.stderr.write(d)));
  const [code, signal] = await new Promise((resolve) => child.once("exit", (c, s) => resolve([c, s])));
  note(`vite exited code=${code} signal=${signal}`);
  fastExits = Date.now() - started < 5000 ? fastExits + 1 : 0;
  await sleep(Math.min(500 * 2 ** fastExits, 10000));
}
