/**
 * Scheduled features: shared reads for scheduled.mjs, publish-snapshot and the pre-push hook.
 *
 * A feature is `src/scheduled/<id>/feature.json` (+ optional `src-tauri/src/scheduled/<id_snake>/`).
 * Until `released: true`, its folders never reach public, and its id and leakTerms must not
 * appear anywhere else in the published tree.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TS_ROOT = 'src/scheduled';
export const RS_ROOT = 'src-tauri/src/scheduled';
export const UNLOCKS_FILE = 'website/public/unlocks.json';
// The server switch names a feature by design; Angel adds an entry only when it is needed.
const LEAK_SCAN_EXEMPT = new Set([UNLOCKS_FILE]);

export const snake = (id) => id.replace(/-/g, '_');

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function parseFeature(id, text, where) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`${where}: ${e.message}`);
  }
  return {
    id,
    title: json.title ?? id,
    unlockAt: json.unlockAt,
    released: json.released === true,
    leakTerms: Array.isArray(json.leakTerms) ? json.leakTerms : [],
    privatePaths: Array.isArray(json.privatePaths) ? json.privatePaths : [],
  };
}

/** Feature folders in the working tree. A folder with no feature.json counts as unreleased. */
export function readFeaturesFromDisk() {
  const dir = join(root, TS_ROOT);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const file = join(dir, d.name, 'feature.json');
      return existsSync(file)
        ? parseFeature(d.name, readFileSync(file, 'utf8'), file)
        : { ...parseFeature(d.name, '{}', file), unlockAt: null };
    });
}

function lsDirs(ref, path) {
  try {
    return git(['ls-tree', '-d', '--name-only', `${ref}:${path}`]).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

export function readFeaturesFromTree(ref) {
  return lsDirs(ref, TS_ROOT).map((id) => {
    try {
      return parseFeature(id, git(['show', `${ref}:${TS_ROOT}/${id}/feature.json`]), `${ref}:${TS_ROOT}/${id}`);
    } catch {
      return { ...parseFeature(id, '{}', ''), unlockAt: null };
    }
  });
}

/**
 * Paths to drop from a public tree. Rust folders with no released TS twin are dropped too,
 * so a stray or misnamed folder fails closed.
 */
export function scheduledPrivatePaths(features, rustDirs) {
  const released = new Set(features.filter((f) => f.released).map((f) => snake(f.id)));
  const out = [];
  for (const f of features) {
    if (f.released) continue;
    out.push(`${TS_ROOT}/${f.id}`, ...f.privatePaths.map((p) => p.replace(/\/$/, '')));
  }
  for (const d of rustDirs) {
    if (!released.has(d)) out.push(`${RS_ROOT}/${d}`);
  }
  return out;
}

export function scheduledPrivatePathsForRef(ref) {
  return scheduledPrivatePaths(readFeaturesFromTree(ref), lsDirs(ref, RS_ROOT));
}

export function scheduledPrivatePathsOnDisk() {
  const rs = join(root, RS_ROOT);
  const rustDirs = existsSync(rs)
    ? readdirSync(rs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  return scheduledPrivatePaths(readFeaturesFromDisk(), rustDirs);
}

export function leakTerms(features) {
  return features
    .filter((f) => !f.released)
    .flatMap((f) => [f.id, snake(f.id), ...f.leakTerms])
    .filter((t, i, all) => t && t.length >= 4 && all.indexOf(t) === i);
}

/**
 * Files that mention an unreleased feature. Case-insensitive, text files only.
 * `treeish` null scans the working tree, untracked files included.
 */
export function findContentLeaks(treeish, terms) {
  if (!terms.length) return [];
  const args = ['grep', '-I', '-l', '-i', '-F'];
  if (!treeish) args.push('--untracked');
  for (const t of terms) args.push('-e', t);
  if (treeish) args.push(treeish);
  let out = '';
  try {
    out = git(args);
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => (treeish ? l.slice(l.indexOf(':') + 1) : l))
    .filter((p) => !LEAK_SCAN_EXEMPT.has(p));
}

export function readUnlocks() {
  const file = join(root, UNLOCKS_FILE);
  if (!existsSync(file)) return { features: {} };
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
