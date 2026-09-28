import type { ButtonHTMLAttributes, ReactNode } from "react";

type TitlebarHoverButtonProps = {
  tooltip: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/** Shared with `ExplorerWatchQueueButton` so title bar icons match. */
export const titlebarIconButtonClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors duration-200 hover:text-[color:var(--accent)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:color-mix(in_srgb,var(--accent),transparent_45%)]";

/** Log in chip in the titlebar. */
export const titlebarLoginPillClassName =
  "rf-yt-login-pill flex shrink-0 items-center justify-center rounded-lg border border-stone-500/25 bg-[#1D1613] px-3 text-[10px] font-semibold tracking-wide text-stone-200 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-[color,background-color,border-color,transform] duration-200 hover:border-stone-400/35 hover:bg-[#221a17] hover:text-stone-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:color-mix(in_srgb,var(--accent),transparent_45%)]";

/** Title bar icon control: shared hover/focus treatment; tooltip via `data-tooltip`. */
export function TitlebarHoverButton({
  tooltip,
  children,
  className = "",
  type = "button",
  ...rest
}: TitlebarHoverButtonProps) {
  return (
    <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
      <button
        type={type}
        data-tooltip={tooltip}
        className={`${titlebarIconButtonClass} ${className}`}
        {...rest}
      >
        {children}
      </button>
    </div>
  );
}
