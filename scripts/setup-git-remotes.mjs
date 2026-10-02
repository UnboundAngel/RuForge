#!/usr/bin/env node
/**
 * Wire RuForge remotes for snapshot publishing:
 *   sync   -> UnboundAngel/Ruforge-priv (default push; full history + private-only files)
 *   public -> UnboundAngel/RuForge (downstream-only; snapshot publishes)
 *
 * Removes `origin`. Sets remote.pushDefault=sync and core.hooksPath=.githooks.
 *
 *   node scripts/setup-git-remotes.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PUBLIC_URL = 'https://github.com/UnboundAngel/RuForge.git';
const SYNC_URL = 'https://github.com/UnboundAngel/Ruforge-priv.git';

function run(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function remotes() {
  try {
    return run(['remote']).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function remoteUrl(name) {
  try {
    return run(['remote', 'get-url', name]);
  } catch {
    return null;
  }
}

function normalizeGithub(url) {
  return String(url || '')
    .replace(/\.git$/i, '')
    .replace(/^git@github\.com:/i, 'https://github.com/')
    .replace(/^https?:\/\/([^@]+@)?github\.com\//i, 'https://github.com/')
    .toLowerCase();
}

function setRemote(name, url) {
  const existing = remotes();
  if (existing.includes(name)) {
    const current = remoteUrl(name);
    if (normalizeGithub(current) === normalizeGithub(url)) {
      console.log(`ok  ${name} -> ${current}`);
      return;
    }
    run(['remote', 'set-url', name, url]);
    console.log(`upd ${name} -> ${url} (was ${current})`);
    return;
  }
  run(['remote', 'add', name, url]);
  console.log(`add ${name} -> ${url}`);
}

if (remotes().includes('origin')) {
  run(['remote', 'remove', 'origin']);
  console.log('rm  origin');
}

setRemote('sync', SYNC_URL);
setRemote('public', PUBLIC_URL);

run(['config', 'remote.pushDefault', 'sync']);
console.log('ok  remote.pushDefault=sync');

run(['config', 'core.hooksPath', '.githooks']);
console.log('ok  core.hooksPath=.githooks');

if (existsSync(join(root, 'AGENTS.local.md'))) {
  console.warn(
    'warn AGENTS.local.md still exists. docs/agents/PERSONAL.md (tracked, private-only) supersedes it;\n' +
      '     move anything new into PERSONAL.md (secrets into .env.local) and delete AGENTS.local.md.',
  );
}

console.log(`
Daily work: push to sync (default).
Public is downstream-only: RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs "<message>"
Never pull or merge public into sync. Outside PRs on public get cherry-picked into sync.
`);
