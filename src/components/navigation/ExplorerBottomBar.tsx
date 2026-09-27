import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, Link2, Loader2, RefreshCw, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { readSystemClipboardText } from "@/downloaderClipboardYoutube";
import { explorerPageLabel, resolveExplorerPasteUrl } from "./explorerPageLabel";

type Props = {
  url: string;
  onNavigate: (url: string) => void;
  onReload: () => void;
};

const BTN =
  "flex h-8 shrink-0 select-none items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-stone-400 transition-colors hover:bg-white/[0.06] hover:text-stone-50";

/** Video-mode twin of the Music Explore bar: page label, paste a link, reload, copy URL. */
export function ExplorerBottomBar({ url, onNavigate, onReload }: Props) {
  const [pasteMode, setPasteMode] = useState(false);
  const [checking, setChecking] = useState(false);
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  useEffect(() => {
    if (!pasteMode) return;
    setValue("");
    setChecking(true);
    let cancelled = false;
    void readSystemClipboardText().then((text) => {
      if (cancelled) return;
      const resolved = resolveExplorerPasteUrl(text);
      if (resolved) {
        navigateRef.current(resolved);
        setPasteMode(false);
        return;
      }
      setChecking(false);
      inputRef.current?.focus();
    });
    return () => {
      cancelled = true;
    };
  }, [pasteMode]);

  const submit = () => {
    const resolved = resolveExplorerPasteUrl(value);
    if (!resolved) return;
    onNavigate(resolved);
    setPasteMode(false);
  };

  const copyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="flex w-full shrink-0 flex-col bg-[#271C18]">
      {!pasteMode && (
        <span className="truncate px-4 pt-1.5 text-[10px] font-medium text-[color:var(--accent)]">
          {explorerPageLabel(url)}
        </span>
      )}
      <div className="flex h-10 min-w-0 items-center gap-0.5 px-2">
        <AnimatePresence mode="wait" initial={false}>
          {pasteMode ? (
            <motion.form
              key="paste"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex min-w-0 flex-1 items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <button type="button" onClick={() => setPasteMode(false)} className={BTN}>
                <X size={14} />
                <span>Cancel</span>
              </button>
              <div className="relative flex min-w-0 flex-1 items-center rounded-lg border border-white/10 bg-white/[0.07]">
                {checking ? (
                  <Loader2 size={13} className="absolute left-2.5 animate-spin text-[color:var(--accent)]" />
                ) : (
                  <Link2 size={13} className="absolute left-2.5 text-[color:var(--accent)]" />
                )}
                <input
                  ref={inputRef}
                  type="url"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="youtube.com or youtu.be link"
                  className="w-full truncate bg-transparent py-1.5 pl-8 pr-2 text-xs text-stone-100 outline-none placeholder:text-stone-500"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button
                type="submit"
                disabled={!resolveExplorerPasteUrl(value)}
                className={cn(BTN, "text-[color:var(--accent)] disabled:cursor-default disabled:opacity-40")}
                data-tooltip="Open link"
              >
                <ArrowRight size={15} />
              </button>
            </motion.form>
          ) : (
            <motion.div
              key="buttons"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex min-w-0 flex-1 items-center gap-0.5"
            >
              <button type="button" onClick={() => setPasteMode(true)} className={BTN} data-tooltip="Open a YouTube link">
                <Link2 size={15} />
                <span>Paste link</span>
              </button>
              <button type="button" onClick={onReload} className={BTN} data-tooltip="Reload page">
                <RefreshCw size={15} />
                <span>Reload</span>
              </button>
              {url && (
                <button
                  type="button"
                  onClick={() => void copyUrl()}
                  className={cn(BTN, "ml-auto")}
                  data-tooltip={copied ? "Copied" : "Copy page URL"}
                >
                  {copied ? <Check size={15} className="text-[color:var(--accent)]" /> : <Copy size={15} />}
                  <span>{copied ? "Copied" : "Copy URL"}</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
