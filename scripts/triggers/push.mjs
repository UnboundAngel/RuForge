#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import {
  ensureRemotes,
  currentBranch,
  shortHash,
  run,
  root,
  syncFetch,
} from './lib.mjs';
import {
  SHIPPED_LOG,
  deriveCommitMessage,
  parseNumstat,
  shippedEntriesAdded,
} from './commit-message.mjs';

function sh(cmd, opts = {}) {
  return execFileSync(cmd, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commitMessageFromDiff() {
  const numstat = parseNumstat(run(['diff', '--cached', '--numstat']));
  if (!numstat.length) return null;
  const forced = process.env.RUFORGE_COMMIT_MSG || process.argv.slice(2).join(' ').trim();
  if (forced) return forced;
  const safe = (args) => {
    try {
      return run(args);
    } catch {
      return '';
    }
  };
  return deriveCommitMessage({
    numstat,
    shipped: shippedEntriesAdded(safe(['diff', '--cached', '-U0', '--', SHIPPED_LOG])),
    stat: safe(['diff', '--cached', '--stat']),
  });
}

ensureRemotes();
const branch = currentBranch();
if (!branch) {
  console.error('detached HEAD; checkout a branch first');
  process.exit(1);
}

run(['add', '-A']);
const msg = commitMessageFromDiff();
if (msg) {
  execFileSync('git', ['commit', '-m', msg], { cwd: root, stdio: 'inherit' });
} else {
  console.log('nothing to commit; continuing to push');
}

const fetched = syncFetch();
if (!fetched) {
  console.error('sync fetch failed; stop and report (do not push public)');
  process.exit(1);
}

const remoteBranch = `sync/${branch}`;
try {
  run(['rev-parse', '--verify', remoteBranch]);
  const behind = Number(run(['rev-list', '--count', `HEAD..${remoteBranch}`]) || '0');
  if (behind > 0) {
    try {
      execFileSync('git', ['rebase', remoteBranch], { cwd: root, stdio: 'inherit' });
    } catch {
      console.error('rebase conflict; stop and report; never force-push');
      process.exit(1);
    }
  }
} catch {
  // no remote branch yet
}

try {
  execFileSync('git', ['push', '-u', 'sync', branch], { cwd: root, stdio: 'inherit' });
} catch (err) {
  console.error('sync push failed; stop and report; do not try public');
  process.exit(1);
}

console.log(`pushed ${branch} @ ${shortHash()}`);

// Other machines and cloud agents start from sync/main, so a branch push alone leaves them behind.
if (branch !== 'main') {
  let fastForwards = false;
  try {
    run(['merge-base', '--is-ancestor', 'sync/main', 'HEAD']);
    fastForwards = true;
  } catch {
    fastForwards = false;
  }
  if (fastForwards) {
    try {
      execFileSync('git', ['push', 'sync', 'HEAD:main'], { cwd: root, stdio: 'inherit' });
      console.log(`sync/main -> ${shortHash()}`);
    } catch {
      console.error('sync main push failed; branch is pushed, main did not move; stop and report');
      process.exit(1);
    }
  } else {
    const bar = '!'.repeat(64);
    console.error(
      `\n${bar}\nWARNING: sync/main DID NOT MOVE.\n` +
        `${branch} does not fast-forward sync/main (main has commits this branch lacks).\n` +
        `Only ${branch} was pushed. Merge or rebase onto sync/main, then push main yourself.\n${bar}\n`,
    );
  }
}
