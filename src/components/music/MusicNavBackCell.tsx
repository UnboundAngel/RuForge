import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  collapsed: boolean;
  shellBlack: boolean;
  /** Back row is part of the shared left L-column shell (no own fill/radius). */
  inLeftStack?: boolean;
  onBack: () => void;
};

/** Bottom-left chrome cell: Back to RuForge, aligned with the Explore boot bar row. */
export function MusicNavBackCell({ collapsed, shellBlack, inLeftStack = false, onBack }: Props) {
  const collapsedPill = collapsed && inLeftStack;
  const bg = collapsedPill
    ? shellBlack
      ? "var(--music-bg)"
      : "var(--music-surface)"
    : inLeftStack
      ? "transparent"
      : shellBlack
        ? "var(--music-bg)"
        : "var(--music-surface)";

  return (
    <div
      className={cn(
        "shrink-0 flex items-center overflow-hidden",
        collapsedPill ? "justify-center w-full" : "w-full",
      )}
      style={{
        height: "var(--music-explore-bar-height)",
        background: collapsedPill ? "transparent" : bg,
        borderBottomLeftRadius: collapsedPill || inLeftStack ? 0 : "var(--music-panel-radius)",
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className={cn(
          "rf-music-back-btn flex items-center text-sm text-left transition-all duration-200 ease-out overflow-hidden rf-music-tooltip-anchor",
          collapsedPill
            ? "justify-center w-10 h-10 shrink-0"
            : collapsed
              ? "justify-center h-8 w-full px-0"
              : "gap-2 px-3 h-8 w-full min-w-0",
        )}
        style={
          collapsedPill
            ? {
                background: bg,
                borderRadius: "var(--music-panel-radius)",
              }
            : undefined
        }
        data-tooltip={collapsed ? "Back to RuForge" : "Back to RuForge (Ctrl+B toggles nav)"}
      >
        <ChevronLeft size={16} className="shrink-0" />
        <span
          className={cn(
            "whitespace-nowrap transition-all duration-200 ease-out",
            collapsed ? "max-w-0 opacity-0" : "max-w-[12rem] opacity-100",
          )}
        >
          Back to RuForge
        </span>
      </button>
    </div>
  );
}
