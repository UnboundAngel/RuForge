export type WhatsNewTile = {
  /** Lowercased label, the key for icon and destination lookups. */
  key: string;
  label: string;
  text: string;
};

export type WhatsNewContent = {
  /** First `#` heading in the notes, unless it only names the version. */
  headline: string | null;
  tiles: WhatsNewTile[];
  /** `**Fixes**:` lines; they ride in one quiet line instead of a tile. */
  extras: string[];
};

const AREA_BULLET = /^[-*]\s+\*\*([^*]+?):?\*\*\s*:?\s*(.+)$/;
const HEADING = /^#{1,3}\s+(.+)$/;
const VERSION_ONLY = /^(\*\*)?ruforge\s+v?\d[\w.-]*(\*\*)?$/i;
const EXTRA_KEYS = new Set(["fix", "fixes", "bug fixes", "and more", "also"]);

/** Reads `updater.json` notes written as `- **Area**: sentence` lines. Anything else is ignored. */
export function parseWhatsNew(notes: string): WhatsNewContent {
  let headline: string | null = null;
  const tiles: WhatsNewTile[] = [];
  const extras: string[] = [];
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = HEADING.exec(line);
    if (heading) {
      const text = heading[1].trim();
      if (headline == null && !VERSION_ONLY.test(text)) headline = text;
      continue;
    }
    const bullet = AREA_BULLET.exec(line);
    if (!bullet) continue;
    const label = bullet[1].trim();
    const text = bullet[2].trim();
    const key = label.toLowerCase();
    if (EXTRA_KEYS.has(key)) extras.push(text);
    else tiles.push({ key, label, text });
  }
  return { headline, tiles, extras };
}
