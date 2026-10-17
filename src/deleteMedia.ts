import { invoke } from "@tauri-apps/api/core";
import { bumpLocalImageGeneration } from "@/lib/localImageSrc";

export type DeleteMediaResult = {
  removed: boolean;
  alreadyMissing: boolean;
  sidecarWarnings?: string[];
};

export async function deleteMediaAtPath(videoPath: string): Promise<DeleteMediaResult> {
  const result = await invoke<DeleteMediaResult>("delete_media", { videoPath });
  // A re-download can write different art to the same cover paths.
  bumpLocalImageGeneration();
  return result;
}
