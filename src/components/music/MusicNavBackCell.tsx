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
  const bg = inLeftStack ? "transparent" : shellBlack ? "var(--music-bg)" : "var(--music-surface)";

  return (
    <div
      className="shrink-0 w-full flex items-center overflow-hidden"
      style={{
        height: "var(--music-explore-bar-height)",
        background: bg,
        borderBottomLeftRadius: inLeftStack ? 0 : "var(--music-panel-radius)",
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className={cn(
          "rf-music-back-btn flex items-center h-8 text-sm text-left transition-all duration-200 ease-out overflow-hidden",
          collapsed ? "justify-center w-full px-0" : "gap-2 px-3 w-full min-w-0",
          "rf-music-tooltip-anchor",
        )}
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
