import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { MediaFile } from "./types";
import { useRuforgeStore } from "./store/ruforgeStore";
import {
  parseVttToTranscriptCues,
  formatTranscriptPlain,
  formatTranscriptTimestamped,
  formatTranscriptMarkdown,
} from "./transcriptFormat";

export type TranscriptVariant = "plain" | "timestamped" | "markdown";

export async function copyTranscriptForFile(
  file: MediaFile,
  variant: TranscriptVariant,
  vttPath?: string,
): Promise<void> {
  const { notify } = useRuforgeStore.getState();

  const path = vttPath ?? file.subtitlePath;
  if (!path) {
    notify("No subtitle file available for this video.", "error");
    return;
  }

  let vttContent: string;
  try {
    vttContent = await invoke<string>("read_local_subtitle_vtt", { path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    notify(`Failed to read subtitle file: ${msg}`, "error");
    return;
  }

  const cues = parseVttToTranscriptCues(vttContent);
  if (cues.length === 0) {
    notify("Subtitle file contained no usable cues.", "error");
    return;
  }

  let output: string;
  switch (variant) {
    case "plain":
      output = formatTranscriptPlain(cues);
      break;
    case "timestamped":
      output = formatTranscriptTimestamped(cues);
      break;
    case "markdown":
      output = formatTranscriptMarkdown(cues, file.chapters, file.name);
      break;
  }

  try {
    await writeText(output);
  } catch {
    try {
      await navigator.clipboard.writeText(output);
    } catch {
      notify("Failed to write to clipboard.", "error");
      return;
    }
  }

  notify("Transcript copied");
}
