import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { closeFindBar, openFindBar, runFind, useFindBar, type FindResult } from "@/lib/findInPage";
import { cn } from "@/lib/utils";

/** Kept across opens, so Ctrl+F brings back the last search selected, like a browser. */
let lastTerm = "";

/** Ctrl+F anywhere in the main window that has not claimed it for itself. Main window only. */
export function FindBarHost() {
  const open = useFindBar((s) => s.open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.shiftKey || !(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      openFindBar("app");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // On <body> so it stacks above the glance viewer, which also portals there.
  return createPortal(<AnimatePresence>{open ? <FindBar key="find" /> : null}</AnimatePresence>, document.body);
}

function FindBar() {
  const { target, anchor, seq } = useFindBar();
  const reduce = useReducedMotion() ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState(lastTerm);
  const [result, setResult] = useState<FindResult | null>(null);
  const run = useRef(0);

  const find = (step: number) => {
    const mine = ++run.current;
    void runFind(target, term, step).then((r) => {
      if (mine === run.current) setResult(r);
    });
  };

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [seq]);

  useEffect(() => {
    lastTerm = term;
    if (!term) {
      setResult(null);
      void runFind(target, "", 0);
      return;
    }
    const t = window.setTimeout(() => find(0), 90);
    return () => window.clearTimeout(t);
    // `find` closes over the latest term; rerun only when the term or target changes.
  }, [term, target]);

  const readout = !term || !result ? null : result.count === 0 ? "No results" : `${result.index}/${result.count}`;
  const stepButtons = [
    { step: -1, Icon: ChevronUp, tip: "Previous", keys: "Shift+Enter" },
    { step: 1, Icon: ChevronDown, tip: "Next", keys: "Enter" },
  ];

  return (
    <motion.div
      data-glance-punch
      data-rf-find-ignore
      role="search"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: reduce ? 0 : 0.12, ease: [0.16, 1, 0.3, 1] }}
      className="group fixed z-[9990] flex h-10 max-w-[calc(100vw-32px)] items-center gap-1 rounded-[10px] bg-[color:var(--rf-popover-bg)] pl-3 pr-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
      style={
        anchor
          ? { top: anchor.top, right: anchor.right }
          : { top: "calc(var(--rf-titlebar-h) + 8px)", right: 16 }
      }
    >
      <Search
        size={14}
        strokeWidth={2.5}
        className="shrink-0 text-stone-500 transition-colors duration-150 group-focus-within:text-[color:var(--accent)]"
      />
      <input
        ref={inputRef}
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            closeFindBar();
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (term) find(e.shiftKey ? -1 : 1);
          }
        }}
        placeholder="Find"
        spellCheck={false}
        autoComplete="off"
        aria-label="Find on page"
        className="h-full min-w-[56px] max-w-[260px] bg-transparent pl-1.5 pr-1 text-[13px] [field-sizing:content] font-semibold text-stone-100 outline-none placeholder:font-medium placeholder:text-stone-500"
      />
      {readout ? (
        <span
          className={cn(
            "shrink-0 px-1 text-[11.5px] font-semibold tabular-nums",
            result?.count ? "text-stone-400" : "text-[#ff9a8f]",
          )}
        >
          {readout}
        </span>
      ) : null}
      {stepButtons.map(({ step, Icon, tip, keys }) => (
        <button
          key={tip}
          type="button"
          tabIndex={-1}
          disabled={!result?.count}
          onClick={() => find(step)}
          data-tooltip={tip}
          data-tooltip-shortcut={keys}
          aria-label={tip}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-stone-400 transition-colors duration-150 hover:bg-white/[0.07] hover:text-stone-100 disabled:pointer-events-none disabled:opacity-35"
        >
          <Icon size={15} strokeWidth={2.25} />
        </button>
      ))}
      <button
        type="button"
        tabIndex={-1}
        onClick={closeFindBar}
        data-tooltip="Close"
        data-tooltip-shortcut="Esc"
        aria-label="Close find"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-stone-400 transition-colors duration-150 hover:bg-white/[0.07] hover:text-stone-100"
      >
        <X size={15} strokeWidth={2.25} />
      </button>
    </motion.div>
  );
}
