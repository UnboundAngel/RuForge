const SUBJECT_MAX = 72;

export const SHIPPED_LOG = 'docs/agents/release/shipped.jsonl';

const BOOKKEEPING = new Set([SHIPPED_LOG, 'STATE.md', '.shipped-entry.txt']);

function clip(text, max = SUBJECT_MAX) {
  const flat = text.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 3);
  const space = cut.lastIndexOf(' ');
  return `${space > max / 2 ? cut.slice(0, space) : cut}...`;
}

/** Entries added to shipped.jsonl in this diff, from `git diff --cached -U0 -- <log>`. */
export function shippedEntriesAdded(diff) {
  const entries = [];
  for (const line of diff.split(/\r?\n/)) {
    if (!line.startsWith('+{')) continue;
    try {
      const e = JSON.parse(line.slice(1));
      if (e && typeof e.text === 'string' && e.text.trim()) entries.push(e);
    } catch {
      // half a JSON line is not an entry
    }
  }
  return entries;
}

/** `git diff --cached --numstat` rows as { file, changed }. Binary rows count as one line. */
export function parseNumstat(numstat) {
  return numstat
    .split(/\r?\n/)
    .filter(Boolean)
    .map((row) => {
      const [added, removed, ...path] = row.split('\t');
      const n = (v) => (v === '-' ? 1 : Number(v) || 0);
      return { file: path.join('\t'), changed: n(added) + n(removed) };
    });
}

function basename(file) {
  return file.replace(/^.*\//, '');
}

export function deriveCommitMessage({ numstat = [], shipped = [], stat = '' }) {
  if (!numstat.length) return null;
  let subject;
  if (shipped.length) {
    const [first] = shipped;
    const lead = first.area ? `${first.area}: ${first.text}` : first.text;
    subject = clip(lead);
  } else {
    const real = numstat.filter((r) => !BOOKKEEPING.has(r.file));
    const pool = real.length ? real : numstat;
    const ranked = [...pool].sort((a, b) => b.changed - a.changed).map((r) => basename(r.file));
    const phrase = (n) => {
      const rest = ranked.length - n;
      return `Update ${ranked.slice(0, n).join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`;
    };
    let n = 1;
    while (n < Math.min(3, ranked.length) && phrase(n + 1).length <= SUBJECT_MAX) n += 1;
    subject = clip(phrase(n));
  }
  const body = [];
  if (shipped.length > 1) {
    body.push(...shipped.map((e) => `- ${e.area ? `${e.area}: ` : ''}${e.text.trim()}`), '');
  }
  if (stat) body.push(stat);
  return (body.length ? `${subject}\n\n${body.join('\n')}` : subject).slice(0, 2000);
}
