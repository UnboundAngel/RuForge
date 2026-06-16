import { invoke } from "@tauri-apps/api/core";
import type {
  CommentsSidecarCommentRaw,
  CommentsSidecarV1,
  VideoComment,
} from "./videoCommentsTypes";

function stripYtdlpStreamSuffix(stem: string): string {
  const dotF = stem.lastIndexOf(".f");
  if (dotF === -1) return stem;
  const tail = stem.slice(dotF + 2);
  if (!tail) return stem;
  if (/^[\d.-]+$/.test(tail)) return stem.slice(0, dotF);
  return stem;
}

function stemCandidates(mediaPath: string): string[] {
  const file = mediaPath.replace(/^.*[/\\]/, "");
  const stem = file.replace(/\.[^.]+$/, "");
  const stripped = stripYtdlpStreamSuffix(stem);
  return stripped === stem ? [stem] : [stem, stripped];
}

function pathSep(dir: string): string {
  return dir.includes("\\") ? "\\" : "/";
}

export function commentsSidecarPaths(mediaPath: string): string[] {
  const dir = mediaPath.replace(/[/\\][^/\\]+$/, "");
  const sep = pathSep(dir);
  return stemCandidates(mediaPath).map((stem) => `${dir}${sep}${stem}.comments.json`);
}

function displayUser(author: string): string {
  const trimmed = author.trim();
  if (!trimmed) return "@unknown";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function rawToVideoComment(raw: CommentsSidecarCommentRaw): VideoComment {
  return {
    id: raw.id,
    user: displayUser(raw.author),
    avatar: raw.author_thumbnail?.trim() ?? "",
    likes: typeof raw.like_count === "number" && Number.isFinite(raw.like_count) ? raw.like_count : 0,
    text: raw.text,
    time: raw._time_text?.trim() ?? "",
    timestamp: typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp) ? raw.timestamp : undefined,
    replies: [],
  };
}

function isRootParent(parent: string | undefined): boolean {
  const p = parent?.trim() ?? "";
  return !p || p === "root";
}

function buildCommentTree(flat: CommentsSidecarCommentRaw[]): VideoComment[] {
  const byId = new Map<string, VideoComment>();
  for (const raw of flat) {
    if (!raw.id?.trim() || !raw.text?.trim()) continue;
    byId.set(raw.id, rawToVideoComment(raw));
  }

  const roots: VideoComment[] = [];
  for (const raw of flat) {
    const node = byId.get(raw.id);
    if (!node) continue;
    if (isRootParent(raw.parent)) {
      roots.push(node);
      continue;
    }
    const parentId = raw.parent?.trim() ?? "";
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

function parseSidecarV1(raw: string): VideoComment[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const sidecar = parsed as Partial<CommentsSidecarV1>;
  if (sidecar.v !== 1 || !Array.isArray(sidecar.comments)) return null;
  return buildCommentTree(sidecar.comments);
}

export type VideoCommentsLoadPhase = "disk" | "network";

export type VideoCommentsLoadResult =
  | { status: "ready"; comments: VideoComment[] }
  | { status: "empty" }
  | { status: "missing" }
  | { status: "error" };

type LoadVideoCommentsOpts = {
  mediaPath: string;
  sourceUrl?: string | null;
  downloadCommentsEnabled: boolean;
  browserCookies?: string | null;
  cookieFile?: string | null;
  onPhase?: (phase: VideoCommentsLoadPhase) => void;
};

async function readSidecarFromDisk(mediaPath: string): Promise<string | null> {
  return invoke<string | null>("read_video_comments_sidecar", { mediaPath });
}

async function ensureSidecarFromNetwork(
  mediaPath: string,
  sourceUrl: string,
  browserCookies?: string | null,
  cookieFile?: string | null,
): Promise<string | null> {
  return invoke<string | null>("ensure_video_comments_sidecar", {
    mediaPath,
    sourceUrl: sourceUrl.trim(),
    browserCookies: browserCookies?.trim() || null,
    cookieFile: cookieFile?.trim() || null,
  });
}

function resultFromRaw(raw: string): VideoCommentsLoadResult {
  const tree = parseSidecarV1(raw);
  if (tree === null) return { status: "error" };
  if (tree.length === 0) return { status: "empty" };
  return { status: "ready", comments: tree };
}

export async function loadVideoComments(opts: LoadVideoCommentsOpts): Promise<VideoCommentsLoadResult> {
  const { mediaPath, sourceUrl, downloadCommentsEnabled, browserCookies, cookieFile, onPhase } = opts;

  onPhase?.("disk");
  let diskRaw: string | null;
  try {
    diskRaw = await readSidecarFromDisk(mediaPath);
  } catch {
    return { status: "error" };
  }

  if (diskRaw) {
    return resultFromRaw(diskRaw);
  }

  const url = sourceUrl?.trim();
  if (!url) {
    return downloadCommentsEnabled ? { status: "error" } : { status: "missing" };
  }

  onPhase?.("network");
  try {
    const raw = await ensureSidecarFromNetwork(mediaPath, url, browserCookies, cookieFile);
    if (!raw) return { status: "empty" };
    return resultFromRaw(raw);
  } catch {
    return { status: "error" };
  }
}

export async function hasVideoCommentsSidecar(mediaPath: string): Promise<boolean> {
  try {
    const raw = await invoke<string | null>("read_video_comments_sidecar", { mediaPath });
    return raw != null && parseSidecarV1(raw) != null;
  } catch {
    return false;
  }
}
