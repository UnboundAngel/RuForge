#!/usr/bin/env node
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadRegistry, matchTrigger, root, normalizeUtterance } from './lib.mjs';

const argv = process.argv.slice(2);
const msgFlag = argv.findIndex((a) => a === '-m' || a === '--message');
const commitMessage = msgFlag >= 0 ? (argv[msgFlag + 1] || '').trim() : '';
if (msgFlag >= 0) argv.splice(msgFlag, 2);

const utterance = argv.join(' ').trim();
if (!utterance) {
  console.error('usage: node scripts/triggers/run.mjs "<utterance>" [-m "<commit message>"]');
  process.exit(1);
}

const reg = loadRegistry();
const trigger = matchTrigger(utterance, reg);
if (!trigger) {
  console.error(`no trigger matched: ${normalizeUtterance(utterance)}`);
  process.exit(2);
}

// Special parse for add trigger: <phrase> -> <behavior>
if (trigger.id === 'add-trigger') {
  const m = utterance.match(/add\s+trigger:\s*(.+)$/i);
  const args = m ? [m[1]] : process.argv.slice(2);
  execFileSync(process.execPath, [join(root, trigger.script), ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  process.exit(0);
}

console.log(`matched ${trigger.id} (${trigger.script})`);
execFileSync(process.execPath, [join(root, trigger.script)], {
  cwd: root,
  stdio: 'inherit',
  env: commitMessage ? { ...process.env, RUFORGE_COMMIT_MSG: commitMessage } : process.env,
});
