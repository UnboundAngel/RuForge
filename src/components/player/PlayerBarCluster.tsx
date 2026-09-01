import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared player bar chrome — darker rest, slightly lighter hover. */
export const playerBarChromeClass =
  "bg-white/[0.06] transition-colors hover:bg-white/[0.11]";

/** Solo control (play): 36×36 circle. */
export const playerBarSoloBtnClass = `flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white active:scale-95 ${playerBarChromeClass}`;

/** Button inside a shared group pill. */
export const playerBarInnerBtnClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-transparent text-white transition-colors hover:bg-white/[0.11] active:scale-95";

export function PlayerBarInnerButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${playerBarInnerBtnClass} ${className}`} {...props} />
  );
}

export function PlayerBarTextBubble({
  children,
  className = "",
  onClick,
  disabled,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 max-w-full shrink-0 items-center rounded-full px-2.5 text-[12px] font-medium tabular-nums text-white ${playerBarChromeClass} ${
        onClick ? "disabled:opacity-40" : ""
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

export function PlayerBarGroupBubble({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-9 shrink-0 items-center gap-0 rounded-full p-[3px] ${playerBarChromeClass} ${className}`}
    >
      {children}
    </div>
  );
}
