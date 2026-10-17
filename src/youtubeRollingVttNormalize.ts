/**
 * YouTube auto-generated WebVTT is "rolling" live-caption output: overlapping cues, ~10ms junk
 * anchors, and `<timestamp><c>…` markup that times every word. Played as-is, text types in word
 * by word and the caption box resizes on every word. This module rebuilds such files as pop-on
 * captions, the way films and streaming apps show them: short complete blocks of at most two
 * lines, cut at pauses and sentence ends, each shown from its first spoken word.
 *
 * Gated on inline YouTube-style timestamp tags in the file body so manual subs are untouched.
 */

const MIN_CUE_SEC = 0.05;
/** Netflix English timed text limits: 42 characters a line, two lines, 5/6s to 7s on screen. */
const LINE_CHARS = 42;
const BLOCK_CHARS = LINE_CHARS * 2;
const MIN_BLOCK_SEC = 5 / 6;
const MAX_BLOCK_SEC = 7;
/** Silence longer than this ends a block so a caption never hangs over a pause. */
const PAUSE_BREAK_SEC = 0.9;
/** How long the last block before a pause lingers after its final word. */
const TAIL_HOLD_SEC = 0.6;
const MAX_WORD_SEC = 0.8;

/** Matches YouTube ASR inline cue timestamps like `<00:01:23.456>` or `<01:23.456>`. */
const YOUTUBE_INLINE_TIME_TAG = /<\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}>/;
const INLINE_TIME_SPLIT = /<(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})>/;

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
  const ms = totalMs % 1000;
  let t = Math.floor(totalMs / 1000);
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

type TimedWord = { text: string; start: number; end: number };

/**
 * Each rolling cue repeats the finished line above and adds new words on its last line, so only
 * that last line is read. Words carry their own timestamp; the first takes the cue start.
 */
function wordsFromRollingCues(cues: ParsedCue[]): TimedWord[] {
  const words: TimedWord[] = [];
  let lastBuilding = "";
  for (const cue of cues) {
    if (cue.end - cue.start < MIN_CUE_SEC) continue;
    const lines = cue.body.split(/\r?\n/).filter((l) => stripVttMarkup(l).trim().length > 0);
    const building = lines[lines.length - 1];
    if (!building) continue;
    const plain = stripVttMarkup(building).trim();
    if (plain === lastBuilding) continue;
    lastBuilding = plain;
    const parts = building.split(INLINE_TIME_SPLIT);
    let at = cue.start;
    for (let i = 0; i < parts.length; i += 2) {
      if (i > 0) at = Math.min(cue.end, Math.max(at, parseVttTimestamp(parts[i - 1]!)));
      for (const token of stripVttMarkup(parts[i] ?? "").split(/\s+/)) {
        if (!token) continue;
        const prev = words[words.length - 1];
        // ASR emits stray punctuation as its own token (", it is"); glue it to the word before.
        if (prev && /^[,.;:!?]+$/.test(token)) {
          prev.text += token;
          continue;
        }
        words.push({ text: token, start: at, end: cue.end });
      }
    }
  }
  // Cue ends often run on through silence, so cap how long one word can count as spoken.
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    w.end = Math.min(w.end, words[i + 1]?.start ?? w.end, w.start + MAX_WORD_SEC);
  }
  return words;
}

function groupIntoBlocks(words: TimedWord[]): TimedWord[][] {
  const blocks: TimedWord[][] = [];
  let cur: TimedWord[] = [];
  let chars = 0;
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const wouldBe = chars + (cur.length ? 1 : 0) + w.text.length;
    const breakHere =
      prev != null &&
      (w.start - prev.end > PAUSE_BREAK_SEC ||
        wouldBe > BLOCK_CHARS ||
        w.start - cur[0]!.start > MAX_BLOCK_SEC - 0.5 ||
        (/[.?!]$/.test(prev.text) && chars >= 12));
    if (breakHere) {
      blocks.push(cur);
      cur = [];
      chars = 0;
    }
    chars += (cur.length ? 1 : 0) + w.text.length;
    cur.push(w);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

/** Two lines when over the limit, broken where the halves balance, after punctuation if possible, top line no longer than the bottom. */
function layoutLines(words: string[]): string {
  const joined = words.join(" ");
  if (joined.length <= LINE_CHARS || words.length < 2) return joined;
  let best = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const top = words.slice(0, i).join(" ");
    const bottom = words.slice(i).join(" ");
    let score = Math.abs(top.length - bottom.length);
    if (top.length > LINE_CHARS || bottom.length > LINE_CHARS) score += 1000;
    if (/[,.;:!?]$/.test(words[i - 1]!)) score -= 8;
    if (top.length > bottom.length) score += 4;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return `${words.slice(0, best).join(" ")}\n${words.slice(best).join(" ")}`;
}

function serializeWebVtt(preamble: string, segments: { start: number; end: number; text: string }[]): string {
  const header = preamble.trim().length > 0 ? `${preamble.trim()}\n\n` : "WEBVTT\n\n";
  const body = segments
    .filter((s) => s.end - s.start >= MIN_CUE_SEC)
    .map((s) => `${formatVttTimestamp(s.start)} --> ${formatVttTimestamp(s.end)}\n${s.text}`)
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
  const blocks = groupIntoBlocks(wordsFromRollingCues(cues));
  if (blocks.length === 0) return vtt;

  const segments = blocks.map((block, i) => {
    const start = block[0]!.start;
    const nextStart = blocks[i + 1]?.[0]?.start ?? Number.POSITIVE_INFINITY;
    const spoken = block[block.length - 1]!.end + TAIL_HOLD_SEC;
    const end = Math.min(nextStart, start + MAX_BLOCK_SEC, Math.max(spoken, start + MIN_BLOCK_SEC));
    return { start, end, text: layoutLines(block.map((w) => w.text)) };
  });
  return serializeWebVtt(preamble, segments);
}
