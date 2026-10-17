import type { CSSProperties, ReactNode } from "react";

export type FilterOption<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
  /** Text and icon color while idle. */
  accent: string;
  /** Fill while selected. */
  accentBg: string;
  /** Fill while idle and expanded. */
  accentBgMuted: string;
};

const SHADOW = "0 1px 3px rgb(0 0 0 / 0.42), 0 0 0 1px rgb(255 255 255 / 0.07)";
const SHADOW_COMPACT = "0 2px 6px rgb(0 0 0 / 0.48), 0 0 0 1px rgb(255 255 255 / 0.09)";
const SHADOW_ACTIVE = "0 3px 10px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.12)";

function pillStyle(o: FilterOption<string>, active: boolean, compact: boolean, plain: boolean): CSSProperties {
  const boxShadow = compact ? (active ? SHADOW_ACTIVE : SHADOW_COMPACT) : SHADOW;
  if (active) {
    return plain
      ? { background: "var(--ph-text)", color: "var(--ph-bg)", boxShadow }
      : { background: o.accentBg, color: "#fff", boxShadow };
  }
  return {
    background: compact ? "#2c2c2c" : o.accentBgMuted,
    color: plain ? "var(--ph-text-2)" : o.accent,
    boxShadow,
  };
}

/** Desktop Music home filters: labels collapse to icons once the page scrolls under the header. */
export function FilterPills<T extends string>({
  value,
  options,
  compact,
  onChange,
}: {
  value: T;
  options: FilterOption<T>[];
  compact: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className={`ph-filters${compact ? " ph-filters--compact" : ""}`} role="tablist">
      {options.map((o) => {
        const active = o.id === value;
        const showLabel = active || !o.icon || !compact;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ph-filter${o.icon ? "" : " ph-filter--text"}${o.icon && showLabel ? " ph-filter--labeled" : ""}`}
            style={pillStyle(o, active, compact, !o.icon)}
            onClick={() => onChange(o.id)}
          >
            {o.icon ? <span className="ph-filter-icon">{o.icon}</span> : null}
            {o.icon ? (
              <span className={`ph-reveal${showLabel ? " ph-reveal--on" : ""}`} aria-hidden={!showLabel}>
                <span className="ph-reveal-clip">
                  <span className="ph-filter-label ph-cap">{o.label}</span>
                </span>
              </span>
            ) : (
              <span className="ph-cap">{o.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
