#!/usr/bin/env node
/**
 * Prove the public snapshot tree typechecks without Games / private-only paths.
 *
 * Builds the would-be snapshot (sync/main tree minus private-only-paths.txt) into a
 * temporary git worktree under the OS temp dir, runs `npx tsc --noEmit -p .` and
 * `cargo check` there, then removes the worktree.
 *
 * Usage:
 *   node scripts/check-public-build.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listPath = join(root, 'scripts/private-only-paths.txt');
function run(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function privatePaths() {
  return readFileSync(listPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

const paths = privatePaths();
if (!paths.length) {
  console.error('private-only path list is empty');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'ruforge-public-build-'));
const indexFile = join(tmp, 'index');
const work = join(tmp, 'tree');
const env = { ...process.env, GIT_INDEX_FILE: indexFile };

let worktreeAdded = false;

try {
  // Working tree + index (so uncommitted isolation work is included), then strip private-only.
  run(['read-tree', 'HEAD'], { env });
  run(['add', '-A', '--', '.'], { env });
  for (const p of paths) {
    run(['rm', '-r', '--cached', '--ignore-unmatch', '--', p], { env });
  }
  const tree = run(['write-tree'], { env });
  const commit = run(['commit-tree', tree, '-m', 'check-public-build ephemeral']);
  run(['worktree', 'add', '--detach', work, commit]);
  worktreeAdded = true;

  // Reuse host installs; the ephemeral tree has no node_modules / cargo cache of its own.
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  const nm = join(root, 'node_modules');
  if (existsSync(nm) && !existsSync(join(work, 'node_modules'))) {
    symlinkSync(nm, join(work, 'node_modules'), linkType);
  }
  // Windows ffmpeg/ffprobe exes are gitignored; tauri build still expects them for check.
  const bins = join(root, 'src-tauri', 'binaries');
  const workBins = join(work, 'src-tauri', 'binaries');
  if (existsSync(bins) && existsSync(workBins)) {
    for (const name of ['ffmpeg-x86_64-pc-windows-msvc.exe', 'ffprobe-x86_64-pc-windows-msvc.exe']) {
      const src = join(bins, name);
      const dest = join(workBins, name);
      if (existsSync(src) && !existsSync(dest)) {
        try {
          symlinkSync(src, dest, 'file');
        } catch {
          copyFileSync(src, dest);
        }
      }
    }
  }

  console.log(`public-build worktree ${work} (tree ${tree.slice(0, 12)})`);

  const tsc = spawnSync('npx', ['tsc', '--noEmit', '-p', '.'], {
    cwd: work,
    encoding: 'utf8',
    shell: true,
  });
  process.stdout.write(tsc.stdout || '');
  process.stderr.write(tsc.stderr || '');
  if (tsc.status !== 0) {
    console.error('check-public-build: tsc failed');
    process.exit(tsc.status ?? 1);
  }

  const cargoEnv = {
    ...process.env,
    CARGO_TARGET_DIR: join(root, 'src-tauri', 'target'),
  };
  const cargo = spawnSync('cargo', ['check', '--tests'], {
    cwd: join(work, 'src-tauri'),
    encoding: 'utf8',
    env: cargoEnv,
  });
  process.stdout.write(cargo.stdout || '');
  process.stderr.write(cargo.stderr || '');
  if (cargo.status !== 0) {
    console.error('check-public-build: cargo check failed');
    process.exit(cargo.status ?? 1);
  }

  console.log('check-public-build: ok');
} finally {
  // Drop junctions/symlinks first so recursive delete cannot follow into the host tree.
  for (const rel of ['node_modules', 'src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe', 'src-tauri/binaries/ffprobe-x86_64-pc-windows-msvc.exe']) {
    const p = join(work, rel);
    try {
      if (existsSync(p) && lstatSync(p).isSymbolicLink()) unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
  if (worktreeAdded) {
    try {
      run(['worktree', 'remove', '--force', work]);
    } catch {
      rmSync(work, { recursive: true, force: true });
      try {
        run(['worktree', 'prune']);
      } catch {
        /* ignore */
      }
    }
  }
  rmSync(tmp, { recursive: true, force: true });
}
