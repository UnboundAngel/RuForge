import fs from 'node:fs';
import path from 'node:path';

/** Astro build cwd is `website/`; repo root is one level up. */
const REPO_ROOT = path.resolve(process.cwd(), '..');

export interface CodeSnippetSource {
  file: string;
  startLine?: number;
  endLine?: number;
  highlightLines?: number[];
  caption: string;
}

export interface ResolvedCodeSnippet {
  file: string;
  language: string;
  languageLabel: string;
  caption: string;
  lineCount: number;
  startLine: number;
  endLine: number;
  highlightLines?: number[];
  code: string;
  lineHint: string;
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  rs: 'rust',
  json: 'json',
  css: 'css',
  mjs: 'javascript',
  js: 'javascript',
  astro: 'tsx',
};

const LANG_LABEL: Record<string, string> = {
  typescript: 'TypeScript',
  tsx: 'TSX',
  rust: 'Rust',
  json: 'JSON',
  css: 'CSS',
  javascript: 'JavaScript',
};

function languageFromFile(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXT_LANG[ext] ?? ext;
}

function languageLabel(lang: string): string {
  return LANG_LABEL[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
}

function formatLineHint(startLine: number, endLine: number): string {
  if (startLine === endLine) return `L${startLine}`;
  return `L${startLine}-${endLine}`;
}

export function readCodeSnippet(source: CodeSnippetSource): ResolvedCodeSnippet {
  const absPath = path.join(REPO_ROOT, source.file);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Code snippet file not found: ${source.file}`);
  }

  const raw = fs.readFileSync(absPath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const startLine = Math.max(1, source.startLine ?? 1);
  const endLine = Math.min(lines.length, source.endLine ?? lines.length);

  if (startLine > endLine) {
    throw new Error(`Invalid line range for ${source.file}: ${startLine}-${endLine}`);
  }

  const slice = lines.slice(startLine - 1, endLine);
  const language = languageFromFile(source.file);

  return {
    file: source.file.replace(/\\/g, '/'),
    language,
    languageLabel: languageLabel(language),
    caption: source.caption,
    lineCount: slice.length,
    startLine,
    endLine,
    highlightLines: source.highlightLines,
    code: slice.join('\n'),
    lineHint: formatLineHint(startLine, endLine),
  };
}
