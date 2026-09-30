import { DOCS_CONTENT } from './docsContent';

const WORDS_PER_MINUTE = 200;

function collectText(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectText(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectText(v, out));
}

/** Minutes to read a docs page, or null when the page has no written content yet. */
export function docsReadingMinutes(slug: string): number | null {
  const content = DOCS_CONTENT[slug];
  if (!content) return null;
  const parts: string[] = [];
  collectText(content, parts);
  const words = parts
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter((w) => /\w/.test(w)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
