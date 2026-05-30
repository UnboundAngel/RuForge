import { invoke } from "@tauri-apps/api/core";

export type DeleteMediaResult = {
  removed: boolean;
  alreadyMissing: boolean;
  sidecarWarnings?: string[];
};

export async function deleteMediaAtPath(videoPath: string): Promise<DeleteMediaResult> {
  return invoke<DeleteMediaResult>("delete_media", { videoPath });
}
