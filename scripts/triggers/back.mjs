#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  root,
  ensureRemotes,
  syncFetch,
  newestHandoff,
  run,
} from './lib.mjs';

ensureRemotes();
if (!syncFetch()) {
  console.error('back: sync fetch failed; stop and report');
  process.exit(1);
}

const handoff = newestHandoff();
if (!handoff) {
  console.error('back: no dated handoff found under docs/agents/handoffs/');
  process.exit(1);
}

const body = readFileSync(handoff.full, 'utf8');
const branchMatch = body.match(/\*\*branch:\*\*\s*`([^`]+)`/);
let branch = branchMatch?.[1];
if (!branch) {
  // filename fallback: YYYY-MM-DD-<branch-with-hyphens>.md
  branch = handoff.file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
  // common feature branches use slashes; recover cursor/ prefix form if present on remote
  const candidates = [branch, branch.replace(/-/g, '/')];
  for (const c of candidates) {
    try {
      run(['rev-parse', '--verify', `sync/${c}`]);
      branch = c;
      break;
    } catch {
      // try next
    }
  }
}

console.log(`handoff ${handoff.file}`);
console.log(`branch ${branch}`);

try {
  execFileSync('git', ['checkout', branch], { cwd: root, stdio: 'inherit' });
} catch {
  // create local tracking branch from sync
  try {
    execFileSync('git', ['checkout', '-B', branch, `sync/${branch}`], {
      cwd: root,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`back: cannot checkout ${branch}`);
    console.error(String(err?.stderr || err?.message || err));
    process.exit(1);
  }
}

try {
  execFileSync('git', ['pull', '--ff-only', 'sync', branch], { cwd: root, stdio: 'inherit' });
} catch {
  console.error('back: pull --ff-only failed; stop and report');
  process.exit(1);
}

ensureRemotes();

const lock = join(root, 'package-lock.json');
if (existsSync(lock)) {
  try {
    const changed = run([
      'diff',
      '--name-only',
      'HEAD@{1}',
      'HEAD',
      '--',
      'package-lock.json',
    ]);
    if (changed.includes('package-lock.json')) {
      execFileSync('npm', ['install'], { cwd: root, stdio: 'inherit' });
    }
  } catch {
    // HEAD@{1} may be missing; install if node_modules absent
    if (!existsSync(join(root, 'node_modules'))) {
      execFileSync('npm', ['install'], { cwd: root, stdio: 'inherit' });
    }
  }
}

const nextMatch = body.match(/## Exact next step\s*\n+([\s\S]*?)(\n## |\n*$)/);
const next = (nextMatch?.[1] || '').trim() || '(no next step recorded)';
console.log('--- handoff ---');
console.log(body.trim());
console.log('--- next step ---');
console.log(next);
console.log('waiting for Angel');
