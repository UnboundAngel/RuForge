// Demo clip recorder for the real running dev app over WebView2 CDP. Run with --help.
// Sibling of shot.mjs; parts live in scripts/dev/record/.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { HELP, fail, parseArgs } from './record/args.mjs';
import { startCapture } from './record/capture.mjs';
import { Mouse, isModeOn, setMode } from './record/cursor.mjs';
import { encode, findFfmpeg, jpegSize, poster } from './record/ffmpeg.mjs';
import { createRunner, expandSteps } from './record/steps.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const opts = parseArgs(process.argv.slice(2));
if (opts.flags.has('--help') || opts.flags.has('-h') || (!opts.name && !opts.steps.length)) {
  console.log(HELP);
  process.exit(0);
}
if (!opts.name) fail('give the clip a <name>');

const num = (v, d) => (v === undefined ? d : Number(v));
const fps = num(opts.fps, 60);
const crf = num(opts.crf, 20);
const lead = num(opts.lead, 400);
const tail = num(opts.tail, 600);
const port = opts.port ?? process.env.RUFORGE_CDP_PORT ?? '9222';
const outDir = opts.out ? join(process.cwd(), opts.out) : join(repoRoot, '.screenshots');

let ffmpeg;
let steps;
try {
  ffmpeg = findFfmpeg(opts.ffmpeg, repoRoot);
  steps = expandSteps(opts.steps);
} catch (e) {
  fail(e.message);
}

let browser;
try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 });
} catch {
  fail(`RuForge dev app not reachable on 127.0.0.1:${port}. Start it with: npm run dev:app:debug`);
}

const pages = browser.contexts().flatMap((c) => c.pages());
const SECONDARY = /explorer|island|music-mini|companion|rfWindow=/i;
const APP = /^(https?:\/\/(localhost|127\.0\.0\.1|tauri\.localhost)[:/]|tauri:)/i;
const page = opts.page
  ? pages.find((p) => p.url().includes(opts.page))
  : pages.find((p) => APP.test(p.url()) && !SECONDARY.test(p.url())) ?? pages[0];
if (!page) fail(`no page matches ${opts.page ?? '(main)'}. Run shot.mjs --list`);

const start = opts['cursor-start']?.split(',').map(Number);
const cursor = new Mouse(page, start ? { x: start[0], y: start[1] } : null);
const useMode = !opts.flags.has('--no-cursor');
const wasOn = await isModeOn(page);
const marks = {};
const run = createRunner({ page, cursor, marks, now: () => Date.now() / 1000 });
const tmp = mkdtempSync(join(tmpdir(), 'ruforge-rec-'));
let capture;
let failure;

try {
  // Switched on before capture starts so the toggle re-render is not in the clip.
  if (useMode && !wasOn) {
    await setMode(page, true);
    await page.waitForTimeout(250);
  }
  capture = await startCapture(page, tmp);
  await cursor.init();
  await page.waitForTimeout(lead);
  for (const [kind, arg] of steps) {
    try {
      await run(kind, arg);
    } catch (e) {
      throw new Error(`step --${kind} ${arg}: ${e.message.split('\n')[0]}`);
    }
  }
  await page.waitForTimeout(tail);
} catch (e) {
  failure = e;
} finally {
  if (useMode && !wasOn) await setMode(page, false).catch(() => {});
}

const { frames, endTs } = capture ? await capture.stop() : { frames: [], endTs: 0 };
try {
  if (failure) throw failure;
  if (!frames.length) throw new Error('no frames captured; is the window visible and not minimized?');
  const t0 = frames[0].ts;
  const rel = (abs) => Math.max(0, abs - t0);
  const total = endTs - t0;
  const markAt = (name) => {
    if (!(name in marks)) throw new Error(`mark "${name}" was never set`);
    return rel(marks[name]);
  };
  const trimStart = opts['trim-start'] ? markAt(opts['trim-start']) : 0;
  const trimEnd = opts['trim-end'] ? markAt(opts['trim-end']) : null;

  const src = jpegSize(frames[0].file);
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const width = even(opts.width ? Number(opts.width) : src.w * num(opts.scale, 1));
  const height = even((width * src.h) / src.w);

  mkdirSync(outDir, { recursive: true });
  const mp4 = join(outDir, `${opts.name}.mp4`);
  encode({ ffmpeg, frames, endTs, total, fps, crf, width, height, trimStart, trimEnd, listPath: join(tmp, 'frames.txt'), outPath: mp4 });

  const seconds = (trimEnd ?? total) - trimStart;
  const posterAt = opts['poster-mark'] ? Math.min(Math.max(0, markAt(opts['poster-mark']) - trimStart), Math.max(0, seconds - 0.05)) : 0;
  poster(ffmpeg, mp4, posterAt, join(outDir, `${opts.name}-poster.webp`));

  const outMarks = {};
  for (const [k, v] of Object.entries(marks)) outMarks[k] = Number((rel(v) - trimStart).toFixed(3));
  writeFileSync(join(outDir, `${opts.name}.marks.json`), JSON.stringify({ seconds: Number(seconds.toFixed(3)), fps, width, height, marks: outMarks }, null, 2));
  const show = (f) => relative(process.cwd(), join(outDir, f)).replaceAll('\\', '/');
  console.log([`${opts.name}.mp4`, `${opts.name}-poster.webp`, `${opts.name}.marks.json`].map(show).join('\n'));
} catch (e) {
  console.error(`record failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (!opts.flags.has('--keep-frames')) rmSync(tmp, { recursive: true, force: true });
  else console.log(`frames kept in ${tmp}`);
}

// No browser.close(): exiting drops the CDP socket and leaves the app running.
process.exit(process.exitCode ?? 0);
