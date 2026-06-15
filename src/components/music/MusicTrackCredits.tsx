import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";

export type MusicCreditGroup = {
  label: string;
  values: string[];
};

type Props = {
  groups: MusicCreditGroup[];
  trackTitle: string;
  path: string;
};

const VISIBLE_ROLE_ROWS = 5;

function formatRoleLabel(label: string): string {
  return label
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function MusicTrackCredits({ groups, trackTitle, path }: Props) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  if (groups.length === 0) return null;

  const animMs = reduceMotion ? 0 : 220;

  return (
    <div className="max-w-lg">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="track-credits"
        className="inline-flex items-center gap-2 text-white/45 hover:text-white/90 transition-colors duration-200 w-fit"
      >
        <span className="text-sm font-medium tracking-tight">Credits</span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          className="shrink-0 opacity-50"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: reduceMotion ? "none" : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </button>

      <div
        className="grid"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: reduceMotion ? "none" : `grid-template-rows ${animMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        }}
        aria-hidden={!open}
      >
        <div className="overflow-hidden min-h-0">
          <div
            id="track-credits"
            role="region"
            aria-label={`Credits for ${trackTitle}`}
            className="pt-2"
            style={{
              opacity: open ? 1 : 0,
              transition: reduceMotion ? "none" : `opacity ${animMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
            }}
          >
            <div className="rounded-2xl bg-white/[0.04] px-5 py-3.5">
              <div
                className="flex flex-col gap-3.5 overflow-y-auto rf-scrollbar pr-1"
                style={{ maxHeight: `${VISIBLE_ROLE_ROWS * 2.35}rem` }}
              >
                {groups.map((group, idx) => (
                  <div key={idx} className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">
                      {formatRoleLabel(group.label)}
                    </span>
                    <p className="text-sm text-white/70 font-light leading-relaxed">
                      {group.values.join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
