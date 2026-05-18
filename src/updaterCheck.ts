import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { teaserNotesFromUpdaterBody } from "./updatePostInstall";

export type UpdateCheckResult =
  | { kind: "available"; update: Update; version: string; teaserNotes: string }
  | { kind: "up-to-date"; currentVersion: string }
  | { kind: "error"; message: string };

export async function runUpdateCheck(): Promise<UpdateCheckResult> {
  try {
    const currentVersion = await getVersion();
    const next = await check();
    if (!next) {
      return { kind: "up-to-date", currentVersion };
    }
    return {
      kind: "available",
      update: next,
      version: next.version,
      teaserNotes: teaserNotesFromUpdaterBody(next.body ?? ""),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: "error", message };
  }
}
