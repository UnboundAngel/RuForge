import { useRef } from "react";
import { Home, Library, Search } from "./icons";
import type { Tab } from "../types";

const TABS = [
  { id: "home", label: "Home", Icon: Home },
  { id: "search", label: "Search", Icon: Search },
  { id: "library", label: "Library", Icon: Library },
] as const;

/** Compact header pill from desktop Music home, reused as the tab switcher: the active tab carries its label. Drag a finger across it to slide between tabs. */
export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const dragging = useRef(false);
  const last = useRef<Tab>(tab);
  last.current = tab;

  const tabAt = (x: number, y: number): Tab | null => {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-tab]");
    return (hit?.dataset.tab as Tab | undefined) ?? null;
  };

  return (
    <nav
      className="ph-tabbar"
      aria-label="Sections"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const next = tabAt(e.clientX, e.clientY);
        if (next && next !== last.current) {
          last.current = next;
          onTab(next);
        }
      }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            data-tab={id}
            className={`ph-tabbar-btn${active ? " ph-tabbar-btn--on" : ""}`}
            onClick={() => onTab(id)}
            aria-current={active ? "page" : undefined}
            aria-label={label}
          >
            <span className="ph-tabbar-icon">
              <Icon size={20} strokeWidth={2.25} />
            </span>
            <span className={`ph-reveal${active ? " ph-reveal--on" : ""}`} aria-hidden>
              <span className="ph-reveal-clip">
                <span className="ph-tabbar-label ph-cap">{label}</span>
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
