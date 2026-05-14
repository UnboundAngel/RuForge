/**
 * YouTube auto-generated WebVTT uses a "rolling" two-line model: overlapping cues,
 * ~10ms junk anchors, and `<timestamp><c>…` markup. Browsers expose multiple `activeCues`
 * at once; joining them mashes lines. This module rewrites such files to non-overlapping
 * single-line cues (latest-start wins per instant) so one line is active at a time.
 *
 * Gated on inline YouTube-style timestamp tags in the file body so manual subs are untouched.
 */

const MIN_CUE_SEC = 0.05;
const TIME_BOUNDARY_EPS = 0.002;

/** Matches YouTube ASR inline cue timestamps like `<00:01:23.456>` or `<01:23.456>`. */
const YOUTUBE_INLINE_TIME_TAG = /<\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}>/;

function stripVttMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, "");
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

function formatVttTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalMs = Math.round(seconds * 1000);
  let ms = totalMs % 1000;
  let t = Math.floor(totalMs / 1000);
  if (ms < 0) {
    ms = 0;
  }
  const sec = t % 60;
  t = Math.floor(t / 60);
  const m = t % 60;
  const h = Math.floor(t / 60);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  const ms3 = String(ms).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms3}`;
}

type ParsedCue = {
  start: number;
  end: number;
  body: string;
};

function parseWebVttCues(vtt: string): { preamble: string; cues: ParsedCue[] } {
  const text = vtt.replace(/^\uFEFF/, "");
  const blocks = text.split(/\r?\n\r?\n/);
  const preambleBlocks: string[] = [];
  const cues: ParsedCue[] = [];

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
    if (timingIdx === -1) {
      preambleBlocks.push(block);
      continue;
    }

    const timingLine = lines[timingIdx]!.trim();
    const m = timingLine.match(
      /^(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/,
    );
    if (!m) {
      preambleBlocks.push(block);
      continue;
    }

    const start = parseVttTimestamp(m[1]!);
    const end = parseVttTimestamp(m[2]!);
    const body = lines.slice(timingIdx + 1).join("\n").trimEnd();
    cues.push({ start, end, body });
  }

  const preamble = preambleBlocks.join("\n\n").trimEnd();
  return { preamble, cues };
}

function lastLinePlain(body: string): string {
  const plain = stripVttMarkup(body);
  const lines = plain
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length ? lines[lines.length - 1]! : "";
}

function pickWinner<T extends { start: number; end: number }>(active: T[]): T {
  return active.reduce((a, c) => {
    if (c.start > a.start) return c;
    if (c.start < a.start) return a;
    return c.end > a.end ? c : a;
  });
}

function mergeTimelineSegments(
  cues: { start: number; end: number; text: string }[],
): { start: number; end: number; text: string }[] {
  const boundaries = new Set<number>();
  for (const c of cues) {
    boundaries.add(c.start);
    boundaries.add(c.end);
  }
  const b = [...boundaries].sort((x, y) => x - y);
  const rawSegs: { start: number; end: number; text: string }[] = [];

  for (let i = 0; i < b.length - 1; i++) {
    const t0 = b[i]!;
    const t1 = b[i + 1]!;
    if (t1 - t0 < TIME_BOUNDARY_EPS) continue;

    const active = cues.filter((c) => c.start < t1 - 1e-6 && c.end > t0 + 1e-6 && c.text.length > 0);
    if (active.length === 0) continue;

    const w = pickWinner(active);
    rawSegs.push({ start: t0, end: t1, text: w.text });
  }

  const merged: { start: number; end: number; text: string }[] = [];
  for (const seg of rawSegs) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.text === seg.text &&
      seg.start - prev.end <= TIME_BOUNDARY_EPS &&
      seg.start >= prev.end - TIME_BOUNDARY_EPS
    ) {
      prev.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

function serializeWebVtt(preamble: string, segments: { start: number; end: number; text: string }[]): string {
  const header = preamble.trim().length > 0 ? `${preamble.trim()}\n\n` : "WEBVTT\n\n";
  const body = segments
    .map((s) => {
      if (s.end - s.start < MIN_CUE_SEC) return "";
      const a = formatVttTimestamp(s.start);
      const b = formatVttTimestamp(s.end);
      return `${a} --> ${b}\n${s.text}`;
    })
    .filter((s) => s.length > 0)
    .join("\n\n");
  return `${header}${body}\n`;
}

function looksLikeYoutubeRollingAsrVtt(vtt: string): boolean {
  return YOUTUBE_INLINE_TIME_TAG.test(vtt);
}

/** Returns the same string if the file does not match YouTube rolling ASR heuristics. */
export function normalizeYoutubeRollingVttIfNeeded(vtt: string): string {
  if (!looksLikeYoutubeRollingAsrVtt(vtt)) return vtt;

  const { preamble, cues } = parseWebVttCues(vtt);
  const prepared: { start: number; end: number; text: string }[] = [];

  for (const c of cues) {
    const dur = c.end - c.start;
    if (dur < MIN_CUE_SEC) continue;
    const text = lastLinePlain(c.body);
    if (!text) continue;
    prepared.push({ start: c.start, end: c.end, text });
  }

  if (prepared.length === 0) return vtt;

  const merged = mergeTimelineSegments(prepared);
  return serializeWebVtt(preamble, merged);
}
