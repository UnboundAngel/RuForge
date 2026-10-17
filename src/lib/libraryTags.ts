import { extractYouTubeVideoId } from "../youtubeUrl";
import type { GameRecord } from "./gamesSettings";

export type TagKind = "plain" | "game";

export type LibraryTag = {
  id: string;
  name: string;
  kind: TagKind;
  /** Set on game tags: the `GameRecord.id` in Settings > Games. */
  gameId?: string;
};

/** Plain tags are stored; game tags are derived from the game library so they follow renames and deletes. */
export type PlainTag = { id: string; name: string };

export type TagSource = "manual" | `rule:${string}`;

export type VideoTagRef = { tagId: string; source: TagSource };

export type TagRuleField = "title" | "channel" | "description";
export type TagRuleOp = "includes" | "is";

export type TagRule = {
  id: string;
  field: TagRuleField;
  op: TagRuleOp;
  /** Plain text, compared case-insensitively. Never a pattern. */
  text: string;
  /** Empty until the user picks a tag. */
  tagId: string;
  enabled: boolean;
};

export type LibraryTagsState = {
  tags: PlainTag[];
  /** List order is priority: the first matching game rule wins. */
  rules: TagRule[];
  /** Keyed by `videoKey`. */
  videos: Record<string, VideoTagRef[]>;
  /** Tags the user took off a video; rules never put them back. */
  suppressed: Record<string, string[]>;
  /** Games that already got their default rule, so deleting that rule sticks. */
  seededGames: string[];
};

export type RuleInput = {
  title: string;
  channel?: string | null;
  description?: string | null;
};

export const EMPTY_LIBRARY_TAGS: LibraryTagsState = {
  tags: [],
  rules: [],
  videos: {},
  suppressed: {},
  seededGames: [],
};

export const TAG_RULE_FIELDS: ReadonlyArray<{ id: TagRuleField; label: string }> = [
  { id: "title", label: "title" },
  { id: "channel", label: "channel" },
  { id: "description", label: "description" },
];

export const TAG_RULE_OPS: ReadonlyArray<{ id: TagRuleOp; label: string }> = [
  { id: "includes", label: "includes" },
  { id: "is", label: "is" },
];

const GAME_TAG_PREFIX = "game:";

export function gameTagId(gameId: string): string {
  return `${GAME_TAG_PREFIX}${gameId}`;
}

export function gameIdOfTag(tagId: string): string | null {
  return tagId.startsWith(GAME_TAG_PREFIX) ? tagId.slice(GAME_TAG_PREFIX.length) || null : null;
}

export function isGameTagId(tagId: string): boolean {
  return gameIdOfTag(tagId) != null;
}

export function newTagEntityId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Game tags first in game library order, then plain tags by name. */
export function allTags(state: Pick<LibraryTagsState, "tags">, games: readonly GameRecord[]): LibraryTag[] {
  const gameTags: LibraryTag[] = games.map((g) => ({
    id: gameTagId(g.id),
    name: g.name,
    kind: "game",
    gameId: g.id,
  }));
  const plain: LibraryTag[] = [...state.tags]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((t) => ({ id: t.id, name: t.name, kind: "plain" }));
  return [...gameTags, ...plain];
}

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;

/** YouTube id when known, so a moved or renamed file keeps its tags; else the normalized path. */
export function videoKey(file: { path: string; sourceId?: string | null; sourceUrl?: string | null }): string {
  const id = file.sourceId?.trim();
  if (id && YT_ID.test(id)) return `yt:${id}`;
  const fromUrl = file.sourceUrl ? extractYouTubeVideoId(file.sourceUrl) : null;
  if (fromUrl) return `yt:${fromUrl}`;
  return `path:${file.path.replace(/\//g, "\\").toLowerCase()}`;
}

export function ruleMatches(rule: Pick<TagRule, "field" | "op" | "text">, input: RuleInput): boolean {
  const needle = rule.text.trim().toLowerCase();
  if (!needle) return false;
  const raw = input[rule.field];
  if (typeof raw !== "string") return false;
  const hay = raw.trim().toLowerCase();
  return rule.op === "is" ? hay === needle : hay.includes(needle);
}

/**
 * Manual tags stay as they are; rule tags are recomputed from the enabled rules in order.
 * A video holds one game tag, so a manual game tag blocks every game rule and the first
 * matching game rule blocks the rest.
 */
export function tagsAfterRules(
  state: LibraryTagsState,
  key: string,
  input: RuleInput,
  knownTagIds: ReadonlySet<string>,
): VideoTagRef[] {
  const manual = (state.videos[key] ?? []).filter((r) => r.source === "manual");
  const suppressed = new Set(state.suppressed[key] ?? []);
  const next = [...manual];
  let gameTaken = manual.some((r) => isGameTagId(r.tagId));
  for (const rule of state.rules) {
    if (!rule.enabled || !knownTagIds.has(rule.tagId) || suppressed.has(rule.tagId)) continue;
    if (next.some((r) => r.tagId === rule.tagId)) continue;
    const game = isGameTagId(rule.tagId);
    if (game && gameTaken) continue;
    if (!ruleMatches(rule, input)) continue;
    if (game) gameTaken = true;
    next.push({ tagId: rule.tagId, source: `rule:${rule.id}` });
  }
  return next;
}

function sameRefs(a: readonly VideoTagRef[], b: readonly VideoTagRef[]): boolean {
  return a.length === b.length && a.every((r, i) => r.tagId === b[i].tagId && r.source === b[i].source);
}

export type RuleTarget = { key: string; input: RuleInput };

/** Runs every rule over `targets`. `added` counts videos that gained each tag. */
export function applyRules(
  state: LibraryTagsState,
  targets: readonly RuleTarget[],
  knownTagIds: ReadonlySet<string>,
): { state: LibraryTagsState; added: Map<string, number> } {
  const added = new Map<string, number>();
  let videos: Record<string, VideoTagRef[]> | null = null;
  const seen = new Set<string>();
  for (const { key, input } of targets) {
    if (seen.has(key)) continue;
    seen.add(key);
    const before = state.videos[key] ?? [];
    const after = tagsAfterRules(state, key, input, knownTagIds);
    if (sameRefs(before, after)) continue;
    for (const ref of after) {
      if (!before.some((r) => r.tagId === ref.tagId)) added.set(ref.tagId, (added.get(ref.tagId) ?? 0) + 1);
    }
    videos ??= { ...state.videos };
    if (after.length) videos[key] = after;
    else delete videos[key];
  }
  return { state: videos ? { ...state, videos } : state, added };
}

function withoutKeyEntry(map: Record<string, string[]>, key: string, tagId: string): Record<string, string[]> {
  const list = map[key];
  if (!list?.includes(tagId)) return map;
  const next = { ...map };
  const rest = list.filter((t) => t !== tagId);
  if (rest.length) next[key] = rest;
  else delete next[key];
  return next;
}

/** Manual beats rules: the tag turns manual, and a game tag replaces any other game tag. */
export function addManualTag(state: LibraryTagsState, key: string, tagId: string): LibraryTagsState {
  const game = isGameTagId(tagId);
  const refs = (state.videos[key] ?? []).filter(
    (r) => r.tagId !== tagId && !(game && isGameTagId(r.tagId)),
  );
  return {
    ...state,
    videos: { ...state.videos, [key]: [...refs, { tagId, source: "manual" }] },
    suppressed: withoutKeyEntry(state.suppressed, key, tagId),
  };
}

/** Taking a tag off records it, so no rule adds it back to this video. */
export function removeVideoTag(state: LibraryTagsState, key: string, tagId: string): LibraryTagsState {
  const refs = state.videos[key] ?? [];
  if (!refs.some((r) => r.tagId === tagId)) return state;
  const rest = refs.filter((r) => r.tagId !== tagId);
  const videos = { ...state.videos };
  if (rest.length) videos[key] = rest;
  else delete videos[key];
  const list = state.suppressed[key] ?? [];
  return {
    ...state,
    videos,
    suppressed: list.includes(tagId) ? state.suppressed : { ...state.suppressed, [key]: [...list, tagId] },
  };
}

export function findPlainTagByName(state: Pick<LibraryTagsState, "tags">, name: string): PlainTag | null {
  const want = name.trim().toLowerCase();
  return state.tags.find((t) => t.name.trim().toLowerCase() === want) ?? null;
}

export function createPlainTag(
  state: LibraryTagsState,
  name: string,
  makeId: () => string = () => newTagEntityId("tag"),
): { state: LibraryTagsState; tag: PlainTag | null } {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return { state, tag: null };
  const existing = findPlainTagByName(state, clean);
  if (existing) return { state, tag: existing };
  const tag = { id: makeId(), name: clean };
  return { state: { ...state, tags: [...state.tags, tag] }, tag };
}

export function defaultGameRule(game: GameRecord, makeId: () => string): TagRule {
  return {
    id: makeId(),
    field: "title",
    op: "includes",
    text: game.name,
    tagId: gameTagId(game.id),
    enabled: true,
  };
}

/**
 * Drops everything that points at a deleted game and gives each new game its default rule once.
 * Returns the seeded rules so the caller can run them over the library.
 */
export function reconcileGames(
  state: LibraryTagsState,
  games: readonly GameRecord[],
  makeId: () => string = () => newTagEntityId("rule"),
): { state: LibraryTagsState; seeded: TagRule[] } {
  const ids = new Set(games.map((g) => g.id));
  const live = (tagId: string) => {
    const gameId = gameIdOfTag(tagId);
    return gameId == null || ids.has(gameId);
  };
  let changed = false;

  const keptRules = state.rules.filter((r) => live(r.tagId));
  if (keptRules.length !== state.rules.length) changed = true;

  let videos = state.videos;
  for (const [key, refs] of Object.entries(state.videos)) {
    const kept = refs.filter((r) => live(r.tagId));
    if (kept.length === refs.length) continue;
    if (videos === state.videos) videos = { ...state.videos };
    if (kept.length) videos[key] = kept;
    else delete videos[key];
    changed = true;
  }

  let suppressed = state.suppressed;
  for (const [key, list] of Object.entries(state.suppressed)) {
    const kept = list.filter(live);
    if (kept.length === list.length) continue;
    if (suppressed === state.suppressed) suppressed = { ...state.suppressed };
    if (kept.length) suppressed[key] = kept;
    else delete suppressed[key];
    changed = true;
  }

  const seededGames = state.seededGames.filter((id) => ids.has(id));
  if (seededGames.length !== state.seededGames.length) changed = true;
  const seeded: TagRule[] = [];
  for (const game of games) {
    if (seededGames.includes(game.id)) continue;
    seeded.push(defaultGameRule(game, makeId));
    seededGames.push(game.id);
    changed = true;
  }

  if (!changed) return { state, seeded };
  return {
    state: { ...state, rules: [...keptRules, ...seeded], videos, suppressed, seededGames },
    seeded,
  };
}

export function moveRule(rules: readonly TagRule[], orderedIds: readonly string[]): TagRule[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((r): r is TagRule => r != null);
  const rest = rules.filter((r) => !orderedIds.includes(r.id));
  return [...ordered, ...rest];
}

/** Game tag first, then plain tags in the order they were added. */
export function orderVideoTags(refs: readonly VideoTagRef[]): VideoTagRef[] {
  const game = refs.filter((r) => isGameTagId(r.tagId));
  return [...game, ...refs.filter((r) => !isGameTagId(r.tagId))];
}

export function tagCountLabel(count: number, tagName: string): string {
  if (count === 0) return `No videos matched ${tagName}`;
  return `Tagged ${count} video${count === 1 ? "" : "s"} ${tagName}`;
}

const FIELDS = new Set<TagRuleField>(["title", "channel", "description"]);
const OPS = new Set<TagRuleOp>(["includes", "is"]);

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function normalizeRefs(raw: unknown): VideoTagRef[] {
  if (!Array.isArray(raw)) return [];
  const out: VideoTagRef[] = [];
  let game = false;
  for (const r of raw) {
    const tagId = str((r as VideoTagRef)?.tagId);
    const source = str((r as VideoTagRef)?.source);
    if (!tagId || !source || (source !== "manual" && !source.startsWith("rule:"))) continue;
    if (out.some((x) => x.tagId === tagId)) continue;
    if (isGameTagId(tagId)) {
      if (game) continue;
      game = true;
    }
    out.push({ tagId, source: source as TagSource });
  }
  return out;
}

export function normalizeLibraryTags(raw: unknown): LibraryTagsState {
  if (typeof raw !== "object" || raw === null) return EMPTY_LIBRARY_TAGS;
  const r = raw as Partial<Record<keyof LibraryTagsState, unknown>>;
  const tags: PlainTag[] = [];
  for (const t of Array.isArray(r.tags) ? r.tags : []) {
    const id = str((t as PlainTag)?.id);
    const name = str((t as PlainTag)?.name)?.trim();
    if (id && name && !isGameTagId(id) && !tags.some((x) => x.id === id)) tags.push({ id, name });
  }
  const rules: TagRule[] = [];
  for (const x of Array.isArray(r.rules) ? r.rules : []) {
    const rule = x as Partial<TagRule>;
    const id = str(rule?.id);
    if (!id || rules.some((y) => y.id === id)) continue;
    rules.push({
      id,
      field: FIELDS.has(rule.field as TagRuleField) ? (rule.field as TagRuleField) : "title",
      op: OPS.has(rule.op as TagRuleOp) ? (rule.op as TagRuleOp) : "includes",
      text: str(rule.text) ?? "",
      tagId: str(rule.tagId) ?? "",
      enabled: rule.enabled !== false,
    });
  }
  const videos: Record<string, VideoTagRef[]> = {};
  if (typeof r.videos === "object" && r.videos !== null) {
    for (const [key, refs] of Object.entries(r.videos as Record<string, unknown>)) {
      const clean = normalizeRefs(refs);
      if (clean.length) videos[key] = clean;
    }
  }
  const suppressed: Record<string, string[]> = {};
  if (typeof r.suppressed === "object" && r.suppressed !== null) {
    for (const [key, list] of Object.entries(r.suppressed as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const clean = [...new Set(list.filter((t): t is string => typeof t === "string" && t.length > 0))];
      if (clean.length) suppressed[key] = clean;
    }
  }
  const seededGames = Array.isArray(r.seededGames)
    ? [...new Set(r.seededGames.filter((g): g is string => typeof g === "string" && g.length > 0))]
    : [];
  return { tags, rules, videos, suppressed, seededGames };
}

export const LIBRARY_TAGS_FILE_VERSION = 1;

export type LibraryTagsSnapshot = { version: number; savedAt: number; state: LibraryTagsState };

export function serializeLibraryTags(state: LibraryTagsState, savedAt: number): string {
  const snap: LibraryTagsSnapshot = { version: LIBRARY_TAGS_FILE_VERSION, savedAt, state };
  return JSON.stringify(snap);
}

/** `null` when the text is not a snapshot (bad JSON or wrong shape). */
export function parseLibraryTagsSnapshot(raw: string | null | undefined): LibraryTagsSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LibraryTagsSnapshot> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.state !== "object") return null;
    const savedAt = typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0;
    return {
      version: typeof parsed.version === "number" ? parsed.version : LIBRARY_TAGS_FILE_VERSION,
      savedAt,
      state: normalizeLibraryTags(parsed.state),
    };
  } catch {
    return null;
  }
}

/** Whichever copy was saved last wins whole, so a removal that reached only one copy is not undone. */
export function pickNewerSnapshot(
  local: LibraryTagsSnapshot | null,
  file: LibraryTagsSnapshot | null,
): { snapshot: LibraryTagsSnapshot | null; source: "local" | "file" | "none" } {
  if (!local && !file) return { snapshot: null, source: "none" };
  if (!file) return { snapshot: local, source: "local" };
  if (!local || file.savedAt > local.savedAt) return { snapshot: file, source: "file" };
  return { snapshot: local, source: "local" };
}
