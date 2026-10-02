#!/usr/bin/env node
/**
 * Ship trigger. Two steps so public never moves without Angel's explicit yes:
 *   node scripts/triggers/ship.mjs [message]        dry-run, prints files + message, waits
 *   node scripts/triggers/ship.mjs --yes [message]  publishes the same snapshot
 * Release prep (version bump, updater.json, sync push) comes first: .cursor/skills/ruforge-release/SKILL.md
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureRemotes, root, run } from './lib.mjs';

const argv = process.argv.slice(2);
const confirmed = argv.includes('--yes');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const message = argv.filter((a) => a !== '--yes').join(' ').trim() || `Release: v${version}`;
const snapshot = join(root, 'scripts/publish-snapshot.mjs');

ensureRemotes();
try {
  run(['fetch', 'sync', 'main']);
  run(['fetch', 'public', 'main']);
} catch (err) {
  console.error(`fetch failed; stop and report: ${String(err?.stderr || err?.message || err)}`);
  process.exit(1);
}

const head = run(['rev-parse', 'HEAD']);
const syncMain = run(['rev-parse', 'sync/main']);
if (head !== syncMain) {
  console.error(
    `WARNING: local HEAD ${head.slice(0, 7)} is not sync/main ${syncMain.slice(0, 7)}.\n` +
      'The snapshot is built from sync/main; push release work to sync main first.',
  );
}

if (!confirmed) {
  try {
    execFileSync(process.execPath, [snapshot, '--dry-run'], { cwd: root, stdio: 'inherit' });
  } catch {
    console.error('dry-run failed; nothing to publish or refs missing. Stop and report.');
    process.exit(1);
  }
  console.log(`\ncommit message: ${message}`);
  console.log('\nWAITING: publish only after Angel replies "yes".');
  console.log(`Then run: node scripts/triggers/ship.mjs --yes${argv.length ? ` ${JSON.stringify(message)}` : ''}`);
  process.exit(0);
}

execFileSync(process.execPath, [snapshot, message], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, RUFORGE_PUBLISH: '1' },
});
