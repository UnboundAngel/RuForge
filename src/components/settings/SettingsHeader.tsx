import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { motion, type MotionValue } from "motion/react";
import { Search, X, type LucideIcon } from "lucide-react";
import type { SettingsTab } from "../../store/types";
import { cn } from "../../lib/utils";
import { MORPH_SPRING } from "../ui/Morph";
import { useRowInnerWidth } from "./useRowInnerWidth";

export type SettingsNavItem = {
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
};

export type SettingsNavGroup = {
  label: string;
  items: readonly SettingsNavItem[];
};

const ICON_BOX_PX = 32;
const EXPAND_EASE = [0.22, 1, 0.36, 1] as const;
const EXPAND_MS = 0.22;

const SEARCH_INPUT_CLASS =
  "rf-settings-search-input h-8 w-full rounded-lg bg-[color:var(--rf-set-field)] py-1.5 pl-8 pr-8 text-[13px] text-stone-200 outline-none placeholder:text-stone-600 focus:ring-1 focus:ring-[color-mix(in_srgb,var(--accent),transparent_55%)]";

type SettingsHeaderProps = {
  measureRef: RefObject<HTMLDivElement | null>;
  titleInnerRef: RefObject<HTMLDivElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  titleBlockHeight: MotionValue<number>;
  titleBlockOpacity: MotionValue<number>;
  compact: boolean;
  searchExpanded: boolean;
  searchQuery: string;
  isSearching: boolean;
  navGroups: readonly SettingsNavGroup[];
  activeTab: SettingsTab;
  reduceMotion: boolean | null;
  onQueryChange: (query: string) => void;
  onToggleSearch: () => void;
  onSearchBlur: () => void;
  onSelectTab: (tab: SettingsTab) => void;
  onClose: () => void;
};

export function SettingsHeader({
  measureRef,
  titleInnerRef,
  searchInputRef,
  titleBlockHeight,
  titleBlockOpacity,
  compact,
  searchExpanded,
  searchQuery,
  isSearching,
  navGroups,
  activeTab,
  reduceMotion,
  onQueryChange,
  onToggleSearch,
  onSearchBlur,
  onSelectTab,
  onClose,
}: SettingsHeaderProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const rowWidth = useRowInnerWidth(rowRef);
  const fieldOpen = compact && (searchExpanded || isSearching);
  const groupsRef = useRef<HTMLDivElement>(null);
  const [freePx, setFreePx] = useState(180);
  // Cap the field at the free space left of the first tab so the icon tabs stay visible.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const groups = groupsRef.current;
    if (!compact || !row || !groups) return;
    const free = groups.getBoundingClientRect().left - row.getBoundingClientRect().left - 8;
    setFreePx(Math.max(ICON_BOX_PX + 40, Math.min(free, 288)));
  }, [compact, rowWidth, fieldOpen]);
  const expandedPx = freePx;
  const expandTransition = reduceMotion
    ? { duration: 0 }
    : { duration: EXPAND_MS, ease: EXPAND_EASE };

  const renderClear = (hidden: boolean, right: string) =>
    isSearching ? (
      <button
        type="button"
        onClick={() => onQueryChange("")}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 rounded-lg p-1 text-stone-500 hover:text-stone-200",
          right,
        )}
        aria-label="Clear search"
        tabIndex={hidden ? -1 : 0}
      >
        <X size={14} />
      </button>
    ) : null;

  return (
    <div ref={measureRef} className="relative shrink-0 px-5 pb-2.5 pt-2.5 sm:px-7">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-2.5 z-30 rounded-lg p-1.5 text-stone-500 transition-colors hover:text-stone-200 sm:right-7"
        aria-label="Close"
      >
        <X size={18} />
      </button>

      <motion.div
        style={{ height: titleBlockHeight, opacity: titleBlockOpacity }}
        className="overflow-hidden"
        aria-hidden={compact}
      >
        <div ref={titleInnerRef} className={cn("pb-3 pl-0.5", compact && "pointer-events-none")}>
        <div className="flex h-9 items-center gap-4 pr-10">
          <h2 id="rf-settings-dialog-title" className="rf-settings-page-title min-w-0 flex-1 leading-none text-[1.5rem]">
            Settings
          </h2>

          <label className="relative block w-64 shrink-0">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500"
              aria-hidden
            />
            <input
              ref={compact ? undefined : searchInputRef}
              type="text"
              role="searchbox"
              value={searchQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search settings"
              autoComplete="off"
              spellCheck={false}
              tabIndex={compact ? -1 : 0}
              className={SEARCH_INPUT_CLASS}
            />
            {renderClear(compact, "right-2")}
          </label>
        </div>
        </div>
      </motion.div>

      {/* Mounted in both states with identical side reserves, so only tab padding and labels change when compacting. */}
      <div
        ref={rowRef}
        className={cn("relative flex items-center transition-[padding] duration-200 motion-reduce:transition-none", compact ? "pr-10" : "pr-0")}
      >
        <div
          className={cn(
            "h-8 shrink-0 transition-[width,margin] duration-200 motion-reduce:transition-none",
            compact ? "mr-2 w-8" : "mr-0 w-0",
          )}
          aria-hidden
        />
        <motion.div
          className={cn(
            "absolute left-0 top-1/2 z-20 h-8 -translate-y-1/2 overflow-hidden rounded-lg",
            !compact && "pointer-events-none",
          )}
          initial={false}
          animate={{ width: fieldOpen ? expandedPx : ICON_BOX_PX }}
          transition={expandTransition}
          aria-hidden={!compact}
        >
          <button
            type="button"
            onClick={onToggleSearch}
            data-tooltip="Search settings"
            className={cn(
              "absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-lg transition-[color,opacity] duration-150",
              fieldOpen || !compact
                ? "pointer-events-none opacity-0"
                : cn("opacity-100", isSearching ? "text-[color:var(--accent)]" : "text-stone-500 hover:text-stone-200"),
            )}
            aria-label="Search settings"
            aria-pressed={fieldOpen}
            tabIndex={fieldOpen || !compact ? -1 : 0}
          >
            <Search size={16} />
          </button>

          <motion.label
            className={cn("absolute inset-y-0 left-0 block", !fieldOpen && "pointer-events-none")}
            style={{ width: expandedPx }}
            initial={false}
            animate={{ opacity: fieldOpen ? 1 : 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.16, delay: fieldOpen ? 0.06 : 0 }}
          >
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500"
              aria-hidden
            />
            <input
              ref={compact ? searchInputRef : undefined}
              type="text"
              role="searchbox"
              value={searchQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              onBlur={onSearchBlur}
              placeholder="Search settings"
              autoComplete="off"
              spellCheck={false}
              tabIndex={fieldOpen ? 0 : -1}
              className={SEARCH_INPUT_CLASS}
            />
            {renderClear(!fieldOpen, "right-2")}
          </motion.label>
        </motion.div>

        <nav
          className={cn(
            "flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden transition-opacity duration-150 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            isSearching && !compact && "pointer-events-none opacity-40",
          )}
          aria-label="Settings sections"
          aria-hidden={isSearching}
        >
          <div ref={groupsRef} className="mx-auto flex gap-x-1.5">
            {navGroups.map((group) => (
              <div
                key={group.label}
                role="group"
                aria-label={group.label}
                className="flex shrink-0 items-center gap-1 rounded-xl bg-[color:var(--rf-set-tabbar)] p-1"
              >
                {group.items.map((item) => {
                  const isActive = !isSearching && activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <span key={item.id} data-tooltip={compact ? item.label : undefined} className="inline-flex">
                      <button
                        type="button"
                        aria-label={item.label}
                        onClick={() => onSelectTab(item.id)}
                        className={cn(
                          "relative grid items-center rounded-lg transition-[color,padding,grid-template-columns] duration-200 ease-out motion-reduce:transition-none",
                          compact ? "grid-cols-[auto_0fr] px-2 py-1.5" : "grid-cols-[auto_1fr] px-2.5 py-2",
                          isActive ? "text-stone-100" : "text-stone-500 hover:text-stone-200",
                        )}
                      >
                        {isActive ? (
                          <motion.span
                            layoutId="settingsTopNavActive"
                            className="absolute inset-0 rounded-lg bg-[color:var(--rf-set-tab-active)]"
                            transition={reduceMotion ? { duration: 0 } : MORPH_SPRING}
                          />
                        ) : null}
                        <Icon
                          size={14}
                          className={cn("relative z-10 shrink-0", isActive ? "text-[color:var(--accent)]" : "text-current")}
                          aria-hidden
                        />
                        <span className="relative z-10 min-w-0 overflow-hidden">
                          <span
                            className={cn(
                              "block whitespace-nowrap pl-2 text-[12px] font-medium transition-opacity duration-150 motion-reduce:transition-none",
                              compact && "opacity-0",
                            )}
                          >
                            {item.label}
                          </span>
                        </span>
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
