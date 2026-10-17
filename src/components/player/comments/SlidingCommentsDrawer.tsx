import { useState, type ReactNode } from "react";
import type { VideoCommentsViewState } from "./useVideoComments";
import { CommentsPanel, type PlayerSidePanelTab } from "./CommentsPanel";
import { PlayerSidePanelShell, SIDE_PANEL_WIDTH } from "../sidePanel/PlayerSidePanelShell";
import type { VideoComment } from "@/lib/videoCommentsTypes";

export const COMMENTS_PANEL_WIDTH = SIDE_PANEL_WIDTH;

type SlidingCommentsDrawerProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tab: PlayerSidePanelTab;
  onTabChange: (tab: PlayerSidePanelTab) => void;
  description: ReactNode;
  comments: VideoComment[];
  commentsLoading?: boolean;
  commentsLoadingLabel?: string;
  commentsViewState?: VideoCommentsViewState;
  downloadCommentsEnabled?: boolean;
  onCommentsRetry?: () => void;
  enableEdgeHold?: boolean;
  onAnimatedXChange?: (x: number) => void;
};

export function SlidingCommentsDrawer({
  isOpen,
  onOpenChange,
  tab,
  onTabChange,
  description,
  comments,
  commentsLoading = false,
  commentsLoadingLabel,
  commentsViewState = "loading",
  downloadCommentsEnabled = false,
  onCommentsRetry,
  enableEdgeHold = true,
  onAnimatedXChange,
}: SlidingCommentsDrawerProps) {
  const [filterType, setFilterType] = useState<"top" | "newest">("top");

  return (
    <PlayerSidePanelShell
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      enableEdgeHold={enableEdgeHold}
      onAnimatedXChange={onAnimatedXChange}
    >
      <CommentsPanel
        tab={tab}
        onTabChange={onTabChange}
        description={description}
        comments={comments}
        filterType={filterType}
        onFilterChange={setFilterType}
        onClose={() => onOpenChange(false)}
        loading={commentsLoading}
        loadingLabel={commentsLoadingLabel}
        viewState={commentsViewState}
        downloadCommentsEnabled={downloadCommentsEnabled}
        onRetry={onCommentsRetry}
      />
    </PlayerSidePanelShell>
  );
}
