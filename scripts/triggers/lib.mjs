import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const registryPath = join(root, 'scripts/triggers/registry.json');
export const handoffsDir = join(root, 'docs/agents/handoffs');

export const GERMAN = {
  ich: 'i',
  bin: 'am',
  und: 'and',
  es: 'it',
  mein: 'my',
  meine: 'my',
  meiner: 'my',
  meins: 'my',
  ist: 'is',
  nicht: 'not',
  fuer: 'for',
  für: 'for',
  mit: 'with',
  zu: 'to',
  auf: 'on',
  der: 'the',
  die: 'the',
  das: 'the',
  ein: 'a',
  eine: 'a',
  von: 'from',
  nach: 'to',
  auch: 'also',
  noch: 'still',
  schon: 'already',
  nur: 'only',
  hier: 'here',
  da: 'there',
  was: 'what',
  wie: 'how',
  wenn: 'if',
  dann: 'then',
  aber: 'but',
  oder: 'or',
  weil: 'because',
  jetzt: 'now',
  heute: 'today',
  gut: 'good',
  ja: 'yes',
  nein: 'no',
  bitte: 'please',
  danke: 'thanks',
  lass: 'let',
  lassen: 'leave',
  gehe: 'go',
  gehen: 'go',
  komme: 'come',
  kommen: 'come',
  zurueck: 'back',
  zurück: 'back',
  fertig: 'done',
  weg: 'away',
  wieder: 'again',
  mal: 'once',
  gleich: 'soon',
  spaeter: 'later',
  später: 'later',
};

export function run(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(opts.env || {}) },
  }).trim();
}

export function runNode(scriptArgs, opts = {}) {
  return execFileSync(process.execPath, scriptArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: opts.stdio || 'inherit',
    env: { ...process.env, ...(opts.env || {}) },
  });
}

export function loadRegistry() {
  return JSON.parse(readFileSync(registryPath, 'utf8'));
}

export function saveRegistry(reg) {
  writeFileSync(registryPath, `${JSON.stringify(reg, null, 2)}\n`);
}

export function normalizeUtterance(text) {
  let s = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s->]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s
    .split(' ')
    .map((w) => GERMAN[w] || w)
    .join(' ');
  return s;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function fuzzyIncludes(haystack, needle, maxDist) {
  if (haystack.includes(needle)) return true;
  const hWords = haystack.split(' ');
  const nWords = needle.split(' ');
  if (nWords.length > hWords.length) return false;
  for (let i = 0; i <= hWords.length - nWords.length; i++) {
    let ok = true;
    for (let j = 0; j < nWords.length; j++) {
      const hw = hWords[i + j];
      const nw = nWords[j];
      const allow = Math.max(maxDist, nw.length >= 6 ? 2 : 1);
      if (hw === nw) continue;
      if (levenshtein(hw, nw) <= allow) continue;
      ok = false;
      break;
    }
    if (ok) return true;
  }
  return false;
}

export function matchTrigger(utterance, registry = loadRegistry()) {
  const norm = normalizeUtterance(utterance);
  const maxDist = registry.match?.typoMaxDistance ?? 1;
  // Prefer longer phrase matches
  const ranked = [];
  for (const t of registry.triggers) {
    for (const phrase of t.phrases) {
      const np = normalizeUtterance(phrase);
      // Exact triggers publish to public, so a passing mention must never fire them.
      const hit = t.exact ? norm === np : fuzzyIncludes(norm, np, maxDist);
      if (hit) {
        ranked.push({ trigger: t, phrase, len: np.length });
      }
    }
  }
  ranked.sort((a, b) => b.len - a.len);
  return ranked[0]?.trigger || null;
}

export function ensureRemotes() {
  const hooks = (() => {
    try {
      return run(['config', '--get', 'core.hooksPath']);
    } catch {
      return '';
    }
  })();
  let hasSync = true;
  try {
    run(['remote', 'get-url', 'sync']);
  } catch {
    hasSync = false;
  }
  if (hooks !== '.githooks' || !hasSync) {
    execFileSync(process.execPath, [join(root, 'scripts/setup-git-remotes.mjs')], {
      cwd: root,
      stdio: 'inherit',
    });
  }
}

export function currentBranch() {
  return run(['branch', '--show-current']);
}

export function shortHash() {
  return run(['rev-parse', '--short', 'HEAD']);
}

export function syncFetch() {
  // Prefer configured sync remote; may fail in cloud without private token.
  try {
    run(['fetch', 'sync', '--prune'], { stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch (err) {
    console.error(String(err?.stderr || err?.message || err));
    return false;
  }
}

export function sanitizeBranchForFilename(branch) {
  return String(branch || 'unknown')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function newestHandoff() {
  if (!existsSync(handoffsDir)) return null;
  const files = readdirSync(handoffsDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f))
    .map((f) => {
      const full = join(handoffsDir, f);
      return { file: f, full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => {
      const da = a.file.slice(0, 10);
      const db = b.file.slice(0, 10);
      if (da !== db) return db.localeCompare(da);
      return b.mtime - a.mtime;
    });
  return files[0] || null;
}

export function branchFromHandoffFilename(name) {
  // YYYY-MM-DD-<branch>.md  (branch may contain hyphens)
  const m = name.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
  if (!m) return null;
  // Prefer reconstructing known remote branch if sync has a match
  return m[1];
}

export function renderAgentsTriggerTable(registry) {
  const lines = [
    '| Phrase variants | Script | Effect |',
    '| --- | --- | --- |',
  ];
  for (const t of registry.triggers) {
    const phrases = t.phrases.map((p) => `\`${p}\``).join(', ');
    lines.push(`| ${phrases} | \`${t.script}\` | ${t.effect} |`);
  }
  return lines.join('\n');
}

export function updateAgentsTriggerTable(registry) {
  const agentsPath = join(root, 'AGENTS.md');
  const text = readFileSync(agentsPath, 'utf8');
  const table = renderAgentsTriggerTable(registry);
  const block = `## Trigger phrases

Matching: any casing, typos, and Angel's German swaps (\`ich\`=\`I\`, \`bin\`=\`am\`, \`und\`=\`and\`, \`es\`=\`it\`, \`mein\`=\`my\`, and the map in \`scripts/triggers/lib.mjs\`). Example: \`commit und push\` and \`ich bin leaving\` both match. Ship phrases match only as the entire message (punctuation and casing ignored), and ship is the only trigger that asks before acting: it waits for an explicit \`yes\`. Behavior lives in \`scripts/triggers/*.mjs\` (\`node scripts/triggers/run.mjs "<utterance>"\`).

${table}

`;
  // Windows checkouts get CRLF from autocrlf; match either and keep the file's own line endings.
  const re = /## Trigger phrases\r?\n[\s\S]*?(?=\r?\n## )/;
  if (!re.test(text)) {
    throw new Error('AGENTS.md missing ## Trigger phrases section');
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(agentsPath, text.replace(re, () => block.replace(/\n/g, eol)));
}
