import type { ButtonHTMLAttributes, ReactNode } from "react";

type TitlebarHoverButtonProps = {
  tooltip: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/** Shared with `ExplorerWatchQueueButton` so title bar icons match. */
export const titlebarIconButtonClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors duration-200 hover:text-[color:var(--accent)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:color-mix(in_srgb,var(--accent),transparent_45%)]";

export const titlebarTooltipClassName =
  "pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-[220] -translate-x-1/2 whitespace-nowrap rounded-lg border border-stone-500/25 bg-[#1D1613]/95 px-2.5 py-1.5 text-[10px] font-semibold tracking-wide text-stone-200 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-opacity duration-200 group-hover/tbar-tt:opacity-100 group-focus-within/tbar-tt:opacity-100";

/** Log in chip in the titlebar: same surface language as titlebar tooltips. */
export const titlebarLoginPillClassName =
  "rf-yt-login-pill flex shrink-0 items-center justify-center rounded-lg border border-stone-500/25 bg-[#1D1613] px-3 text-[10px] font-semibold tracking-wide text-stone-200 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-[color,background-color,border-color,transform] duration-200 hover:border-stone-400/35 hover:bg-[#221a17] hover:text-stone-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:color-mix(in_srgb,var(--accent),transparent_45%)]";

/**
 * Title bar icon control: shared hover/focus treatment + custom tooltip under the hit target.
 */
export function TitlebarHoverButton({
  tooltip,
  children,
  className = "",
  type = "button",
  ...rest
}: TitlebarHoverButtonProps) {
  return (
    <div className="group/tbar-tt relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
      <button
        type={type}
        className={`${titlebarIconButtonClass} ${className}`}
        {...rest}
      >
        {children}
      </button>
      <div role="tooltip" className={titlebarTooltipClassName}>
        {tooltip}
      </div>
    </div>
  );
}
