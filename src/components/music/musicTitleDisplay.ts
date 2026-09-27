const NOISE =
  /\b(official|video|audio|lyrics?|visuali[sz]er|hd|hq|4k|mv|m\/v|remaster(ed)?|explicit|topic)\b/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Short song name for tight UI: drops YouTube upload noise like "[Official Video]" and the
 * artist prefix or suffix, but keeps meaningful brackets such as "(feat. X)" or "(Live)".
 */
export function displaySongTitle(raw: string, artist?: string | null): string {
  let t = raw.trim();
  const name = artist?.trim();
  if (name) {
    const a = escapeRegex(name);
    t = t.replace(new RegExp(`^${a}\\s*[-–:|]\\s*`, "i"), "");
    t = t.replace(new RegExp(`\\s*[-–|]\\s*${a}\\b.*$`, "i"), "");
  }
  t = t.replace(/\s*[([]([^)\]]*)[)\]]/g, (whole, inner: string) => (NOISE.test(inner) ? "" : whole));
  t = t.replace(/\s*[-–|]\s*(official|lyrics?|audio|video)\b.*$/i, "");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t || raw.trim();
}
