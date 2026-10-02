#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  root,
  handoffsDir,
  today,
  sanitizeBranchForFilename,
  currentBranch,
  shortHash,
  ensureRemotes,
} from './lib.mjs';

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1] || '';
  const envKey = `RUFORGE_HANDOFF_${name.toUpperCase()}`;
  return process.env[envKey] || '';
}

ensureRemotes();

// push first (may no-op commit)
try {
  execFileSync(process.execPath, [join(root, 'scripts/triggers/push.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
} catch {
  console.error('leave: push failed; handoff not written');
  process.exit(1);
}

const branch = currentBranch();
const hash = shortHash();
const wip = arg('wip') || 'See recent commits on this branch.';
const next = arg('next') || 'Continue from the latest commit on this branch.';
const questions = arg('questions') || 'None.';
const windowsRaw = (arg('windows') || 'no').toLowerCase();
const needsWindows = ['1', 'true', 'yes', 'y'].includes(windowsRaw);

mkdirSync(handoffsDir, { recursive: true });
const file = `${today()}-${sanitizeBranchForFilename(branch)}.md`;
const full = join(handoffsDir, file);
const body = `# Handoff ${today()} — \`${branch}\`

- **branch:** \`${branch}\`
- **commit:** \`${hash}\`
- **needs Windows:** ${needsWindows ? 'yes' : 'no'}

## Work in progress

${wip}

## Exact next step

${next}

## Open questions

${questions}
`;

writeFileSync(full, body);

// commit handoff via push trigger
execFileSync(process.execPath, [join(root, 'scripts/triggers/push.mjs'), `docs: handoff ${file}`], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, RUFORGE_COMMIT_MSG: `docs: handoff ${file}` },
});

console.log(`leaving ${branch} @ ${shortHash()}`);
console.log(`handoff ${file}`);
