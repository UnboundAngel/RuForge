#!/usr/bin/env node
/**
 * Scheduled features: build now, ship dark in the signed app, stay off public until the date.
 * Rules: docs/agents/SCHEDULED.md
 *
 *   node scripts/scheduled.mjs add <id> --unlock YYYY-MM-DD [--rust] [--title "..."]
 *   node scripts/scheduled.mjs list
 *   node scripts/scheduled.mjs check
 *   node scripts/scheduled.mjs server <id> open|hold|YYYY-MM-DD|clear
 *   node scripts/scheduled.mjs release <id>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RS_ROOT,
  TS_ROOT,
  UNLOCKS_FILE,
  findContentLeaks,
  leakTerms,
  localToday,
  readFeaturesFromDisk,
  readUnlocks,
  root,
  scheduledPrivatePathsOnDisk,
  snake,
} from './scheduled-lib.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function featureFile(id) {
  return join(root, TS_ROOT, id, 'feature.json');
}

function requireFeature(id) {
  const f = readFeaturesFromDisk().find((x) => x.id === id);
  if (!f) die(`no scheduled feature "${id}" (looked in ${TS_ROOT}/)`);
  return f;
}

function writeIfMissing(path, text) {
  if (existsSync(path)) return false;
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  return true;
}

function add(args) {
  const id = args[0];
  const unlockAt = flag(args, '--unlock');
  if (!id || !ID_RE.test(id)) die('id must be kebab-case with at least two words, e.g. some-feature');
  if (!unlockAt || !DATE_RE.test(unlockAt)) die('--unlock YYYY-MM-DD is required');
  if (existsSync(featureFile(id))) die(`${id} already exists`);
  const feature = {
    title: flag(args, '--title') ?? id,
    unlockAt,
    released: false,
    leakTerms: [],
    privatePaths: [],
  };
  writeIfMissing(featureFile(id), `${JSON.stringify(feature, null, 2)}\n`);
  writeIfMissing(
    join(root, TS_ROOT, id, 'index.tsx'),
    `import type { ScheduledFeatureModule } from "@/lib/scheduled/registry";

// Keep this file free of side effects: it loads only after the feature unlocks.
const feature: ScheduledFeatureModule = {
  slots: {},
};

export default feature;
`,
  );
  writeIfMissing(
    join(root, TS_ROOT, id, 'PLAN.md'),
    `# ${feature.title}\n\nUnlocks ${unlockAt} (local midnight). Private until released; see docs/agents/SCHEDULED.md.\n`,
  );
  if (args.includes('--rust')) {
    writeIfMissing(
      join(root, RS_ROOT, snake(id), 'mod.rs'),
      `//! Rust side of the ${id} scheduled feature. Reached only through \`scheduled_invoke\`,
//! which refuses while the feature is locked.

use serde_json::Value;
use tauri::AppHandle;

pub async fn dispatch(_app: &AppHandle, method: &str, _args: Value) -> Result<Value, String> {
    match method {
        _ => Err(format!("${id}: unknown method {method}")),
    }
}
`,
    );
  }
  console.log(`added ${id}, unlocks ${unlockAt}`);
  console.log(`  ${TS_ROOT}/${id}/   (private until released)`);
  if (args.includes('--rust')) console.log(`  ${RS_ROOT}/${snake(id)}/`);
  console.log('next: add leakTerms to feature.json (names users would recognise), mount through a slot in src/lib/scheduled/registry.ts');
}

function list() {
  const features = readFeaturesFromDisk();
  if (!features.length) return console.log('no scheduled features');
  const server = readUnlocks().features ?? {};
  const today = localToday();
  for (const f of features) {
    const state = f.released ? 'released' : f.unlockAt && today >= f.unlockAt ? 'date passed, not released' : 'locked';
    const srv = server[f.id] ? `  server: ${server[f.id]}` : '';
    console.log(`${f.id.padEnd(28)} ${String(f.unlockAt).padEnd(11)} ${state}${srv}`);
  }
}

function check() {
  let failed = false;
  const features = readFeaturesFromDisk();
  const today = localToday();
  for (const f of features) {
    if (!f.unlockAt || !DATE_RE.test(f.unlockAt)) {
      console.error(`${f.id}: feature.json missing or unlockAt is not YYYY-MM-DD`);
      failed = true;
    } else if (!f.released && today >= f.unlockAt) {
      console.warn(`${f.id}: unlock date ${f.unlockAt} has passed; run \`node scripts/scheduled.mjs release ${f.id}\` once it is live`);
    }
  }
  const hidden = scheduledPrivatePathsOnDisk();
  const leaks = findContentLeaks(null, leakTerms(features)).filter(
    (p) => !hidden.some((h) => p === h || p.startsWith(`${h}/`)),
  );
  if (leaks.length) {
    console.error('these files would publish and name an unreleased scheduled feature:');
    for (const p of leaks) console.error(`  ${p}`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log(`scheduled: ${features.length} feature(s) ok`);
}

function server(args) {
  const [id, value] = args;
  if (!id || !value) die('usage: server <id> open|hold|YYYY-MM-DD|clear');
  requireFeature(id);
  if (!['open', 'hold', 'clear'].includes(value) && !DATE_RE.test(value)) die('value must be open, hold, clear or YYYY-MM-DD');
  const data = readUnlocks();
  data.features ??= {};
  if (value === 'clear') delete data.features[id];
  else data.features[id] = value;
  writeFileSync(join(root, UNLOCKS_FILE), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${UNLOCKS_FILE}: ${id} -> ${value}`);
  console.log('This file is public once published, and it names the feature. Takes effect after:');
  console.log(`  commit and push, then RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs --only ${UNLOCKS_FILE} "Unlocks: ${id} ${value}"`);
}

function release(args) {
  const id = args[0];
  const f = requireFeature(id);
  if (f.released) die(`${id} is already released`);
  if (localToday() < f.unlockAt && !args.includes('--early')) {
    die(`${id} unlocks ${f.unlockAt}; releasing publishes its source. Pass --early to do it anyway.`);
  }
  const file = featureFile(id);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.released = true;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  const data = readUnlocks();
  if (data.features?.[id]) {
    delete data.features[id];
    writeFileSync(join(root, UNLOCKS_FILE), `${JSON.stringify(data, null, 2)}\n`);
  }
  console.log(`${id} released: its source publishes with the next snapshot and the gate is always open.`);
  console.log('Now: log it with node scripts/shipped.mjs add, flip any roadmap entry, then commit and push.');
}

const [cmd, ...rest] = process.argv.slice(2);
const commands = { add, list, check, server, release };
if (!commands[cmd]) die('usage: scheduled.mjs add|list|check|server|release (see header)');
commands[cmd](rest);
