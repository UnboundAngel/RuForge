/**
 * Shared Games leak scan for publish-snapshot and the public pre-push hook.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesListPath = join(root, 'scripts/games-paths.txt');

export function readGamesPatterns() {
  return readFileSync(gamesListPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

function globToRegExp(pattern) {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') out += '[^/]*';
    else if ('.+^$()[]{}|\\'.includes(c)) out += `\\${c}`;
    else out += c;
  }
  return new RegExp(`${out}$`, 'i');
}

/** True for the public Games stub; never treat as a leak. */
export function isGamesStubPath(filePath) {
  const p = filePath.replace(/\\/g, '/').toLowerCase();
  return p === 'src/games-stub' || p.startsWith('src/games-stub/');
}

export function pathMatchesGames(filePath, patterns) {
  if (isGamesStubPath(filePath)) return false;
  const norm = filePath.replace(/\\/g, '/');
  const lower = norm.toLowerCase();
  const base = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower;
  for (const raw of patterns) {
    const p = raw.replace(/\\/g, '/');
    const pLower = p.toLowerCase();
    if (p.includes('*')) {
      const re = globToRegExp(pLower);
      if (re.test(base) || re.test(lower)) return true;
      continue;
    }
    if (pLower.endsWith('/')) {
      const dir = pLower.slice(0, -1);
      if (lower === dir || lower.startsWith(`${dir}/`)) return true;
      continue;
    }
    if (lower === pLower || lower.startsWith(pLower)) return true;
  }
  return false;
}

export function findGamesLeaks(filePaths, patterns = readGamesPatterns()) {
  if (!patterns.length) {
    throw new Error('games path list is empty (scripts/games-paths.txt)');
  }
  return filePaths.filter((f) => pathMatchesGames(f, patterns));
}
