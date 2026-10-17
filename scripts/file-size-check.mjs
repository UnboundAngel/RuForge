#!/usr/bin/env node
/**
 * Scoped file-size limits with a shrink-only baseline for files that were already over.
 *
 *   node scripts/file-size-check.mjs              check the working tree (tracked + untracked, not ignored)
 *   node scripts/file-size-check.mjs --rev <sha> [--since <base>]  check a commit tree, only files changed since base (pre-push)
 *   node scripts/file-size-check.mjs --tighten    lower baselines to current sizes, drop files now under limit
 *   node scripts/file-size-check.mjs --report     list every file over its limit with its baseline
 *
 * Games files keep their baseline in scripts/file-size-baseline.games.json (private, see games-paths.txt).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathMatchesGames, readGamesPatterns } from './games-leak.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(root, 'scripts/file-size-baseline.json');
const GAMES_BASELINE = join(root, 'scripts/file-size-baseline.games.json');

// First match wins. Limits come from the repo's own spread (p90 to p97 per kind), not one number for everything.
export const SCOPES = [
  { id: 'exempt', limit: Infinity, test: (p) => /^(imports|infra)\//.test(p) || p.endsWith('.d.ts') || p.includes('/gen/') },
  { id: 'test', limit: 800, test: (p) => /\.test\.[cm]?[jt]sx?$/.test(p) || p.includes('/test-harness/') || p.includes('/tests/') },
  { id: 'rust', limit: 800, test: (p) => p.endsWith('.rs') },
  { id: 'store', limit: 700, test: (p) => /^src\/store\//.test(p) || /(Slice|Store)\.ts$/.test(p) },
  { id: 'hook', limit: 400, test: (p) => /(^|\/)use[A-Z][^/]*\.tsx?$/.test(p) },
  { id: 'component', limit: 500, test: (p) => p.endsWith('.tsx') },
  { id: 'astro', limit: 600, test: (p) => p.endsWith('.astro') },
  { id: 'css', limit: 1000, test: (p) => p.endsWith('.css') },
  { id: 'script', limit: 400, test: (p) => /^scripts\/.*\.[cm]?js$/.test(p) },
  { id: 'module', limit: 500, test: (p) => /\.[cm]?[jt]s$/.test(p) },
];

export function scopeFor(path) {
  return SCOPES.find((s) => s.test(path)) ?? null;
}

/** Inline `#[cfg(test)] mod tests` is idiomatic Rust; only the code above it counts. */
export function countLines(path, text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (!path.endsWith('.rs')) return lines.length;
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^#\[cfg\(test\)\]\s*$/.test(lines[i]) && /^mod tests\b/.test(lines[i + 1].trim())) return i;
  }
  return lines.length;
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

function writeJson(path, obj) {
  const sorted = Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

function workingTreeSizes() {
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const out = new Map();
  for (const f of new Set(files)) {
    const scope = scopeFor(f);
    if (!scope || scope.limit === Infinity) continue;
    const abs = join(root, f);
    if (!existsSync(abs)) continue;
    out.set(f, countLines(f, readFileSync(abs, 'utf8')));
  }
  return out;
}

function revSizes(rev) {
  const entries = git(['ls-tree', '-r', '-z', rev])
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split('\t');
      const [, type, sha] = meta.split(' ');
      return { type, sha, path };
    })
    .filter((e) => e.type === 'blob' && scopeFor(e.path) && scopeFor(e.path).limit !== Infinity);
  const res = spawnSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: entries.map((e) => e.sha).join('\n') + '\n',
    maxBuffer: 1 << 30,
  });
  if (res.status !== 0) throw new Error(`git cat-file failed: ${res.stderr}`);
  const buf = res.stdout;
  const out = new Map();
  let pos = 0;
  for (const e of entries) {
    const nl = buf.indexOf(0x0a, pos);
    const size = Number(buf.subarray(pos, nl).toString('utf8').split(' ')[2]);
    const body = buf.subarray(nl + 1, nl + 1 + size).toString('utf8');
    pos = nl + 1 + size + 1;
    out.set(e.path, countLines(e.path, body));
  }
  return out;
}

function loadBaselines() {
  return { ...readJson(BASELINE), ...readJson(GAMES_BASELINE) };
}

export function findViolations(sizes, baselines) {
  const bad = [];
  for (const [path, lines] of sizes) {
    const scope = scopeFor(path);
    const allowed = Math.max(scope.limit, baselines[path] ?? 0);
    if (lines <= allowed) continue;
    bad.push({ path, lines, scope: scope.id, limit: scope.limit, baseline: baselines[path] ?? null });
  }
  return bad.sort((a, b) => b.lines - a.lines);
}

function tighten(sizes) {
  const games = readGamesPatterns();
  const next = { pub: {}, games: {} };
  const prev = loadBaselines();
  for (const [path, base] of Object.entries(prev)) {
    const lines = sizes.get(path);
    if (lines == null) continue;
    const scope = scopeFor(path);
    if (!scope || lines <= scope.limit) continue;
    next[pathMatchesGames(path, games) ? 'games' : 'pub'][path] = Math.min(base, lines);
  }
  writeJson(BASELINE, next.pub);
  if (Object.keys(next.games).length || existsSync(GAMES_BASELINE)) writeJson(GAMES_BASELINE, next.games);
  const dropped = Object.keys(prev).length - Object.keys(next.pub).length - Object.keys(next.games).length;
  const lowered = Object.entries({ ...next.pub, ...next.games }).filter(([p, n]) => n < prev[p]).length;
  if (dropped || lowered) console.log(`file-size: ${lowered} baseline(s) lowered, ${dropped} dropped`);
}

const args = process.argv.slice(2);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const revAt = args.indexOf('--rev');
  const sinceAt = args.indexOf('--since');
  const sizes = revAt >= 0 ? revSizes(args[revAt + 1]) : workingTreeSizes();
  // Pushes only answer for files they touch; untouched oversized files never block unrelated work.
  if (revAt >= 0 && sinceAt >= 0) {
    const touched = new Set(git(['diff', '--name-only', '-z', args[sinceAt + 1], args[revAt + 1]]).split('\0'));
    for (const path of [...sizes.keys()]) if (!touched.has(path)) sizes.delete(path);
  }
  if (args.includes('--tighten')) {
    tighten(sizes);
    process.exit(0);
  }
  const baselines = loadBaselines();
  if (args.includes('--report')) {
    for (const [path, lines] of [...sizes].sort((a, b) => b[1] - a[1])) {
      const scope = scopeFor(path);
      if (lines > scope.limit) console.log(`${String(lines).padStart(5)}  ${scope.id.padEnd(9)} limit ${scope.limit}  base ${baselines[path] ?? '-'}  ${path}`);
    }
    process.exit(0);
  }
  const bad = findViolations(sizes, baselines);
  if (!bad.length) process.exit(0);
  console.error('file-size: over the scoped limit (rules: root AGENTS.md > Code)');
  for (const v of bad) {
    const why = v.baseline == null ? `new or newly over; ${v.scope} limit ${v.limit}` : `grew past its baseline ${v.baseline}`;
    console.error(`  ${v.path}: ${v.lines} lines (${why})`);
  }
  console.error('Split the file or move the new code into a new file next to it. Do not raise a limit or baseline.');
  process.exit(1);
}
