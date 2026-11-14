import type { CSSProperties, ReactNode } from "react";

export function IslandProgressShell({
  ringRef,
  borderRadius,
  width,
  height,
  children,
  className,
  onClick,
  ariaExpanded,
  ariaLabel,
  interactive,
  showProgress,
}: {
  ringRef: React.RefObject<SVGRectElement | null>;
  borderRadius: number;
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  ariaExpanded: boolean;
  ariaLabel: string;
  interactive: boolean;
  showProgress: boolean;
}) {
  const innerRadius = Math.max(0, borderRadius - 2);
  const strokeWidth = 2;
  const inset = strokeWidth / 2;
  const pathRadius = Math.max(0, borderRadius - inset);
  const ShellTag = interactive ? "button" : "div";

  return (
    <ShellTag
      type={interactive ? "button" : undefined}
      className={`relative block h-full w-full border-0 bg-transparent p-0 text-left ${
        interactive ? "cursor-pointer" : "cursor-default"
      } ${className ?? ""}`}
      style={{ borderRadius, WebkitAppRegion: "no-drag" } as CSSProperties}
      onClick={interactive ? onClick : undefined}
      aria-expanded={interactive ? ariaExpanded : undefined}
      aria-label={interactive ? ariaLabel : undefined}
    >
      {showProgress ? (
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden
        >
          <rect
            x={inset}
            y={inset}
            width={Math.max(0, width - strokeWidth)}
            height={Math.max(0, height - strokeWidth)}
            rx={pathRadius}
            ry={pathRadius}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={strokeWidth}
          />
          <rect
            ref={ringRef}
            x={inset}
            y={inset}
            width={Math.max(0, width - strokeWidth)}
            height={Math.max(0, height - strokeWidth)}
            rx={pathRadius}
            ry={pathRadius}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1}
            style={{ transition: "stroke-dashoffset 80ms linear" }}
          />
        </svg>
      ) : null}
      <div
        className="absolute inset-[2px] overflow-hidden bg-black"
        style={{ borderRadius: innerRadius }}
      >
        {children}
      </div>
    </ShellTag>
  );
}
