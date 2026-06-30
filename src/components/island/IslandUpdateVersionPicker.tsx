import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";

const PICKER_CHIP =
  "flex h-8 w-full items-center justify-between gap-1 rounded-[10px] border border-white/10 bg-[#271C18]/95 px-2 text-[10px] font-black uppercase tracking-widest text-[#EDD79C]/90 shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-[transform,background-color,filter] duration-150 hover:brightness-110 active:scale-[0.99]";

type IslandUpdateVersionPickerProps = {
  versions: readonly string[];
  value: string;
  onChange: (version: string) => void;
};

export function IslandUpdateVersionPicker({
  versions,
  value,
  onChange,
}: IslandUpdateVersionPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const widthPx = islandUpdateVersionPickerWidth(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const canPick = versions.length > 1;

  return (
    <div ref={rootRef} className="relative shrink-0" style={{ width: widthPx }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (canPick) setOpen((v) => !v);
        }}
        aria-haspopup={canPick ? "listbox" : undefined}
        aria-expanded={canPick ? open : undefined}
        aria-label={canPick ? `Select version, currently ${value}` : `Version ${value}`}
        className={PICKER_CHIP}
      >
        <span className="truncate tabular-nums">v{value}</span>
        {canPick ? (
          <Icon
            icon="tabler:chevron-down"
            width={12}
            height={12}
            className={`shrink-0 text-[#EDD79C]/60 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        ) : null}
      </button>
      {open && canPick ? (
        <ul
          role="listbox"
          className="rf-island-update-version-menu absolute left-0 top-full z-20 mt-1 overflow-y-auto rounded-[10px] border border-white/10 bg-[#271C18] p-0.5 shadow-[0_8px_20px_rgba(0,0,0,0.45)] scrollbar-none"
          style={{ width: widthPx, maxHeight: "7.5rem" }}
          onClick={(e) => e.stopPropagation()}
        >
          {versions.map((ver) => {
            const active = ver === value;
            return (
              <li key={ver} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(ver);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center rounded-md px-2 py-1 text-left text-[10px] font-medium tabular-nums transition-colors ${
                    active
                      ? "bg-white/10 text-[#EDD79C]"
                      : "text-stone-400 hover:bg-white/5 hover:text-stone-200"
                  }`}
                >
                  v{ver}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function islandUpdateVersionPickerWidth(version: string): number {
  const label = `v${version.trim() || "…"}`;
  return Math.min(120, Math.max(72, Math.ceil(label.length * 6.5) + 30));
}
