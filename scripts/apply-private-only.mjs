#!/usr/bin/env node
/**
 * strip   - remove private-only paths from the index/worktree (public publish)
 * restore - bring them back from a git tree-ish (default: HEAD@{1} or --from)
 *
 * Path list: scripts/private-only-paths.txt (tracked on both remotes).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

function paths() {
  return readFileSync(listPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function trackedUnder(prefix) {
  const all = run(['ls-files', '-z']).split('\0').filter(Boolean);
  if (prefix.endsWith('/')) {
    return all.filter((p) => p === prefix.slice(0, -1) || p.startsWith(prefix));
  }
  return all.filter((p) => p === prefix);
}

const mode = process.argv[2];
const fromIdx = process.argv.indexOf('--from');
const fromRef = fromIdx >= 0 ? process.argv[fromIdx + 1] : null;

if (mode !== 'strip' && mode !== 'restore') {
  console.error(`Usage:
  node scripts/apply-private-only.mjs strip
  node scripts/apply-private-only.mjs restore [--from <tree-ish>]`);
  process.exit(1);
}

if (!existsSync(listPath)) {
  console.error(`missing ${listPath}`);
  process.exit(1);
}

const entries = paths();
if (!entries.length) {
  console.error('private-only path list is empty');
  process.exit(1);
}

if (mode === 'strip') {
  const remove = new Set();
  for (const entry of entries) {
    for (const p of trackedUnder(entry)) remove.add(p);
  }
  if (!remove.size) {
    console.log('strip: nothing tracked to remove');
    process.exit(0);
  }
  const list = [...remove].sort();
  run(['rm', '-r', '--cached', '--ignore-unmatch', ...list]);
  // drop from worktree too when present
  for (const p of list) {
    try {
      run(['rm', '-rf', '--', p]);
    } catch {
      // already gone from worktree
    }
  }
  console.log(`strip: removed ${list.length} path(s) from git`);
  for (const p of list) console.log(`  - ${p}`);
  process.exit(0);
}

// restore
const source = fromRef || 'HEAD@{1}';
let restored = 0;
for (const entry of entries) {
  try {
    run(['checkout', source, '--', entry]);
    run(['add', '-f', '--', entry]);
    restored += 1;
    console.log(`restore: ${entry} <- ${source}`);
  } catch (err) {
    const msg = String(err?.stderr || err?.message || err);
    console.error(`restore skip ${entry}: ${msg.split('\n')[0]}`);
  }
}
if (!restored) {
  console.error(`restore: nothing restored from ${source}`);
  process.exit(1);
}
console.log(`restore: ok (${restored} entr(y/ies) from ${source})`);
