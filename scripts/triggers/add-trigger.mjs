#!/usr/bin/env node
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  root,
  loadRegistry,
  saveRegistry,
  updateAgentsTriggerTable,
} from './lib.mjs';

/**
 * Usage:
 *   node scripts/triggers/add-trigger.mjs "phrase one|phrase two" "one-line effect"
 * Or utterance form handled by run.mjs:
 *   add trigger: <phrase> -> <behavior>
 */
function parseArgs(argv) {
  const joined = argv.join(' ');
  const arrow = joined.match(/^(.+?)\s*->\s*(.+)$/);
  if (arrow) {
    return {
      phrases: arrow[1]
        .replace(/^add\s+trigger:\s*/i, '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean),
      effect: arrow[2].trim(),
    };
  }
  if (argv.length >= 2) {
    return {
      phrases: argv[0].split('|').map((s) => s.trim()).filter(Boolean),
      effect: argv.slice(1).join(' ').trim(),
    };
  }
  return null;
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed?.phrases?.length || !parsed.effect) {
  console.error(
    'usage: node scripts/triggers/add-trigger.mjs "phrase|alt" "effect"\n' +
      '   or: node scripts/triggers/add-trigger.mjs "phrase -> effect"',
  );
  process.exit(1);
}

const id = parsed.phrases[0]
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40) || 'trigger';

const scriptRel = `scripts/triggers/${id}.mjs`;
const scriptAbs = join(root, scriptRel);
if (existsSync(scriptAbs)) {
  console.error(`script already exists: ${scriptRel}`);
  process.exit(1);
}

const stub = `#!/usr/bin/env node
/** Trigger: ${parsed.phrases.join(' | ')} */
console.log(${JSON.stringify(parsed.effect)});
// TODO: implement behavior
process.exit(0);
`;
writeFileSync(scriptAbs, stub);

const reg = loadRegistry();
if (reg.triggers.some((t) => t.id === id)) {
  console.error(`registry id already exists: ${id}`);
  process.exit(1);
}
reg.triggers.push({
  id,
  phrases: parsed.phrases,
  script: scriptRel,
  effect: parsed.effect,
});
saveRegistry(reg);
updateAgentsTriggerTable(reg);

execFileSync(process.execPath, [join(root, 'scripts/triggers/push.mjs'), `chore(triggers): add ${id}`], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, RUFORGE_COMMIT_MSG: `chore(triggers): add ${id}` },
});

console.log(`added trigger ${id} -> ${scriptRel}`);
