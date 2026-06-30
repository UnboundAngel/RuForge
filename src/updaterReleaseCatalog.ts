import { teaserNotesFromUpdaterBody } from "./updatePostInstall";

const REPO = "UnboundAngel/RuForge";

export type ReleaseCatalogEntry = {
  version: string;
  notes: string;
};

export async function fetchReleaseCatalog(limit = 12): Promise<ReleaseCatalogEntry[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=${limit}`);
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      draft?: boolean;
      tag_name?: string;
      body?: string | null;
    }>;
    return rows
      .filter((row) => !row.draft && row.tag_name)
      .map((row) => ({
        version: row.tag_name!.replace(/^v/i, ""),
        notes: teaserNotesFromUpdaterBody(row.body ?? ""),
      }));
  } catch {
    return [];
  }
}
