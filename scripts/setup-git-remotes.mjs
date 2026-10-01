#!/usr/bin/env node
/**
 * Wire the two RuForge remotes on this clone:
 *   sync   -> UnboundAngel/RuForge-sync (private WIP)
 *   public -> UnboundAngel/RuForge (intentional public publish / release)
 *
 * Does not create the private GitHub repo. Angel runs once:
 *   gh repo create UnboundAngel/RuForge-sync --private \
 *     --description "Private WIP sync for RuForge. Not the public release repo."
 * Then from a clone with full history:
 *   node scripts/setup-git-remotes.mjs
 *   git push sync --all
 *   git push sync --tags
 */
import { execFileSync } from 'node:child_process';

const PUBLIC_URL = 'https://github.com/UnboundAngel/RuForge.git';
const SYNC_URL = 'https://github.com/UnboundAngel/RuForge-sync.git';

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

setRemote('sync', SYNC_URL);
setRemote('public', PUBLIC_URL);

const origin = remoteUrl('origin');
if (origin) {
  const n = normalizeGithub(origin);
  if (n === normalizeGithub(PUBLIC_URL)) {
    console.log(
      'note origin still points at the public repo. Daily pushes use sync, not origin.',
    );
  } else if (n === normalizeGithub(SYNC_URL)) {
    console.log('note origin points at RuForge-sync (good for laptop/desktop/cloud WIP).');
  } else {
    console.log(`note origin is ${origin} (left unchanged).`);
  }
} else {
  console.log('note no origin remote; sync + public are enough.');
}

console.log(`
Next (once RuForge-sync exists and your token can push it):
  git push sync --all
  git push sync --tags

Point Cursor Cloud Agents at UnboundAngel/RuForge-sync for daily work.
Public UnboundAngel/RuForge is for intentional publish and releases only.
`);
