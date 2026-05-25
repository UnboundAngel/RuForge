import { normalizeYoutubeRollingVttIfNeeded } from "./youtubeRollingVttNormalize";
import type { Chapter } from "./types";

export type TranscriptCue = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

function stripVttMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&\w+;/g, (m) => HTML_ENTITIES[m] ?? m);
}

function stripSpeakerMarkers(text: string): string {
  return text
    .replace(/(?:>{2,}|»+)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCueText(raw: string): string {
  const noTags = stripVttMarkup(raw);
  const decoded = decodeHtmlEntities(noTags);
  return stripSpeakerMarkers(decoded);
}

function parseVttTimestamp(raw: string): number {
  const t = raw.trim().replace(",", ".");
  const parts = t.split(":");
  let h = 0;
  let m = 0;
  let secPart: string;
  if (parts.length === 3) {
    h = parseInt(parts[0]!, 10);
    m = parseInt(parts[1]!, 10);
    secPart = parts[2]!;
  } else if (parts.length === 2) {
    m = parseInt(parts[0]!, 10);
    secPart = parts[1]!;
  } else {
    secPart = parts[0]!;
  }
  const [sec, frac = "0"] = secPart.split(".");
  const ms = parseInt(frac.padEnd(3, "0").slice(0, 3), 10);
  return h * 3600 + m * 60 + parseInt(sec!, 10) + ms / 1000;
}

function parseRawVttCues(vtt: string): { start: number; end: number; body: string }[] {
  const text = vtt.replace(/^\uFEFF/, "");
  const blocks = text.split(/\r?\n\r?\n/);
  const cues: { start: number; end: number; body: string }[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.trimEnd();
    if (!block) continue;

    const lines = block.split(/\r?\n/);
    let timingIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes("-->")) {
        timingIdx = i;
        break;
      }
    }
    if (timingIdx === -1) continue;

    const timingLine = lines[timingIdx]!.trim();
    const m = timingLine.match(
      /^(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/,
    );
    if (!m) continue;

    const start = parseVttTimestamp(m[1]!);
    const end = parseVttTimestamp(m[2]!);
    const body = lines.slice(timingIdx + 1).join("\n").trimEnd();
    cues.push({ start, end, body });
  }

  return cues;
}

/**
 * Parse a VTT string into transcript cues. Handles both clean human-uploaded
 * VTTs and YouTube rolling auto-caption VTTs (deduplication via normalize pass).
 */
export function parseVttToTranscriptCues(vtt: string): TranscriptCue[] {
  const normalized = normalizeYoutubeRollingVttIfNeeded(vtt);
  const rawCues = parseRawVttCues(normalized);
  const result: TranscriptCue[] = [];

  for (const c of rawCues) {
    const text = cleanCueText(c.body);
    if (!text) continue;
    result.push({ startSeconds: c.start, endSeconds: c.end, text });
  }

  return result;
}

function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatTranscriptPlain(cues: TranscriptCue[]): string {
  return cues
    .map((c) => c.text)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function formatTranscriptTimestamped(cues: TranscriptCue[]): string {
  return cues.map((c) => `[${formatTimestamp(c.startSeconds)}] ${c.text}`).join("\n");
}

export function formatTranscriptMarkdown(
  cues: TranscriptCue[],
  chapters: Chapter[] | null,
  title: string,
): string {
  if (!chapters || chapters.length < 2) {
    return `# ${title}\n\n${formatTranscriptTimestamped(cues)}`;
  }

  const lines: string[] = [`# ${title}`, ""];

  for (const chapter of chapters) {
    lines.push(`## ${chapter.title}`, "");
    const chapterCues = cues.filter(
      (c) => c.startSeconds >= chapter.start_time && c.startSeconds < chapter.end_time,
    );
    for (const c of chapterCues) {
      lines.push(`[${formatTimestamp(c.startSeconds)}] ${c.text}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
