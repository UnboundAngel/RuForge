#!/usr/bin/env node
/**
 * pre-push checks for RuForge remotes. Invoked by .githooks/pre-push.
 *
 * stdin lines: <local-ref> <local-sha> <remote-ref> <remote-sha>
 * argv: remote-name, remote-url
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listPath = join(root, 'scripts/private-only-paths.txt');
const PUBLIC_NORM = 'https://github.com/unboundangel/ruforge';
const ZERO = '0000000000000000000000000000000000000000';

function run(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function normalizeGithub(url) {
  return String(url || '')
    .replace(/\.git$/i, '')
    .replace(/^git@github\.com:/i, 'https://github.com/')
    .replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/')
    .replace(/^https?:\/\/([^@]+@)?github\.com\//i, 'https://github.com/')
    .toLowerCase();
}

function privatePaths() {
  return readFileSync(listPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((p) => p.replace(/\/$/, ''));
}

function commitHasPrivatePath(sha, paths) {
  const files = run(['ls-tree', '-r', '--name-only', sha]).split(/\r?\n/).filter(Boolean);
  for (const file of files) {
    for (const p of paths) {
      if (file === p || file.startsWith(`${p}/`)) return file;
    }
  }
  return null;
}

function newCommits(localSha, remoteSha) {
  if (localSha === ZERO) return [];
  if (remoteSha === ZERO) {
    return run(['rev-list', localSha]).split(/\r?\n/).filter(Boolean);
  }
  try {
    return run(['rev-list', `${remoteSha}..${localSha}`]).split(/\r?\n/).filter(Boolean);
  } catch {
    return run(['rev-list', localSha]).split(/\r?\n/).filter(Boolean);
  }
}

const remoteName = process.argv[2] || '';
const remoteUrl = process.argv[3] || '';
const isPublic = normalizeGithub(remoteUrl) === PUBLIC_NORM;
const paths = privatePaths();

if (isPublic && process.env.RUFORGE_PUBLISH !== '1') {
  console.error(
    `blocked: push to public RuForge (${remoteName}) requires RUFORGE_PUBLISH=1\n` +
      'use: RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs "<message>"',
  );
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
const updates = [];
for await (const line of rl) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  const [localRef, localSha, remoteRef, remoteSha] = trimmed.split(/\s+/);
  updates.push({ localRef, localSha, remoteRef, remoteSha });
}

for (const u of updates) {
  if (u.localSha === ZERO) continue;
  const commits = newCommits(u.localSha, u.remoteSha);
  for (const sha of commits) {
    const hit = commitHasPrivatePath(sha, paths);
    if (!hit) continue;
    if (isPublic) {
      console.error(
        `blocked: commit ${sha.slice(0, 7)} contains private-only path ${hit}\n` +
          'public only accepts snapshot commits from publish-snapshot.mjs',
      );
      process.exit(1);
    }
  }
}

if (isPublic) {
  for (const u of updates) {
    if (u.localSha === ZERO) continue;
    const hit = commitHasPrivatePath(u.localSha, paths);
    if (hit) {
      console.error(
        `blocked: tip ${u.localSha.slice(0, 7)} still has private-only path ${hit}`,
      );
      process.exit(1);
    }
  }
}

process.exit(0);
