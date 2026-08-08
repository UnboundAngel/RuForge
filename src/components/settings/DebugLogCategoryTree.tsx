import React, { useCallback, useMemo, useState } from "react";
import { Check, ChevronRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useRuforgeStore } from "../../store/ruforgeStore";
import {
  allDebugCategoryIds,
  collectDescendantCategoryIds,
  DEBUG_CATEGORY_TREE,
  findDebugCategoryNode,
  parentCheckboxState,
  type DebugCategoryNode,
} from "../../debug/debugCategories";
import { DebugLogSideIcon } from "../../debug/DebugLogSideIcon";
import { invoke } from "@tauri-apps/api/core";

function syncRustCategories(enabled: string[]) {
  void invoke("sync_debug_log_categories", { enabled }).catch(() => {});
}

type RowProps = {
  node: DebugCategoryNode;
  depth: number;
  enabled: Set<string>;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleCategory: (id: string, next: boolean) => void;
};

function CategoryCheckbox({
  state,
  onChange,
  label,
}: {
  state: "checked" | "unchecked" | "indeterminate";
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const checked = state === "checked";
  const indeterminate = state === "indeterminate";

  return (
    <label
      className="relative inline-flex shrink-0 cursor-pointer"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate;
        }}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors",
          checked
            ? "border-[color-mix(in_srgb,var(--accent),transparent_40%)] bg-[color:var(--accent)]"
            : indeterminate
              ? "border-stone-600 bg-stone-800"
              : "border-stone-700 bg-[#120e0c]",
        )}
      >
        {checked ? <Check size={10} strokeWidth={3} className="text-[#1a1410]" /> : null}
        {indeterminate && !checked ? (
          <Minus size={10} strokeWidth={3} className="text-stone-400" />
        ) : null}
      </span>
    </label>
  );
}

function CategoryRow({
  node,
  depth,
  enabled,
  expanded,
  onToggleExpand,
  onToggleCategory,
}: RowProps) {
  const hasChildren = Boolean(node.children?.length);
  const isOpen = expanded.has(node.id);
  const checkState = parentCheckboxState(enabled, node);

  const handleCheck = (checked: boolean) => {
    onToggleCategory(node.id, checked);
  };

  return (
    <>
      <div
        className="group flex items-center gap-2 py-1.5 pr-2 min-h-[32px]"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={isOpen}
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={() => onToggleExpand(node.id)}
            className="p-0.5 text-stone-500 hover:text-stone-300 transition-colors"
          >
            <ChevronRight
              size={14}
              className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" aria-hidden />
        )}
        <CategoryCheckbox
          state={checkState}
          onChange={handleCheck}
          label={`${node.label} logging`}
        />
        <DebugLogSideIcon side={node.side} />
        <span className="text-[12px] text-stone-300 group-hover:text-stone-100 transition-colors truncate">
          {node.label}
        </span>
        <span className="text-[9px] font-mono text-stone-600 truncate hidden sm:inline">
          {node.id}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {hasChildren && isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            {node.children!.map((child) => (
              <CategoryRow
                key={child.id}
                node={child}
                depth={depth + 1}
                enabled={enabled}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                onToggleCategory={onToggleCategory}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

const DEBUG_LOG_EXPANDED_KEY = "ruforge-debug-log-expanded";

function readExpandedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DEBUG_LOG_EXPANDED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeExpandedIds(ids: Set<string>) {
  try {
    localStorage.setItem(DEBUG_LOG_EXPANDED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

export const DebugLogCategoryTree: React.FC = () => {
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const enabled = useMemo(
    () => new Set(settings.debugLogEnabledCategories),
    [settings.debugLogEnabledCategories],
  );
  const [expanded, setExpanded] = useState<Set<string>>(readExpandedIds);

  const applyEnabled = useCallback(
    (next: string[]) => {
      void updateSetting("debugLogEnabledCategories", next);
      syncRustCategories(next);
    },
    [updateSetting],
  );

  const onToggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      writeExpandedIds(n);
      return n;
    });
  }, []);

  const onToggleCategory = useCallback(
    (id: string, checked: boolean) => {
      const node = findDebugCategoryNode(id);
      const descendants = collectDescendantCategoryIds(id);
      const next = new Set(settings.debugLogEnabledCategories);
      if (checked) {
        next.add(id);
        for (const d of descendants) next.add(d);
      } else {
        next.delete(id);
        for (const d of descendants) next.delete(d);
        if (node?.children?.length) {
          for (const child of node.children) {
            next.delete(child.id);
          }
        }
      }
      applyEnabled([...next]);
    },
    [applyEnabled, settings.debugLogEnabledCategories],
  );

  const anyOn = settings.debugLogEnabledCategories.length > 0;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-stone-500 leading-relaxed max-w-lg">
        Per-feature debug output for the terminal (Rust) and DevTools (frontend). All categories
        off by default. Enable only what you are working on. Parent rows toggle every child.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => applyEnabled([])}
          className="px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest text-stone-500 border border-white/10 hover:text-stone-300 transition-colors"
        >
          CLEAR ALL
        </button>
        <button
          type="button"
          onClick={() => applyEnabled(allDebugCategoryIds())}
          className="px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest text-stone-500 border border-white/10 hover:text-stone-300 transition-colors"
        >
          ENABLE ALL
        </button>
      </div>
      <div
        className="rounded-xl border border-white/[0.04] bg-[#1a1411]/40 py-1"
        role="tree"
        aria-label="Debug log categories"
      >
        {DEBUG_CATEGORY_TREE.map((node) => (
          <CategoryRow
            key={node.id}
            node={node}
            depth={0}
            enabled={enabled}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onToggleCategory={onToggleCategory}
          />
        ))}
      </div>
      <p className="text-[10px] text-stone-600">
        {anyOn
          ? `${settings.debugLogEnabledCategories.length} category id(s) enabled`
          : "No categories enabled (only warnings/errors from unmapped crates)"}
      </p>
    </div>
  );
};
