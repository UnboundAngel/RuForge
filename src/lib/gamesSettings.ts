/**
 * Games settings shape lives in core so public builds keep the same persisted fields.
 * The real normalizer (builtins, validation) registers from `@games` on load; until then
 * (or in a stub build) entries are preserved untouched.
 */

export type GameCorner = "tl" | "tr" | "bl" | "br";

export type GameLayout = {
  corner: GameCorner;
  x?: number;
  y?: number;
  width: number;
  height: number;
  opacity: number;
};

export type GlanceLayout = GameLayout;

export type PinnedResource = {
  url: string;
  name: string;
};

export type GameRecord = {
  id: string;
  name: string;
  exe: string;
  titlePattern?: string;
  steamAppId?: number;
  xboxProductId?: string;
  folders?: string[];
  packageFamily?: string;
  enabled: boolean;
  autoGhost: boolean;
  layout?: GameLayout;
  pinnedResource?: PinnedResource;
  glanceLayout?: GlanceLayout;
};

export function preserveGames(raw: unknown): GameRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "string",
    )
    .map((item) => ({ ...(item as GameRecord) }));
}

type Normalizer = (raw: unknown) => GameRecord[];

let normalizeGamesImpl: Normalizer = preserveGames;

/** `@games` (real or stub) replaces the default preserve normalizer. */
export function registerGamesNormalizer(fn: Normalizer): void {
  normalizeGamesImpl = fn;
}

export function normalizeGames(raw: unknown): GameRecord[] {
  return normalizeGamesImpl(raw);
}
