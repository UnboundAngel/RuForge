#!/usr/bin/env node
/**
 * Publish a snapshot of sync/main onto public/main without sharing history.
 *
 * Builds a commit with a temporary GIT_INDEX_FILE only:
 *   read-tree sync/main → rm private-only paths → write-tree →
 *   commit-tree (parent: public/main).
 * Does not touch the working tree, HEAD, or the real index.
 *
 * --only <dir> publishes one directory between releases: starts from the
 * public/main tree and swaps in only <dir> from sync/main, so unreleased app
 * code and tooling outside <dir> stay private.
 *
 * Usage:
 *   node scripts/publish-snapshot.mjs --dry-run
 *   node scripts/publish-snapshot.mjs "Release: v0.5.0"
 *   RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs "Release: v0.5.0"
 *   node scripts/publish-snapshot.mjs --only website --dry-run
 *   RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs --only website "Website: roadmap and features pass"
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function privatePaths() {
  return readFileSync(listPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

function usage(code = 1) {
  console.error(`Usage:
  node scripts/publish-snapshot.mjs --dry-run
  node scripts/publish-snapshot.mjs "<commit message>"
  RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs "<commit message>"
  node scripts/publish-snapshot.mjs --only <dir> [--dry-run] "<commit message>"`);
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

const tmp = mkdtempSync(join(tmpdir(), 'ruforge-snap-'));
const indexFile = join(tmp, 'index');
const env = { ...process.env, GIT_INDEX_FILE: indexFile };

try {
  if (only) {
    run(['rev-parse', '--verify', `${SYNC_REF}:${only}`]);
    run(['read-tree', PUBLIC_REF], { env });
    run(['rm', '-r', '-f', '--cached', '--ignore-unmatch', '--quiet', '--', only], { env });
    run(['read-tree', `--prefix=${only}/`, `${SYNC_REF}:${only}`], { env });
  } else {
    run(['read-tree', SYNC_REF], { env });
  }
  for (const p of paths) {
    run(['rm', '-r', '--cached', '--ignore-unmatch', '--', p], { env });
  }
  const tree = run(['write-tree'], { env });
  const publicTree = run(['rev-parse', `${PUBLIC_REF}^{tree}`]);
  if (tree === publicTree) {
    console.error('abort: snapshot tree equals public/main (nothing to publish)');
    process.exit(1);
  }

  const diff = run(['diff', '--name-status', PUBLIC_REF, tree]);
  if (dryRun) {
    console.log(`dry-run: would publish tree ${tree} onto ${PUBLIC_REF}${only ? ` (only ${only}/)` : ''}`);
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
