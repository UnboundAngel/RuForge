import { X } from "lucide-react";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import { cn } from "@/lib/utils";

type DismissPillProps = {
  label: string;
  dismissTooltip: string;
  onDismiss: () => void;
  className?: string;
};

/** Accent capsule for a temporary mode the user can end; the close button is its only action. */
export function DismissPill({ label, dismissTooltip, onDismiss, className }: DismissPillProps) {
  return (
    <div
      className={cn(
        "flex h-7 min-w-0 max-w-[16rem] items-center gap-1 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_16%,var(--rf-bezel))] pl-3 pr-1 text-[12px] font-semibold text-[color:var(--accent)]",
        className,
      )}
    >
      <HoverMarqueeText text={label} slow />
      <button
        type="button"
        onClick={onDismiss}
        data-tooltip={dismissTooltip}
        aria-label={dismissTooltip}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-[color:var(--accent)] hover:text-[color:var(--rf-on-accent)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--accent)]"
      >
        <X size={12} strokeWidth={2.75} />
      </button>
    </div>
  );
}
