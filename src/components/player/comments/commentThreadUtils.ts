import type { VideoComment } from "@/lib/videoCommentsTypes";

export const COMMENTS_PANEL_WIDTH = 420;

export function formatCommentLikes(num: number): string {
  if (!Number.isFinite(num)) return "";
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return num.toString();
}

export function getTotalRepliesCount(comment: VideoComment): number {
  if (!comment.replies?.length) return 0;
  return comment.replies.reduce(
    (acc, reply) => acc + 1 + getTotalRepliesCount(reply),
    0,
  );
}

export function sortComments(
  comments: VideoComment[],
  filterType: "top" | "newest",
): VideoComment[] {
  const sorted = [...comments];
  if (filterType === "top") {
    sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else {
    sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
  return sorted;
}
