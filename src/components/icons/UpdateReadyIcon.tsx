import type { CSSProperties } from "react";

/** Refresh loop around a filled spark: "a new build is ready". Own glyph so it never reads as a download arrow. */
export function UpdateReadyIcon({ size = 16, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M17.66 2.34v4h-4" />
      {/* Filled, not stroked: a 2px stroke turns a spark this small into a blob. */}
      <path d="M12 8l1.1 2.9L16 12l-2.9 1.1L12 16l-1.1-2.9L8 12l2.9-1.1z" fill="currentColor" stroke="none" />
    </svg>
  );
}
