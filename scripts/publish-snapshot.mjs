#!/usr/bin/env node
/**
 * Publish a snapshot of sync/main onto public/main without sharing history.
 *
 * Builds a commit with a temporary GIT_INDEX_FILE only:
 *   read-tree sync/main → rm private-only paths → write-tree →
 *   commit-tree (parent: public/main).
 * Does not touch the working tree, HEAD, or the real index.
 *
 * --only <path> publishes one directory or file between releases: starts from
 * the public/main tree and swaps in only <path> from sync/main, so unreleased
 * app code and tooling outside <path> stay private.
 *
 * Usage:
 *   node scripts/publish-snapshot.mjs --dry-run
 *   node scripts/publish-snapshot.mjs "Release: v0.5.0"
 *   RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs "Release: v0.5.0"
 *   node scripts/publish-snapshot.mjs --only website --dry-run
 *   RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs --only website "Website: roadmap and features pass"
 *   RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs --only README.md "README: install and credits"
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGamesLeaks, pathMatchesGames, readGamesPatterns } from './games-leak.mjs';
import { findContentLeaks, leakTerms, readFeaturesFromTree, scheduledPrivatePathsForRef } from './scheduled-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listPath = join(root, 'scripts/private-only-paths.txt');
const PUBLIC_REF = 'public/main';
const SYNC_REF = 'sync/main';

function run(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function readPathList(file) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

function privatePaths() {
  return readPathList(listPath);
}

function reportLeaks(leaks, label) {
  console.error(`abort: Games paths would publish${label ? ` (${label})` : ''}. Leaks:`);
  const show = leaks.slice(0, 80);
  for (const p of show) console.error(`  ${p}`);
  if (leaks.length > show.length) {
    console.error(`  ... and ${leaks.length - show.length} more`);
  }
  process.exit(1);
}

/** Full tree after private-only removal must not contain Games. */
function assertNoGamesLeak(treeSha) {
  const patterns = readGamesPatterns();
  const files = run(['ls-tree', '-r', '--name-only', treeSha])
    .split(/\r?\n/)
    .filter(Boolean);
  const leaks = findGamesLeaks(files, patterns);
  if (leaks.length) reportLeaks(leaks);
}

/** Unreleased scheduled features: folders are dropped above; their names must not ride along elsewhere. */
function assertNoScheduledLeak(treeSha) {
  const leaks = findContentLeaks(treeSha, leakTerms(readFeaturesFromTree(SYNC_REF)));
  if (!leaks.length) return;
  console.error('abort: files name an unreleased scheduled feature (docs/agents/SCHEDULED.md):');
  for (const p of leaks.slice(0, 80)) console.error(`  ${p}`);
  process.exit(1);
}

/**
 * `--only` also runs the guard: the only path, and for a directory every file under it
 * from sync/main (case-insensitive; stub excluded).
 */
function assertOnlyPathNotGames(onlyPath) {
  const patterns = readGamesPatterns();
  const norm = onlyPath.replace(/\\/g, '/');
  if (pathMatchesGames(norm, patterns)) {
    reportLeaks([norm], `--only ${norm}`);
  }
  let type;
  try {
    type = run(['cat-file', '-t', `${SYNC_REF}:${norm}`]);
  } catch {
    return;
  }
  if (type !== 'tree') return;
  const files = run(['ls-tree', '-r', '--name-only', `${SYNC_REF}:${norm}`])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((f) => `${norm}/${f}`);
  const leaks = findGamesLeaks(files, patterns);
  if (leaks.length) reportLeaks(leaks, `--only ${norm}/`);
}

function usage(code = 1) {
  console.error(`Usage:
  node scripts/publish-snapshot.mjs --dry-run
  node scripts/publish-snapshot.mjs "<commit message>"
  RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs "<commit message>"
  node scripts/publish-snapshot.mjs --only <dir-or-file> [--dry-run] "<commit message>"`);
  process.exit(code);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const onlyAt = argv.indexOf('--only');
const only = onlyAt >= 0 ? (argv[onlyAt + 1] || '').replace(/[\\/]+$/, '') : '';
if (onlyAt >= 0 && (!only || only.startsWith('-'))) usage(1);
const message = argv
  .filter((a, i) => a !== '--dry-run' && (onlyAt < 0 || (i !== onlyAt && i !== onlyAt + 1)))
  .join(' ')
  .trim();
if (!dryRun && !message) usage(1);

try {
  run(['rev-parse', '--verify', SYNC_REF]);
  run(['rev-parse', '--verify', PUBLIC_REF]);
} catch {
  console.error(`need ${SYNC_REF} and ${PUBLIC_REF} (fetch both remotes first)`);
  process.exit(1);
}

const paths = privatePaths();
if (!paths.length) {
  console.error('private-only path list is empty');
  process.exit(1);
}

if (only) {
  assertOnlyPathNotGames(only);
}

const tmp = mkdtempSync(join(tmpdir(), 'ruforge-snap-'));
const indexFile = join(tmp, 'index');
const env = { ...process.env, GIT_INDEX_FILE: indexFile };

try {
  if (only) {
    run(['rev-parse', '--verify', `${SYNC_REF}:${only}`]);
    run(['read-tree', PUBLIC_REF], { env });
    run(['rm', '-r', '-f', '--cached', '--ignore-unmatch', '--quiet', '--', only], { env });
    if (run(['cat-file', '-t', `${SYNC_REF}:${only}`]) === 'blob') {
      const [mode, , sha] = run(['ls-tree', SYNC_REF, '--', only]).split(/\s+/);
      run(['update-index', '--add', '--cacheinfo', `${mode},${sha},${only}`], { env });
    } else {
      run(['read-tree', `--prefix=${only}/`, `${SYNC_REF}:${only}`], { env });
    }
  } else {
    run(['read-tree', SYNC_REF], { env });
  }
  for (const p of [...paths, ...scheduledPrivatePathsForRef(SYNC_REF)]) {
    run(['rm', '-r', '--cached', '--ignore-unmatch', '--', p], { env });
  }
  const tree = run(['write-tree'], { env });
  assertNoGamesLeak(tree);
  assertNoScheduledLeak(tree);
  const publicTree = run(['rev-parse', `${PUBLIC_REF}^{tree}`]);
  if (tree === publicTree) {
    console.error('abort: snapshot tree equals public/main (nothing to publish)');
    process.exit(1);
  }

  const diff = run(['diff', '--name-status', PUBLIC_REF, tree]);
  if (dryRun) {
    console.log(`dry-run: would publish tree ${tree} onto ${PUBLIC_REF}${only ? ` (only ${only})` : ''}`);
    console.log(diff || '(no name-status output)');
    process.exit(0);
  }

  const parent = run(['rev-parse', PUBLIC_REF]);
  const commit = run(['commit-tree', tree, '-p', parent, '-m', message]);

  console.log(`snapshot ${commit}`);
  console.log(diff);

  if (process.env.RUFORGE_PUBLISH !== '1') {
    console.log('not pushed (set RUFORGE_PUBLISH=1 to push to public main)');
    process.exit(0);
  }

  run(['push', 'public', `${commit}:refs/heads/main`]);
  console.log('pushed to public main');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
