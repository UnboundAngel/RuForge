import { normalizeText, parseDuration } from "./normalize";

export const IMPORT_FORMAT_VERSION = 1;
export const IMPORT_MAX_ROWS = 1000;
/** Rows this close together with the same song are screenshot overlap, not a deliberate repeat. */
const OVERLAP_WINDOW = 3;

export const IMPORT_SOURCES = ["spotify", "apple_music", "youtube_music", "tidal", "soundcloud", "other"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export type ImportTrack = {
  title: string;
  artists: string[];
  album: string | null;
  durationSec: number | null;
  unclear: boolean;
};

export type ParsedImport = {
  name: string | null;
  source: ImportSource | null;
  tracks: ImportTrack[];
  /** Rows dropped for missing data, e.g. "Row 14: no title". */
  rowErrors: string[];
  duplicatesRemoved: number;
  /** Rows past the cap that were left out. */
  truncated: number;
  /** True when the JSON only parsed after the trailing-comma and smart-quote repair. */
  repaired: boolean;
};

export type ParseImportResult = { ok: true; value: ParsedImport } | { ok: false; error: string };

/** The JSON part of a chatbot reply: the first ```json fence, else first `{` or `[` to the last matching bracket. */
export function extractJsonText(reply: string): string | null {
  const fence = reply.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
  if (fence && /[[{]/.test(fence[1])) return fence[1].trim();
  const obj = reply.indexOf("{");
  const arr = reply.indexOf("[");
  const useArray = arr !== -1 && (obj === -1 || arr < obj);
  const start = useArray ? arr : obj;
  const end = reply.lastIndexOf(useArray ? "]" : "}");
  if (start === -1 || end <= start) return null;
  return reply.slice(start, end + 1);
}

/** Trailing commas and curly quotes, the two things chat UIs break most often. */
export function repairJson(text: string): string {
  return text
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/,(\s*[\]}])/g, "$1");
}

function describeParseError(err: unknown, text: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lc = msg.match(/line (\d+) column (\d+)/);
  if (lc) return `That JSON has an error on line ${lc[1]}, column ${lc[2]}.`;
  const pos = msg.match(/position (\d+)/);
  if (pos) {
    const before = text.slice(0, Number(pos[1]));
    const line = before.split("\n").length;
    const col = Number(pos[1]) - before.lastIndexOf("\n");
    return `That JSON has an error on line ${line}, column ${col}.`;
  }
  return "That JSON couldn't be read.";
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t : null;
}

/** `artists` array, or one `artist` string split only on ", " and " & ". */
function readArtists(row: Record<string, unknown>): string[] {
  if (Array.isArray(row.artists)) {
    return row.artists.map(str).filter((a): a is string => !!a);
  }
  const single = str(row.artists) ?? str(row.artist);
  if (!single) return [];
  return single
    .split(/\s*,\s*|\s+&\s+/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function songKey(t: ImportTrack): string {
  return `${normalizeText(t.title)}\u0000${normalizeText(t.artists[0] ?? "")}`;
}

/** Drops a row when the same song sits within a few rows before it (screenshot overlap). */
export function dedupeOverlap(tracks: ImportTrack[]): { tracks: ImportTrack[]; removed: number } {
  const out: ImportTrack[] = [];
  let removed = 0;
  for (const t of tracks) {
    const key = songKey(t);
    const recent = out.slice(-OVERLAP_WINDOW);
    if (recent.some((r) => songKey(r) === key)) {
      removed++;
      continue;
    }
    out.push(t);
  }
  return { tracks: out, removed };
}

/** Chatbot reply in, strict track list out. Bad rows are reported, not fatal. */
export function parseImport(reply: string): ParseImportResult {
  const text = extractJsonText(reply);
  if (!text) return { ok: false, error: "No JSON found. Paste the whole reply from the chatbot." };

  let data: unknown;
  let repaired = false;
  try {
    data = JSON.parse(text);
  } catch (first) {
    try {
      data = JSON.parse(repairJson(text));
      repaired = true;
    } catch {
      return { ok: false, error: describeParseError(first, text) };
    }
  }

  let rawTracks: unknown;
  let name: string | null = null;
  let source: ImportSource | null = null;
  if (Array.isArray(data)) {
    rawTracks = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const version = obj.ruforge_import;
    if (version !== undefined && Number(version) !== IMPORT_FORMAT_VERSION) {
      return { ok: false, error: `This is import format ${String(version)}; this RuForge reads format 1. Update RuForge.` };
    }
    if (version === undefined && !Array.isArray(obj.tracks)) {
      return { ok: false, error: "That JSON isn't a RuForge playlist. Use the copied prompt." };
    }
    rawTracks = obj.tracks;
    const pl = obj.playlist && typeof obj.playlist === "object" ? (obj.playlist as Record<string, unknown>) : null;
    name = pl ? str(pl.name) : null;
    const src = pl ? str(pl.source) : null;
    source = src && (IMPORT_SOURCES as readonly string[]).includes(src) ? (src as ImportSource) : null;
  } else {
    return { ok: false, error: "That JSON isn't a RuForge playlist. Use the copied prompt." };
  }

  if (!Array.isArray(rawTracks)) return { ok: false, error: "The JSON has no \"tracks\" list." };

  const rowErrors: string[] = [];
  const tracks: ImportTrack[] = [];
  rawTracks.forEach((raw, i) => {
    const n = i + 1;
    if (!raw || typeof raw !== "object") {
      rowErrors.push(`Row ${n}: not a song`);
      return;
    }
    const row = raw as Record<string, unknown>;
    const title = str(row.title);
    const artists = readArtists(row);
    if (!title) {
      rowErrors.push(`Row ${n}: no title`);
      return;
    }
    if (!artists.length) {
      rowErrors.push(`Row ${n}: no artist`);
      return;
    }
    tracks.push({
      title,
      artists,
      album: str(row.album),
      durationSec: parseDuration(row.duration),
      unclear: row.unclear === true || row.unclear === "true",
    });
  });

  const deduped = dedupeOverlap(tracks);
  const truncated = Math.max(0, deduped.tracks.length - IMPORT_MAX_ROWS);
  const kept = deduped.tracks.slice(0, IMPORT_MAX_ROWS);
  if (!kept.length) {
    return { ok: false, error: rowErrors.length ? `No usable songs. ${rowErrors[0]}.` : "The tracks list is empty." };
  }
  return {
    ok: true,
    value: { name, source, tracks: kept, rowErrors, duplicatesRemoved: deduped.removed, truncated, repaired },
  };
}
