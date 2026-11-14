// ffmpeg discovery and the frames -> constant-frame-rate mp4 encode.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const exe = process.platform === 'win32' ? '.exe' : '';

function runs(bin) {
  return spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0;
}

// Mirrors the order in src-tauri/src/tools/paths.rs: app data bin first, then the dev binaries folder.
function appCandidates(repoRoot) {
  const out = [];
  let id = 'com.attic.ruforge';
  try {
    id = JSON.parse(readFileSync(join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8')).identifier ?? id;
  } catch {}
  for (const base of [process.env.APPDATA, process.env.LOCALAPPDATA]) {
    if (!base) continue;
    for (const dir of [id, `${id}.dev`]) out.push(join(base, dir, 'bin', `ffmpeg${exe}`));
  }
  out.push(join(repoRoot, 'src-tauri', 'binaries', `ffmpeg-x86_64-pc-windows-msvc${exe}`));
  return out;
}

export function findFfmpeg(explicit, repoRoot) {
  if (explicit) {
    if (!runs(explicit)) throw new Error(`--ffmpeg ${explicit} did not run`);
    return explicit;
  }
  if (process.env.FFMPEG) {
    if (!runs(process.env.FFMPEG)) throw new Error(`FFMPEG env ${process.env.FFMPEG} did not run`);
    return process.env.FFMPEG;
  }
  if (runs('ffmpeg')) return 'ffmpeg';
  for (const p of appCandidates(repoRoot)) if (existsSync(p) && runs(p)) return p;
  throw new Error('ffmpeg not found. Pass --ffmpeg <path>, set FFMPEG, put it on PATH, or download it once in the app.');
}

function run(ffmpeg, args) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
}

// The concat demuxer gives every frame its real on-screen duration, so the fps filter
// duplicates or drops frames by timestamp and motion timing stays true.
export function encode({ ffmpeg, frames, endTs, total, fps, crf, width, height, trimStart, trimEnd, listPath, outPath }) {
  const lines = [];
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
    lines.push(`file '${f.file.replaceAll('\\', '/')}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`);
  });
  // The demuxer ignores the last duration unless the file repeats.
  lines.push(`file '${frames.at(-1).file.replaceAll('\\', '/')}'`);
  writeFileSync(listPath, lines.join('\n'));
  const args = ['-f', 'concat', '-safe', '0', '-i', listPath, '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos:in_range=pc:out_range=tv`];
  if (trimStart > 0) args.push('-ss', String(trimStart));
  if (trimEnd != null) args.push('-to', String(trimEnd));
  else args.push('-to', String(total));
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', outPath);
  run(ffmpeg, args);
}

export function poster(ffmpeg, videoPath, seconds, outPath) {
  run(ffmpeg, ['-ss', String(Math.max(0, seconds)), '-i', videoPath, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', outPath]);
}

// Pixel size from the JPEG start-of-frame marker, so no ffprobe is needed.
export function jpegSize(path) {
  const b = readFileSync(path);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('could not read frame size');
}
