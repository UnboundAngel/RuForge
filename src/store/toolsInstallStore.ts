import { create } from "zustand";

export type ToolsStatus = {
  ytdlp: boolean;
  ffmpeg: boolean;
  ffprobe: boolean;
  installing: boolean;
  downloadBytes: number;
};

export type ToolsInstallProgress = {
  phase: "checking" | "downloading" | "verifying" | "extracting" | "done" | "error";
  tool: "ffmpeg" | "yt-dlp" | null;
  received: number;
  total: number;
  fraction: number;
  error: string | null;
};

/** idle: nothing to show. done: finishing, the ring is fading out. */
export type ToolsInstallPhase = "idle" | "installing" | "done" | "error";

export type ToolsInstallTool = "ffmpeg" | "yt-dlp" | "deno";
/** download: first-time fetch of a missing tool. update: an installed tool being replaced. */
export type ToolsInstallKind = "download" | "update";
export type ToolsInstallStep = "downloading" | "verifying" | "extracting";

type ToolsInstallState = {
  status: ToolsStatus | null;
  phase: ToolsInstallPhase;
  kind: ToolsInstallKind;
  tool: ToolsInstallTool | null;
  step: ToolsInstallStep;
  fraction: number;
  error: string | null;
  /** Debugging switch that fakes an install so the ring can be seen without missing tools. */
  previewing: boolean;
};

export const useToolsInstallStore = create<ToolsInstallState>(() => ({
  status: null,
  phase: "idle",
  kind: "download",
  tool: null,
  step: "downloading",
  fraction: 0,
  error: null,
  previewing: false,
}));

export function toolsMissing(status: ToolsStatus | null): boolean {
  return status != null && !(status.ytdlp && status.ffmpeg && status.ffprobe);
}

export function toolsPercent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}

const TOOL_NAMES: Record<ToolsInstallTool, string> = {
  ffmpeg: "ffmpeg",
  "yt-dlp": "yt-dlp",
  deno: "Deno",
};

/** Tooltip copy for the rail button, or null when nothing is running or failed. */
export function toolsRailLabel(s: ToolsInstallState): string | null {
  if (s.phase === "error") return s.error?.split("\n")[0] ?? "Could not get download tools";
  if (s.phase === "idle") return null;
  const name = s.tool ? TOOL_NAMES[s.tool] : "tools";
  if (s.phase === "done") return s.kind === "update" ? `${name} updated` : "Download tools ready";
  if (s.step === "verifying") return `Verifying ${name}`;
  if (s.step === "extracting") return `Unpacking ${name}`;
  const verb = s.kind === "update" ? "Updating" : "Downloading";
  return `${verb} ${name} ${toolsPercent(s.fraction)}%`;
}
