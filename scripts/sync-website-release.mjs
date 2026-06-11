#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const skipInstaller = args.includes('--skip-installer');
const skipBuild = args.includes('--skip-build');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function releaseSlug(version) {
  return `v${version.replace(/\./g, '-')}`;
}

function releaseDate(pubDate) {
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid updater.json pub_date: ${pubDate}`);
  }
  return d.toISOString().slice(0, 10);
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function yamlList(key, items) {
  if (!items.length) return `${key}: []`;
  return [`${key}:`, ...items.map((item) => `  - ${yamlQuote(item)}`)].join('\n');
}

function parseUpdaterNotes(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) {
    throw new Error('updater.json notes must be structured JSON with additions and fixes arrays');
  }
  const parsed = JSON.parse(trimmed);
  const additions = Array.isArray(parsed.additions)
    ? parsed.additions.filter((x) => typeof x === 'string')
    : [];
  const fixes = Array.isArray(parsed.fixes)
    ? parsed.fixes.filter((x) => typeof x === 'string')
    : [];
  return { additions, fixes };
}

function writeReleaseMarkdown(version, date, additions, fixes) {
  const slug = releaseSlug(version);
  const outPath = join(repoRoot, 'website', 'src', 'content', 'releases', `${slug}.md`);
  const frontmatter = [
    '---',
    `version: ${yamlQuote(version)}`,
    `date: ${date}`,
    yamlList('additions', additions),
    yamlList('fixes', fixes),
    '---',
    '',
  ].join('\n');
  writeFileSync(outPath, frontmatter, 'utf-8');
  return outPath;
}

function runPowerShell(scriptPath) {
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runWebsiteBuild() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['run', 'build'], {
    cwd: join(repoRoot, 'website'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const pkg = readJson(join(repoRoot, 'package.json'));
const updater = readJson(join(repoRoot, 'updater.json'));

if (pkg.version !== updater.version) {
  console.error(
    `Version mismatch: package.json=${pkg.version}, updater.json=${updater.version}`,
  );
  process.exit(1);
}

const { additions, fixes } = parseUpdaterNotes(updater.notes);
const date = releaseDate(updater.pub_date);
const outPath = writeReleaseMarkdown(pkg.version, date, additions, fixes);
console.log(`Wrote ${outPath}`);

if (!skipInstaller) {
  const copyScript = join(repoRoot, 'website', 'scripts', 'copy-installer-for-website.ps1');
  runPowerShell(copyScript);
} else {
  console.log('Skipped installer copy (--skip-installer)');
}

if (!skipBuild) {
  console.log('Running website build...');
  runWebsiteBuild();
} else {
  console.log('Skipped website build (--skip-build)');
}

console.log('Website release sync complete.');
