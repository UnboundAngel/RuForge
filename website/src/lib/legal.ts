import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { marked } from 'marked';

const legalDir = fileURLToPath(new URL('../../../docs/legal/', import.meta.url));

const blockLine =
  /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```| {4}|\t|\|)/;

/**
 * Legal docs in docs/legal/ use escaped markdown and hard line breaks per line.
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

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      pushCurrent();
      continue;
    }

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

export function renderLegalHtml(filename: string): string {
  const markdown = loadLegalMarkdown(filename);
  return marked.parse(markdown) as string;
}
