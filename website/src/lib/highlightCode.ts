import { createHighlighter, type Highlighter } from 'shiki';
import { ruforgeShikiTheme } from './ruforgeShikiTheme';

const LANGS = [
  'typescript',
  'tsx',
  'rust',
  'json',
  'css',
  'javascript',
] as const;

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [ruforgeShikiTheme],
      langs: [...LANGS],
    });
  }
  return highlighterPromise;
}

export async function highlightCode(code: string, language: string): Promise<string> {
  const highlighter = await getHighlighter();
  const lang = highlighter.getLoadedLanguages().includes(language as (typeof LANGS)[number])
    ? language
    : 'typescript';

  return highlighter.codeToHtml(code, {
    theme: 'ruforge',
    lang,
    transformers: [
      {
        pre(node) {
          node.properties.class = 'rf-code-shiki';
        },
      },
    ],
  });
}
