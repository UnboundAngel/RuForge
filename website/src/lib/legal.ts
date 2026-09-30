import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { marked } from 'marked';

const legalDir = fileURLToPath(new URL('../../../docs/ruforge/legal/', import.meta.url));

const blockLine =
  /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```| {4}|\t|\|)/;

/**
 * Legal docs in docs/ruforge/legal/ use escaped markdown with every wrapped line followed by
 * one blank line; real paragraph breaks are runs of two or more blank lines.
 * Unescape and reflow into normal paragraphs before marked parses them.
 */
export function normalizeLegalMarkdown(raw: string): string {
  const text = raw
    .replace(/\\#/g, '#')
    .replace(/\\\*/g, '*')
    .replace(/\\-/g, '-')
    .replace(/&#x20;/g, ' ')
    .replace(/\r\n/g, '\n');

  const rawLines = text.split('\n');
  const blocks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (!current) return;
    blocks.push(current);
    current = '';
  };

  let blankRun = 0;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      blankRun += 1;
      continue;
    }
    if (blankRun >= 2) pushCurrent();
    blankRun = 0;

    if (line.startsWith(' ') || line.startsWith('\t')) {
      const lastBlock = blocks.at(-1);
      if (lastBlock && /^[-*+]\s/.test(lastBlock)) {
        blocks[blocks.length - 1] = `${lastBlock} ${trimmed}`;
      } else {
        current = current ? `${current} ${trimmed}` : trimmed;
      }
      continue;
    }

    if (blockLine.test(trimmed)) {
      pushCurrent();
      blocks.push(trimmed);
      continue;
    }

    if (/^[-*+]\s/.test(trimmed)) {
      pushCurrent();
      current = trimmed;
      continue;
    }

    current = current ? `${current} ${trimmed}` : trimmed;
  }
  pushCurrent();

  return blocks.join('\n\n').trim();
}

export function loadLegalMarkdown(filename: string): string {
  const filePath = path.join(legalDir, filename);
  return normalizeLegalMarkdown(readFileSync(filePath, 'utf-8'));
}

marked.setOptions({
  gfm: true,
  breaks: false,
});

/** Anchor ids so other pages can deep link a policy section, e.g. /legal/privacy#logs-and-crash-data. */
export function legalHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      return `<h${depth} id="${legalHeadingId(html)}">${html}</h${depth}>\n`;
    },
  },
});

/**
 * Item-level anchors: id -> a phrase from the paragraph or bullet it should land on.
 * The build fails if a phrase stops matching, so policy edits cannot silently break site links.
 */
const LEGAL_ITEM_ANCHORS: Record<string, Record<string, string>> = {
  'PRIVACY.md': {
    'login-cookies': 'it sends those cookies to the source site',
    'login-stored-locally': 'browser session data is stored locally',
    'no-telemetry': 'No analytics or telemetry in a standard session',
    'no-crash-data': 'RuForge does not collect crash data',
  },
};

function addItemAnchors(filename: string, html: string): string {
  const anchors = LEGAL_ITEM_ANCHORS[filename];
  if (!anchors) return html;
  const pending = new Map(Object.entries(anchors));
  const out = html.replace(/<(p|li)>([\s\S]*?)<\/\1>/g, (block, tag: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'");
    for (const [id, phrase] of pending) {
      if (text.includes(phrase)) {
        pending.delete(id);
        return `<${tag} id="${id}">${inner}</${tag}>`;
      }
    }
    return block;
  });
  if (pending.size > 0) {
    throw new Error(`${filename}: legal anchor phrase not found for ${[...pending.keys()].join(', ')}`);
  }
  return out;
}

export function renderLegalHtml(filename: string): string {
  const markdown = loadLegalMarkdown(filename);
  return addItemAnchors(filename, marked.parse(markdown) as string);
}
