#!/usr/bin/env node
// Turns a raw screen capture into a What's new clip: src/assets/whats-new/<area>.mp4 + <area>-poster.webp.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFfmpeg, poster } from './record/ffmpeg.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(repoRoot, 'src', 'assets', 'whats-new');
const TARGET_BYTES = 400 * 1024;
const CRF_START = 28;
const CRF_CAP = 40;

const HELP = `Usage: node scripts/dev/whats-new-clip.mjs <input-video> <area> [options]

  <area>            lowercased area key from the release notes (spaces become "-")
  --start <s>       trim start in seconds
  --end <s>         trim end in seconds
  --width <px>      output width, aspect kept (default 1280)
  --crf <n>         first CRF to try (default ${CRF_START}); raised until the file is under 400 KB, cap ${CRF_CAP}
  --poster-at <s>   poster time inside the trimmed clip (default 0.5)
  --ffmpeg <path>   ffmpeg binary (else FFMPEG, PATH, the app's downloaded ffmpeg)
  --help            this text

Writes src/assets/whats-new/<area>.mp4 (H.264, no audio) and <area>-poster.webp.`;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { positional: [] };
  const valued = new Set(['start', 'end', 'width', 'crf', 'poster-at', 'ffmpeg']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      if (!valued.has(key)) fail(`Unknown option ${a}\n\n${HELP}`);
      if (i + 1 >= argv.length) fail(`${a} needs a value`);
      opts[key] = argv[++i];
    } else opts.positional.push(a);
  }
  return opts;
}

function num(opts, key, fallback) {
  if (opts[key] == null) return fallback;
  const n = Number(opts[key]);
  if (!Number.isFinite(n) || n < 0) fail(`--${key} must be a non-negative number`);
  return n;
}

// ffmpeg -i with no output exits non-zero but prints the stream info we need on stderr.
function sourceFps(ffmpeg, input) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', input], { encoding: 'utf8' });
  const m = /(\d+(?:\.\d+)?) fps/.exec(r.stderr || '');
  return m ? Number(m[1]) : 30;
}

function encode(ffmpeg, input, outPath, { start, end, width, fps, crf }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (start > 0) args.push('-ss', String(start));
  if (end != null) args.push('-to', String(end));
  args.push(
    '-i', input,
    '-vf', `fps=${fps},scale=${width}:-2:flags=lanczos`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', outPath,
  );
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  if (r.status !== 0) fail(`ffmpeg failed: ${(r.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return console.log(HELP);
  const [input, areaArg] = opts.positional;
  if (!input || !areaArg || opts.positional.length > 2) fail(HELP);
  if (!existsSync(input)) fail(`Input not found: ${input}`);

  const area = areaArg.trim().toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(area)) fail(`Area "${areaArg}" must be letters, digits and spaces/hyphens`);

  const start = num(opts, 'start', 0);
  const end = opts.end == null ? null : num(opts, 'end', 0);
  if (end != null && end <= start) fail('--end must be greater than --start');
  const width = Math.round(num(opts, 'width', 1280));
  if (width < 2) fail('--width is too small');
  const crfStart = Math.round(num(opts, 'crf', CRF_START));
  const posterAt = num(opts, 'poster-at', 0.5);

  let ffmpeg;
  try {
    ffmpeg = findFfmpeg(opts.ffmpeg, repoRoot);
  } catch (e) {
    fail(e.message);
  }

  const fps = Math.min(60, Math.max(1, Math.round(sourceFps(ffmpeg, input))));
  const outFps = fps >= 45 ? fps : 30;
  mkdirSync(outDir, { recursive: true });
  const mp4 = join(outDir, `${area}.mp4`);
  const webp = join(outDir, `${area}-poster.webp`);

  let crf = crfStart;
  let size;
  for (;;) {
    encode(ffmpeg, input, mp4, { start, end, width, fps: outFps, crf });
    size = statSync(mp4).size;
    if (size <= TARGET_BYTES || crf >= CRF_CAP) break;
    crf = Math.min(CRF_CAP, crf + 2);
  }
  poster(ffmpeg, mp4, posterAt, webp);

  console.log(`${mp4}\n${webp}`);
  console.log(`${(size / 1024).toFixed(0)} KB at CRF ${crf}, ${outFps} fps`);
  if (size > TARGET_BYTES) {
    console.warn(`Warning: over 400 KB at the CRF cap (${CRF_CAP}). Trim with --start/--end or lower --width.`);
  }
}

main();
