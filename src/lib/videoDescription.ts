import type { Chapter } from "@/types";

export type DescriptionSegment =
  | { kind: "text"; text: string }
  | { kind: "url"; text: string; url: string }
  | { kind: "timestamp"; text: string; seconds: number };

const TOKEN_RE =
  /(?<url>https?:\/\/[^\s<>"'`]+)|(?<![\w:./])(?<ts>(?:(?<h>\d{1,2}):)?(?<m>\d{1,2}):(?<s>\d{2}))(?!\w|[:.]\d)/g;

const URL_TRAILING_PUNCT = /[.,;:!?'"*>\]}]$/;

/** Sentence punctuation after a link is not part of it; a closing paren is only kept when the link opened one. */
function trimUrl(raw: string): string {
  let url = raw;
  for (;;) {
    if (URL_TRAILING_PUNCT.test(url)) {
      url = url.slice(0, -1);
      continue;
    }
    if (url.endsWith(")")) {
      const opens = url.split("(").length - 1;
      const closes = url.split(")").length - 1;
      if (closes > opens) {
        url = url.slice(0, -1);
        continue;
      }
    }
    return url;
  }
}

function timestampSeconds(h: string | undefined, m: string, s: string): number | null {
  const sec = Number(s);
  const min = Number(m);
  if (sec >= 60) return null;
  if (h === undefined) return min * 60 + sec;
  if (m.length !== 2 || min >= 60) return null;
  return Number(h) * 3600 + min * 60 + sec;
}

function withinDuration(seconds: number, durationSec?: number): boolean {
  return !(durationSec && durationSec > 0 && seconds > durationSec);
}

/** Parses `m:ss`, `mm:ss` or `h:mm:ss`; null for anything else or past a known duration. */
export function parseTimestamp(raw: string, durationSec?: number): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const seconds = timestampSeconds(m[1], m[2], m[3]);
  if (seconds === null || !withinDuration(seconds, durationSec)) return null;
  return seconds;
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function segmentDescription(text: string, durationSec?: number): DescriptionSegment[] {
  const out: DescriptionSegment[] = [];
  let plain = "";
  let last = 0;
  const pushText = (t: string) => {
    plain += t;
  };
  const flush = () => {
    if (plain) out.push({ kind: "text", text: plain });
    plain = "";
  };

  for (const match of text.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0;
    const g = match.groups ?? {};
    pushText(text.slice(last, start));
    if (g.url) {
      const url = trimUrl(g.url);
      flush();
      out.push({ kind: "url", text: url, url });
      last = start + url.length;
      continue;
    }
    const seconds = timestampSeconds(g.h, g.m, g.s);
    if (seconds !== null && withinDuration(seconds, durationSec)) {
      flush();
      out.push({ kind: "timestamp", text: match[0], seconds });
    } else {
      pushText(match[0]);
    }
    last = start + match[0].length;
  }
  pushText(text.slice(last));
  flush();
  return out;
}

const LEADING_TS_RE = /^[^\p{L}\p{N}]*?((?:\d{1,2}:)?\d{1,2}:\d{2})(?!\w|[:.]\d)/u;
const TRAILING_TS_RE = /(?<![\w:./])((?:\d{1,2}:)?\d{1,2}:\d{2})[^\p{L}\p{N}]*$/u;
const TITLE_EDGE_RE =
  /^[\s\-\u2013\u2014:|\u2022*\u00b7.,;()[\]{}<>]+|[\s\-\u2013\u2014:|\u2022*\u00b7.,;([{<]+$/g;

/** Strips the separator and bullet noise around a chapter title; inner hyphens and balanced parens stay. */
export function cleanChapterTitle(raw: string): string {
  let title = raw.replace(TITLE_EDGE_RE, "").trim();
  const unbalanced = (title.match(/\)/g)?.length ?? 0) > (title.match(/\(/g)?.length ?? 0);
  if (unbalanced) title = title.replace(/\)+$/, "").trim();
  return title;
}

/** Splits a line that opens with a timestamp into the time text and its cleaned title. */
export function splitChapterLine(
  line: string,
  durationSec?: number,
): { time: string; seconds: number; title: string } | null {
  const lead = LEADING_TS_RE.exec(line);
  if (!lead) return null;
  const seconds = parseTimestamp(lead[1], durationSec);
  if (seconds === null) return null;
  return { time: lead[1], seconds, title: cleanChapterTitle(line.slice(lead.index + lead[0].length)) };
}

type ChapterLine = { seconds: number; title: string };

/** A chapter line starts or ends with its timestamp; one mid-sentence is prose, not a chapter. */
function chapterLine(line: string, durationSec: number): ChapterLine | null {
  const lead = LEADING_TS_RE.exec(line);
  const trail = lead ? null : TRAILING_TS_RE.exec(line);
  const hit = lead ?? trail;
  if (!hit) return null;
  const seconds = parseTimestamp(hit[1], durationSec);
  if (seconds === null) return null;
  const rest = lead
    ? line.slice(lead.index + lead[0].length)
    : line.slice(0, trail!.index);
  return { seconds, title: cleanChapterTitle(rest) };
}

const MIN_CHAPTERS = 3;
const MIN_CHAPTER_GAP_SEC = 10;

/**
 * YouTube's own rule for description chapters: a run of timestamp lines starting at 0:00,
 * at least three, ascending, each at least 10 seconds apart.
 */
export function chaptersFromDescription(
  text: string | null | undefined,
  durationSec: number,
): Chapter[] | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const startAt = lines.findIndex((l) => chapterLine(l, durationSec)?.seconds === 0);
  if (startAt < 0) return null;

  const run: ChapterLine[] = [];
  for (let i = startAt; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parsed = chapterLine(line, durationSec);
    if (!parsed) break;
    run.push(parsed);
  }

  if (run.length < MIN_CHAPTERS) return null;
  for (let i = 1; i < run.length; i++) {
    if (run[i].seconds - run[i - 1].seconds < MIN_CHAPTER_GAP_SEC) return null;
  }
  if (durationSec > 0 && durationSec - run[run.length - 1].seconds < MIN_CHAPTER_GAP_SEC) return null;

  return run.map((c, i) => ({
    start_time: c.seconds,
    end_time: i + 1 < run.length ? run[i + 1].seconds : durationSec > c.seconds ? durationSec : 0,
    title: c.title || `Chapter ${i + 1}`,
  }));
}

/** Visible link text: no scheme, no leading `www.`, no lone trailing slash. The href keeps the full url. */
export function linkDisplayText(url: string): string {
  let text = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (text.endsWith("/")) text = text.slice(0, -1);
  return text || url;
}

const DIVIDER_RE = /^\s*[─-╿\-_=~*–—]{5,}\s*$/;

/** A line of box-drawing or dash characters that would only look like a rule if it stays on one line. */
export function isDividerLine(line: string): boolean {
  return DIVIDER_RE.test(line);
}

/** `1,529,501 views  Oct 9, 2026`; null when neither field is known. */
export function formatDescriptionMeta(
  viewCount: number | null | undefined,
  uploadDate: string | null | undefined,
  locale?: string,
): string | null {
  const parts: string[] = [];
  if (typeof viewCount === "number" && Number.isFinite(viewCount)) {
    parts.push(`${viewCount.toLocaleString(locale)} ${viewCount === 1 ? "view" : "views"}`);
  }
  const m = uploadDate ? /^(\d{4})(\d{2})(\d{2})$/.exec(uploadDate) : null;
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) {
      parts.push(d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" }));
    }
  }
  return parts.length ? parts.join("  ") : null;
}
