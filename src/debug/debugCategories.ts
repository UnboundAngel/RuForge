/**
 * Canonical debug log category tree. Keep IDs in sync with `src-tauri/src/debug_log.rs`.
 */

export type DebugLogSide = "rust" | "typescript" | "javascript";

export type DebugCategoryNode = {
  id: string;
  label: string;
  side: DebugLogSide;
  children?: DebugCategoryNode[];
};

/** Third-party `log` targets gated when a category is enabled (Rust filter). */
export const DEBUG_THIRD_PARTY_TARGETS: Record<string, string> = {
  lofty: "library.metadata.lofty",
};

export const DEBUG_CATEGORY_TREE: DebugCategoryNode[] = [
  {
    id: "core",
    label: "Core",
    side: "rust",
    children: [
      { id: "core.tray", label: "System tray", side: "rust" },
      { id: "core.startup", label: "Startup and updater probe", side: "rust" },
      { id: "core.platform", label: "Platform hooks", side: "rust" },
    ],
  },
  {
    id: "library",
    label: "Library",
    side: "rust",
    children: [
      { id: "library.scan", label: "Gallery scan", side: "rust" },
      {
        id: "library.metadata",
        label: "Music metadata",
        side: "rust",
        children: [
          { id: "library.metadata.lofty", label: "lofty (embedded tags)", side: "rust" },
          { id: "library.metadata.enrich", label: "MusicBrainz backfill", side: "rust" },
        ],
      },
      { id: "library.dedup", label: "Duplicate download cleanup", side: "rust" },
      { id: "library.delete", label: "Delete and recycle bin", side: "rust" },
    ],
  },
  {
    id: "download",
    label: "Download",
    side: "rust",
    children: [
      { id: "download.jobs", label: "Job lifecycle", side: "rust" },
      { id: "download.ytdlp", label: "yt-dlp process", side: "rust" },
      { id: "download.post", label: "Post-download file listing", side: "rust" },
      { id: "download.rate", label: "Rate limit", side: "rust" },
      { id: "download.binary", label: "Bundled yt-dlp binary", side: "rust" },
      { id: "download.updater", label: "yt-dlp GitHub updater", side: "rust" },
    ],
  },
  {
    id: "explorer",
    label: "Explorer",
    side: "typescript",
    children: [{ id: "explorer.webview", label: "Embedded webview", side: "typescript" }],
  },
  {
    id: "music",
    label: "Music",
    side: "typescript",
    children: [
      { id: "music.explore-nav", label: "Explore navigation", side: "typescript" },
      { id: "music.explore-download", label: "Explore downloads", side: "typescript" },
      { id: "music.webview", label: "Music webview", side: "typescript" },
    ],
  },
  {
    id: "app",
    label: "App shell",
    side: "typescript",
    children: [
      { id: "app.platform", label: "Path hydrate", side: "typescript" },
      { id: "app.queue", label: "Download queue", side: "typescript" },
      { id: "app.player", label: "Player and mini", side: "typescript" },
      { id: "app.settings", label: "Settings", side: "typescript" },
      { id: "app.tray-debug", label: "Tray show (front debug)", side: "typescript" },
    ],
  },
  {
    id: "devtools",
    label: "Dev tools",
    side: "javascript",
    children: [
      { id: "devtools.export", label: "Export bundle helpers", side: "javascript" },
      { id: "devtools.screenshot", label: "Screenshot frame", side: "javascript" },
      { id: "devtools.drop", label: "URL drop intake", side: "javascript" },
    ],
  },
];

export function walkDebugCategories(
  nodes: DebugCategoryNode[],
  visit: (node: DebugCategoryNode, depth: number) => void,
  depth = 0,
): void {
  for (const node of nodes) {
    visit(node, depth);
    if (node.children?.length) walkDebugCategories(node.children, visit, depth + 1);
  }
}

export function allDebugCategoryIds(): string[] {
  const ids: string[] = [];
  walkDebugCategories(DEBUG_CATEGORY_TREE, (node) => {
    ids.push(node.id);
  });
  return ids;
}

export function findDebugCategoryNode(id: string): DebugCategoryNode | null {
  let found: DebugCategoryNode | null = null;
  walkDebugCategories(DEBUG_CATEGORY_TREE, (node) => {
    if (node.id === id) found = node;
  });
  return found;
}

export function collectDescendantCategoryIds(id: string): string[] {
  const node = findDebugCategoryNode(id);
  if (!node) return [];
  const out: string[] = [];
  walkDebugCategories(node.children ?? [], (n) => {
    out.push(n.id);
  });
  return out;
}

/** True when `id` is enabled directly or via an enabled ancestor prefix. */
export function isDebugCategoryEnabled(enabled: ReadonlySet<string>, id: string): boolean {
  if (enabled.has(id)) return true;
  let prefix = id;
  while (prefix.includes(".")) {
    const idx = prefix.lastIndexOf(".");
    prefix = prefix.slice(0, idx);
    if (enabled.has(prefix)) return true;
  }
  return false;
}

export function parentCheckboxState(
  enabled: ReadonlySet<string>,
  node: DebugCategoryNode,
): "checked" | "unchecked" | "indeterminate" {
  const self = enabled.has(node.id);
  const descendants = collectDescendantCategoryIds(node.id);
  if (!node.children?.length) {
    return self ? "checked" : "unchecked";
  }
  const childIds = descendants;
  const on = childIds.filter((cid) => isDebugCategoryEnabled(enabled, cid)).length;
  if (self && on === childIds.length) return "checked";
  if (!self && on === 0) return "unchecked";
  return "indeterminate";
}
