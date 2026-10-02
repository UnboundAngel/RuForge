import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Clipboard, Paperclip, X } from "lucide-react";

const ICON_SWAP = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "");
}

/** Clip-path reveal so the capsule opens without animating width. */
function RevealChip({
  open,
  warning = false,
  children,
}: {
  open: boolean;
  warning?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex h-9 w-max max-w-full items-center rounded-full transition-[clip-path] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        warning ? "bg-[#3A2E14] text-amber-300" : "bg-[#271C18] text-stone-300"
      } ${open ? "[clip-path:inset(0_0_0_0_round_18px)]" : "[clip-path:inset(0_calc(100%-36px)_0_0_round_18px)]"}`}
    >
      {children}
    </div>
  );
}

function SwapIcon({ done, idle }: { done: boolean; idle: ReactNode }) {
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center text-[color:var(--accent)]">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={done ? "done" : "idle"}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={ICON_SWAP}
          className="absolute inset-0 flex items-center justify-center"
        >
          {done ? <Check size={14} strokeWidth={2.5} /> : idle}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const URL_TEXT =
  "min-w-0 truncate px-1 text-left text-[11px] font-semibold text-stone-300 transition-colors hover:text-white";
const CLEAR_BUTTON =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-500 transition-[color,transform] hover:text-stone-100 active:scale-[0.94]";

export function DownloaderUrlChip({
  url,
  copied,
  pasted = false,
  onPasteFromClipboard,
  onCopy,
  onClear,
  audioWarning = false,
}: {
  url: string;
  copied: boolean;
  pasted?: boolean;
  onPasteFromClipboard: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
  onClear: () => void;
  audioWarning?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  if (audioWarning) {
    return (
      <div className="pointer-events-auto w-full">
        <RevealChip open warning>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <AlertTriangle size={13} strokeWidth={2.5} />
          </span>
          <span className="whitespace-nowrap pr-4 text-[9px] font-black uppercase tracking-[0.2em]">
            Slower download · smaller file
          </span>
        </RevealChip>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <RevealChip open={hovered}>
        <button
          type="button"
          onClick={() => void onPasteFromClipboard()}
          aria-label="Paste link from clipboard"
          data-tooltip="Paste link"
          className="shrink-0 rounded-full transition-transform active:scale-[0.94]"
        >
          <SwapIcon done={pasted} idle={<Paperclip size={14} strokeWidth={2} />} />
        </button>
        <button type="button" onClick={() => void onCopy()} aria-label="Copy link" data-tooltip="Copy link" className={URL_TEXT}>
          {copied ? "Copied" : shortUrl(url)}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label="Clear link"
          data-tooltip="Clear link"
          className={CLEAR_BUTTON}
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </RevealChip>
    </div>
  );
}

export function QuickEnqueuePinnedChip({
  url,
  onRemove,
  copyUrl,
}: {
  url: string;
  onRemove: () => void;
  copyUrl: (u: string) => Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    await copyUrl(url);
    setCopied(true);
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => {
      setCopied(false);
      copyResetRef.current = null;
    }, 2000);
  };

  return (
    <div
      className="pointer-events-auto w-full self-start"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <RevealChip open={hovered}>
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label="Copy link"
          data-tooltip="Click to copy"
          className="flex min-w-0 items-center"
        >
          <SwapIcon done={copied} idle={<Paperclip size={14} strokeWidth={2} />} />
          <span className={URL_TEXT}>{shortUrl(url)}</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove from list"
          data-tooltip="Remove"
          className={CLEAR_BUTTON}
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </RevealChip>
    </div>
  );
}

export function QuickEnqueueButton({
  disabled,
  disabledReason,
  onClick,
  alwaysOpen = false,
  className = "",
}: {
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
  alwaysOpen?: boolean;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      data-tooltip={disabled ? disabledReason : undefined}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Queue another from clipboard"
      className={`pointer-events-auto rounded-full transition-[opacity,transform] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      <RevealChip open={!disabled && (alwaysOpen || hovered)}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[color:var(--accent)]">
          <Clipboard size={14} strokeWidth={2} />
        </span>
        <span className="whitespace-nowrap pr-4 text-[9px] font-black uppercase tracking-[0.25em] text-stone-300">
          Queue another
        </span>
      </RevealChip>
    </button>
  );
}
