import type { MusicTrackInfo } from "@/lib/musicExploreTracks";
import { normalizeText } from "./normalize";
import type { ImportTrack } from "./parseImport";

export type MatchBucket = "matched" | "check" | "missing";

export type ScoredCandidate = { track: MusicTrackInfo; score: number; titleSim: number; artistHit: boolean };

/** Words that mark a different version of a song; a candidate carrying one the source lacks is penalized. */
const VERSION_WORDS = [
  "live",
  "cover",
  "remix",
  "sped up",
  "slowed",
  "reverb",
  "8d",
  "karaoke",
  "instrumental",
  "acoustic",
  "nightcore",
  "extended",
] as const;

/** YouTube title noise that says nothing about which song it is. */
const NOISE = new Set([
  "official",
  "video",
  "audio",
  "lyrics",
  "lyric",
  "music",
  "visualizer",
  "visualiser",
  "mv",
  "hd",
  "hq",
  "4k",
  "explicit",
  "clean",
  "version",
  "feat",
  "ft",
  "featuring",
  "with",
  "prod",
  "topic",
]);

function tokens(s: string): string[] {
  return normalizeText(s).split(" ").filter(Boolean);
}

/** The title without "(feat. …)", "[with …]" and a trailing " - Remastered 2011" style suffix. */
export function coreTitle(title: string): string {
  return title
    .replace(/[([](?:feat|ft|featuring|with)\b[^)\]]*[)\]]/gi, " ")
    .replace(/\s+(?:feat|ft)\.?\s+.*$/i, " ")
    .replace(/\s+-\s+.*\b(?:remaster(?:ed)?|version|mix|edit|mono|stereo)\b.*$/i, " ")
    .trim();
}

function hasPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `);
}

/**
 * 0..1. Mostly "does the candidate contain the source's core title", a little "does it contain
 * nothing else", after dropping artist names and YouTube noise from the candidate.
 */
export function titleSimilarity(source: ImportTrack, candidateTitle: string): number {
  const core = tokens(coreTitle(source.title));
  if (!core.length) return 0;
  const candidate = tokens(candidateTitle);
  const candSet = new Set(candidate);
  const recall = core.filter((t) => candSet.has(t)).length / core.length;

  const sourceAll = new Set([...tokens(source.title), ...source.artists.flatMap(tokens)]);
  const extras = candidate.filter((t) => !NOISE.has(t) && !/^\d{4}$/.test(t));
  const precision = extras.length ? extras.filter((t) => sourceAll.has(t)).length / extras.length : 1;
  return 0.75 * recall + 0.25 * precision;
}

function mentionsArtist(source: ImportTrack, text: string): boolean {
  const hay = ` ${normalizeText(text)} `;
  return source.artists.some((a) => {
    const n = normalizeText(a);
    return !!n && hay.includes(` ${n} `);
  });
}

function durationPoints(source: number | null, candidate: number | null): number {
  if (source == null || candidate == null) return 0;
  // Smooth rather than stepped: services disagree by a few seconds, and a 4 s gap on the
  // official upload shouldn't lose to a 3 s gap on a reupload.
  const delta = Math.abs(source - candidate);
  if (delta <= 10) return 30 - delta * 1.2;
  if (delta <= 30) return 18 * (1 - (delta - 10) / 20);
  return -40;
}

export function scoreCandidate(source: ImportTrack, candidate: MusicTrackInfo): ScoredCandidate {
  const titleSim = titleSimilarity(source, candidate.title);
  const channelHit = mentionsArtist(source, candidate.artist ?? "");
  const hit = channelHit || mentionsArtist(source, candidate.title);
  let score = titleSim * 50;
  score += durationPoints(source.durationSec, candidate.duration);
  if (hit) score += 20;
  // Tie-breakers between uploads of the same song: the artist's own channel, then its audio upload.
  if (channelHit) score += 6;
  if (/\s-\s*topic$/i.test(candidate.artist ?? "")) score += 8;
  const src = normalizeText(source.title);
  const cand = normalizeText(candidate.title);
  if (hasPhrase(cand, "official audio")) score += 3;
  if ((hasPhrase(cand, "lyrics") || hasPhrase(cand, "lyric")) && !hasPhrase(src, "lyrics")) score -= 5;
  if (hasPhrase(cand, "official video") || hasPhrase(cand, "music video")) score -= 3;
  for (const w of VERSION_WORDS) {
    if (hasPhrase(cand, w) && !hasPhrase(src, w)) score -= 35;
  }
  return { track: candidate, score: Math.round(score), titleSim, artistHit: hit };
}

/** Best first. Candidates without a URL or id are dropped. */
export function rankCandidates(source: ImportTrack, candidates: MusicTrackInfo[]): ScoredCandidate[] {
  const seen = new Set<string>();
  return candidates
    .filter((c) => c.id && c.url && !seen.has(c.id) && seen.add(c.id))
    .map((c) => scoreCandidate(source, c))
    .sort((a, b) => b.score - a.score);
}

export const MATCHED_MIN_SCORE = 70;
export const CHECK_MIN_SCORE = 35;

export function bucketFor(source: ImportTrack, best: ScoredCandidate | undefined): MatchBucket {
  if (!best || best.score < CHECK_MIN_SCORE || best.titleSim < 0.4) return "missing";
  const confident = best.score >= MATCHED_MIN_SCORE && best.titleSim >= 0.6 && best.artistHit;
  return confident && !source.unclear ? "matched" : "check";
}

/** Search text for one row: first artist, core title, and "audio" to favor official audio uploads. */
export function searchQueryFor(source: ImportTrack): string {
  return `${source.artists[0]} ${coreTitle(source.title)} audio`.replace(/\s+/g, " ").trim();
}
