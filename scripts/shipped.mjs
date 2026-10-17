#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const logPath = join(repoRoot, 'docs/agents/release/shipped.jsonl');
const gamesLogPath = join(repoRoot, 'docs/agents/release/shipped-games.jsonl');
const statePath = join(repoRoot, 'STATE.md');
const DEFAULT_ENTRY = '.shipped-entry.txt';
const FILE_RE = /(?:[/\\]|\.(?:ts|tsx|rs|js|mjs|css|md|json|astro|toml))$/i;

function usage(exit = 1) {
  console.error(`Write ${DEFAULT_ENTRY} then:
node scripts/shipped.mjs add
node scripts/shipped.mjs amend
node scripts/shipped.mjs add --games   (private Games log, same format)
node scripts/shipped.mjs retag 0.6.2 0.7.0
node scripts/shipped.mjs park Games   (move unreleased rows of an area to the Games log)
node scripts/shipped.mjs find sponsorblock
node scripts/shipped.mjs list`);
  process.exit(exit);
}

function shippingVersion() {
  const state = readFileSync(statePath, 'utf8');
  const m = state.match(/^Shipping version:\s*(\d+\.\d+\.\d+)/m);
  if (!m) throw new Error('Could not parse Shipping version from STATE.md');
  return m[1];
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function readRows() {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSONL at line ${i + 1} in ${logPath}`);
      }
    });
}

function writeRows(rows) {
  const body = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  writeFileSync(logPath, body, 'utf8');
}

function bumpStateStamp() {
  const state = readFileSync(statePath, 'utf8');
  const next = state.replace(
    /^Last updated:.*$/m,
    `Last updated: ${today()} (Unreleased log)`,
  );
  if (next !== state) writeFileSync(statePath, next, 'utf8');
}

function printRow(row) {
  const files = Array.isArray(row.files) && row.files.length ? ` \`${row.files.join('` / `')}\`` : '';
  console.log(`- **${row.area}**: ${row.text}${files}`);
}

function looksLikeFile(token) {
  return FILE_RE.test(token) && !token.startsWith('-');
}

function resolveEntry(arg) {
  const raw = arg && !String(arg).startsWith('-') ? String(arg) : DEFAULT_ENTRY;
  return isAbsolute(raw) ? raw : join(repoRoot, raw);
}

function parseLogBody(raw) {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const head = lines[0];
  const colon = head.indexOf(':');
  if (colon < 1) return null;
  const area = head.slice(0, colon).trim();
  const text = head.slice(colon + 1).trim();
  const files = [];
  for (const line of lines.slice(1)) {
    if (!looksLikeFile(line)) return null;
    files.push(line);
  }
  if (!area || !text) return null;
  return { area, text, files };
}

function readEntryFile(arg) {
  const path = resolveEntry(arg);
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Write ${DEFAULT_ENTRY} first (Area: sentence. then optional file lines).`);
    process.exit(1);
  }
  const parsed = parseLogBody(readFileSync(path, 'utf8'));
  if (!parsed) {
    console.error(`Could not parse ${path}. First line must be Area: sentence. Extra lines must be filenames.`);
    process.exit(1);
  }
  return { path, parsed };
}

function consumeEntry(path) {
  try {
    unlinkSync(path);
  } catch {
    console.error(`Logged, but could not delete ${path}. Delete it by hand.`);
  }
}

function cmdAdd(arg, games) {
  const { path, parsed } = readEntryFile(arg);
  const target = games ? gamesLogPath : logPath;
  const row = {
    v: shippingVersion(),
    area: parsed.area,
    text: parsed.text,
    files: parsed.files,
    at: today(),
  };
  // Editors that save without a final newline would glue this row onto the last one.
  const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const lead = existing && !existing.endsWith('\n') ? '\n' : '';
  appendFileSync(target, lead + JSON.stringify(row) + '\n', 'utf8');
  if (!games) bumpStateStamp();
  consumeEntry(path);
  console.log(JSON.stringify(row));
}

function cmdAmend(arg) {
  const { path, parsed } = readEntryFile(arg);
  const v = shippingVersion();
  const rows = readRows();
  let idx = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].v === v && String(rows[i].area).toLowerCase() === parsed.area.toLowerCase()) {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    console.error(`No unreleased row for area "${parsed.area}" at v${v}. Use add.`);
    process.exit(1);
  }
  const replaced = rows[idx];
  rows[idx] = {
    ...replaced,
    text: parsed.text,
    files: parsed.files.length ? parsed.files : replaced.files,
    at: today(),
  };
  writeRows(rows);
  bumpStateStamp();
  consumeEntry(path);
  console.log('replaced', JSON.stringify(replaced));
  console.log('now', JSON.stringify(rows[idx]));
}

function cmdRetag(from, to) {
  if (!from || !to) usage();
  let n = 0;
  const rows = readRows().map((row) => (row.v === from ? (n++, { ...row, v: to }) : row));
  writeRows(rows);
  console.log(`retagged ${n} rows ${from} -> ${to}`);
}

function cmdPark(area) {
  if (!area) usage();
  const v = shippingVersion();
  const rows = readRows();
  const moved = rows.filter((r) => r.v === v && String(r.area).toLowerCase() === area.toLowerCase());
  if (!moved.length) return console.log('nothing to park');
  writeRows(rows.filter((r) => !moved.includes(r)));
  appendFileSync(gamesLogPath, moved.map((r) => JSON.stringify(r) + '\n').join(''), 'utf8');
  console.log(`parked ${moved.length} rows in ${gamesLogPath}`);
}

function cmdFind(rest) {
  const q = rest.join(' ').trim().toLowerCase();
  if (!q) usage();
  const hits = readRows().filter((row) => {
    const blob = `${row.v} ${row.area} ${row.text} ${(row.files || []).join(' ')}`.toLowerCase();
    return blob.includes(q);
  });
  console.log(hits.length ? JSON.stringify(hits, null, 2) : '[]');
}

function cmdList() {
  const v = shippingVersion();
  const hits = readRows().filter((row) => row.v === v);
  console.log(`# v${v} unreleased (${hits.length})`);
  for (const row of hits.slice().reverse()) printRow(row);
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);

if (cmd === 'add') cmdAdd(rest.find((a) => !a.startsWith('-')), rest.includes('--games'));
else if (cmd === 'retag') cmdRetag(rest[0], rest[1]);
else if (cmd === 'park') cmdPark(rest[0]);
else if (cmd === 'amend') cmdAmend(rest[0]);
else if (cmd === 'find' || cmd === 'search') cmdFind(rest);
else if (cmd === 'list' || cmd === 'unreleased') cmdList();
else usage(cmd === '-h' || cmd === '--help' ? 0 : 1);
