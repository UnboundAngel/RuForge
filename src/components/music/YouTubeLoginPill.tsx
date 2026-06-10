import {
  titlebarLoginPillClassName,
  titlebarTooltipClassName,
} from "@/components/TitlebarHoverButton";
import { openExplorerForLogin } from "@/lib/openExplorerForLogin";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: "sm" | "md";
};

export function YouTubeLoginPill({ className, size = "md" }: Props) {
  const h = size === "sm" ? "h-7" : "h-8";

  return (
    <div className={cn("group/tbar-tt relative flex h-10 items-center shrink-0", className)}>
      <button
        type="button"
        onClick={() => openExplorerForLogin()}
        className={cn(titlebarLoginPillClassName, h, "cursor-pointer")}
        aria-label="Log in with YouTube"
      >
        Log in
      </button>
      <div role="tooltip" className={titlebarTooltipClassName}>
        Open Explorer to sign in with YouTube
      </div>
    </div>
  );
}
