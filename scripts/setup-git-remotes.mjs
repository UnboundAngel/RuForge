#!/usr/bin/env node
/**
 * Wire the two RuForge remotes on this clone:
 *   sync   -> UnboundAngel/Ruforge-priv (private WIP)
 *   public -> UnboundAngel/RuForge (intentional public publish / release)
 *
 * Private repo already exists. On a clone with full history:
 *   node scripts/setup-git-remotes.mjs
 *   git push sync --all
 *   git push sync --tags
 *
 * Cloud agents attached only to public RuForge get a single-repo GitHub token.
 * They cannot push sync unless the session also has Ruforge-priv in scope
 * (or a short-lived PAT). Prefer attaching daily cloud agents to Ruforge-priv,
 * or keep both remotes and push sync from a machine / multi-repo session.
 */
import { execFileSync } from 'node:child_process';

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
    console.log('note origin points at Ruforge-priv (good for laptop/desktop/cloud WIP).');
  } else {
    console.log(`note origin is ${origin} (left unchanged).`);
  }
} else {
  console.log('note no origin remote; sync + public are enough.');
}

console.log(`
Next (when your token can push Ruforge-priv):
  git push sync --all
  git push sync --tags

Point Cursor Cloud Agents at UnboundAngel/Ruforge-priv for daily work.
Public UnboundAngel/RuForge is for intentional publish and releases only.
`);
