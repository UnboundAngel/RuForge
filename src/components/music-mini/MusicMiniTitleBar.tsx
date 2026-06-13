import { Pin, ExternalLink, X } from "lucide-react";
import { closeMusicMiniFromMini } from "@/lib/mainPlaybackClaim";
import { cn } from "@/lib/utils";

type Props = {
  isPinned: boolean;
  onTogglePin: () => void;
  onBack: () => void;
  startDrag: () => void;
  isExpanded?: boolean;
};

export function MusicMiniTitleBar({
  isPinned,
  onTogglePin,
  onBack,
  startDrag,
  isExpanded = false,
}: Props) {
  return (
    <div
      className={cn(
        "absolute top-0 left-0 right-0 z-50 flex items-center px-2 pointer-events-none rf-mm-titlebar",
        isExpanded ? "h-12" : "h-10",
      )}
    >
      <button
        type="button"
        onClick={onBack}
        className="rf-mm-chrome-btn pointer-events-auto"
        aria-label="Back to RuForge"
      >
        <ExternalLink size={14} strokeWidth={2.25} />
      </button>

      <div
        className="flex-1 h-full cursor-move pointer-events-auto relative min-h-10"
        onPointerDown={(e) => {
          e.stopPropagation();
          startDrag();
        }}
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid grid-rows-2 grid-flow-col gap-[3px] pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="w-[3px] h-[3px] rounded-full bg-white/85" />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-0.5 pointer-events-auto">
        <button
          type="button"
          onClick={onTogglePin}
          className={cn("rf-mm-chrome-btn", isPinned && "rf-mm-control-active")}
          aria-label={isPinned ? "Unpin" : "Pin"}
        >
          <Pin size={13} strokeWidth={2.25} className={isPinned ? "fill-current" : ""} />
        </button>
        <button
          type="button"
          onClick={() => void closeMusicMiniFromMini()}
          className="rf-mm-chrome-btn"
          aria-label="Close"
        >
          <X size={15} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
