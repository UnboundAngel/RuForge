#!/usr/bin/env node
/**
 * Checks that ruforge.app serves the release in updater.json: header "Latest" badge, download
 * buttons, changelog, roadmap entries, roadmap next version (from STATE.md), and updater.json.
 *   node scripts/verify-website-release.mjs              one pass
 *   node scripts/verify-website-release.mjs --wait 600   retry until green or 600s pass
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './triggers/lib.mjs';

const SITE = 'https://ruforge.app';
const argv = process.argv.slice(2);
const waitAt = argv.indexOf('--wait');
const waitSecs = waitAt >= 0 ? Number(argv[waitAt + 1]) || 0 : 0;

const version = JSON.parse(readFileSync(join(root, 'updater.json'), 'utf8')).version;
const state = readFileSync(join(root, 'STATE.md'), 'utf8');
const nextVersion = state.match(/^Shipping version:\s*(\d+\.\d+\.\d+)/m)?.[1]?.replace(/\.0$/, '') ?? null;
const roadmap = JSON.parse(readFileSync(join(root, 'website/src/content/roadmap.json'), 'utf8'));
const installer = `RuForge_${version}_x64-setup.exe`;

function decode(html) {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function get(path) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${SITE}${path}${sep}rfcheck=${Date.now()}`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.text();
}

async function runChecks() {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok, detail });

  try {
    const u = JSON.parse(await get('/updater.json'));
    check('updater.json version', u.version === version, `live ${u.version}`);
  } catch (e) {
    check('updater.json version', false, String(e.message || e));
  }

  try {
    const html = await get('/');
    const live = html.match(/site-header-version__number[^>]*>v([\d.]+)</)?.[1];
    check('Latest badge', live === version, `live ${live ?? 'missing'}`);
    const ld = html.match(/"softwareVersion":\s*"([\d.]+)"/)?.[1];
    check('JSON-LD softwareVersion', ld === undefined || ld === version, `live ${ld ?? 'not on page'}`);
  } catch (e) {
    check('Latest badge', false, String(e.message || e));
  }

  for (const path of ['/download', '/m/download']) {
    try {
      const html = await get(path);
      check(`${path} installer`, html.includes(installer), html.includes(installer) ? installer : 'installer name missing');
    } catch (e) {
      check(`${path} installer`, false, String(e.message || e));
    }
  }

  try {
    const html = await get('/changelog');
    check('/changelog entry', html.includes(`v${version}`), `v${version}`);
  } catch (e) {
    check('/changelog entry', false, String(e.message || e));
  }

  for (const path of ['/roadmap', '/m/roadmap']) {
    try {
      const html = decode(await get(path));
      const liveNext = html.match(/"nextVersion":\[0,"([^"]*)"\]/)?.[1] ?? null;
      check(`${path} next version`, nextVersion === null || liveNext === nextVersion, `live ${liveNext ?? 'none'}, STATE ${nextVersion}`);
      const missing = roadmap.filter((r) => !html.includes(r.featureName)).map((r) => r.featureName);
      check(`${path} entries`, missing.length === 0, missing.length ? `missing: ${missing.join('; ')}` : `${roadmap.length} entries`);
    } catch (e) {
      check(`${path} roadmap`, false, String(e.message || e));
    }
  }

  return results;
}

const deadline = Date.now() + waitSecs * 1000;
let results;
for (;;) {
  results = await runChecks();
  if (results.every((r) => r.ok) || Date.now() >= deadline) break;
  console.log(`waiting for deploy: ${results.filter((r) => !r.ok).map((r) => r.name).join(', ')}`);
  await new Promise((r) => setTimeout(r, 20000));
}

for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `website check failed: ${failed} item(s)` : `website serves v${version}`);
process.exit(failed ? 1 : 0);
