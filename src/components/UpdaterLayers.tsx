import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Loader2, AlertTriangle, ExternalLink, X } from "lucide-react";
import Markdown from "markdown-to-jsx";

/** Shared styles for updater JSON / Tauri `notes` strings (headings, lists, links, code). */
const UPDATER_NOTES_MARKDOWN_OPTIONS = {
  overrides: {
    h1: { props: { className: "mb-1.5 mt-0 text-[12px] font-bold leading-snug text-stone-200" } },
    h2: { props: { className: "mb-1.5 mt-2 text-[11px] font-bold leading-snug text-stone-200 first:mt-0" } },
    h3: { props: { className: "mb-1 mt-2 text-[10px] font-bold leading-snug text-stone-200 first:mt-0" } },
    h4: { props: { className: "mb-1 mt-2 text-[10px] font-semibold leading-snug text-stone-300 first:mt-0" } },
    p: { props: { className: "mb-1.5 last:mb-0 leading-relaxed" } },
    ul: { props: { className: "mb-1.5 list-disc space-y-0.5 pl-4 last:mb-0" } },
    ol: { props: { className: "mb-1.5 list-decimal space-y-0.5 pl-4 last:mb-0" } },
    li: { props: { className: "leading-relaxed" } },
    a: {
      props: {
        className: "text-[color:var(--accent)] underline underline-offset-2",
        target: "_blank",
        rel: "noopener noreferrer",
      },
    },
    strong: { props: { className: "font-semibold text-stone-200" } },
    em: { props: { className: "italic text-stone-300" } },
    code: { props: { className: "rounded bg-white/10 px-1 py-px font-mono text-[0.95em] text-stone-200" } },
    pre: { props: { className: "mb-2 overflow-x-auto rounded-lg border border-white/10 bg-black/25 p-2 text-[9px] leading-relaxed" } },
    blockquote: { props: { className: "mb-2 border-l-2 border-[color:var(--accent)]/40 pl-2.5 text-stone-400 italic" } },
    hr: { props: { className: "my-2 border-0 border-t border-white/10" } },
  },
} as const;

export function UpdaterReleaseNotesMarkdown({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <Markdown className={className} options={UPDATER_NOTES_MARKDOWN_OPTIONS}>
      {markdown}
    </Markdown>
  );
}

export type UpdaterPhase = "idle" | "available" | "downloading" | "installing" | "failed";

const RELEASES_PAGE = "https://github.com/UnboundAngel/RuForge/releases";
const CHANGELOG_PAGE = "https://ruforge.app/changelog";

type SidebarBadgeProps = {
  phase: UpdaterPhase;
  version: string | null;
  onClick?: () => void;
};

/** Top-right status pill for the window controls area. */
export function UpdaterStatusIndicator({ phase }: SidebarBadgeProps) {
  if (phase === "downloading") {
    return (
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-[color:var(--accent)] transition-all hover:bg-white/10"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        <span>Downloading Update</span>
      </motion.div>
    );
  }
  return null;
}

type MainOverlaysProps = {
  phase: UpdaterPhase;
  version: string | null;
  notes: string;
  onInstallRestart: () => void;
  onDismiss?: () => void;
  dismissed?: boolean;
};

/** “Update available” card only (main pane). Download/install uses {@link UpdaterFullWindowUpdate} at app root. */
export function UpdaterMainOverlays({
  phase,
  version,
  notes,
  onInstallRestart,
  onDismiss,
  dismissed,
}: MainOverlaysProps) {
  return (
    <AnimatePresence>
      {phase === "available" && version && !dismissed && (
        <motion.div 
          initial={{ opacity: 0, x: 20, y: 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
          className="pointer-events-auto absolute top-6 right-6 z-[60] w-[min(calc(100vw-3rem),19rem)] rounded-[20px] border border-white/10 bg-[#271C18]/95 p-4 shadow-[0_20px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-3 right-3 p-1 text-stone-500 hover:text-stone-200 transition-colors"
            aria-label="Dismiss update teaser"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[12px] font-black tracking-tight text-stone-100 uppercase tracking-widest pr-6">RuForge is ready to update</p>
              <div className="mt-1.5 line-clamp-3 text-[10px] leading-relaxed text-stone-500 [&_a]:pointer-events-none">
                {notes.trim() ? (
                  <UpdaterReleaseNotesMarkdown markdown={notes.trim()} />
                ) : (
                  `Version ${version} is available. Install & restart downloads the update, runs setup, and relaunches RuForge.`
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <motion.button
                whileHover={{ scale: 1.02, filter: "brightness(1.08)" }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={onInstallRestart}
                className="rounded-lg bg-[color:var(--accent)] px-3.5 py-1.5 text-center text-[10px] font-black uppercase tracking-widest text-[#1D1613] transition"
              >
                Install &amp; Restart
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type FullWindowUpdateProps = {
  phase: UpdaterPhase;
  downloaded: number;
  contentLength?: number;
  errorMessage?: string | null;
  onRetry?: () => void;
  onDismissFailed?: () => void;
};

/**
 * Replaces the entire app window while an update downloads or installs (not a tab or main-pane overlay).
 */
export function UpdaterFullWindowUpdate({
  phase,
  downloaded,
  contentLength,
  errorMessage,
  onRetry,
  onDismissFailed,
}: FullWindowUpdateProps) {
  if (phase !== "downloading" && phase !== "installing" && phase !== "failed") return null;

  const hasTotal = typeof contentLength === "number" && contentLength > 0;
  const pct = hasTotal ? Math.min(100, Math.round((downloaded / contentLength) * 100)) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[600] flex flex-col items-center justify-center bg-[#1D1613]"
      aria-live="polite"
      aria-modal="true"
      role="alertdialog"
      aria-busy="true"
      aria-labelledby="ruforge-update-screen-title"
    >
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-[color:var(--accent)]/5 blur-[120px]" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-[color:var(--accent)]/5 blur-[120px]" />
      </div>

      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-lg flex-col items-center px-12"
      >
        <AnimatePresence mode="wait">
          {phase === "failed" ? (
            <motion.div
              key="failed"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 shadow-inner backdrop-blur-md">
                <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden />
              </div>

              <h1 id="ruforge-update-screen-title" className="text-center text-2xl font-black tracking-tight text-stone-100 uppercase">
                Update failed
              </h1>

              <p className="mt-4 max-w-sm text-center text-[13px] leading-relaxed font-medium text-stone-500">
                {errorMessage?.trim()
                  || "RuForge could not finish installing the update. Try again or install manually from GitHub Releases."}
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {onRetry ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={onRetry}
                    className="rounded-lg bg-[color:var(--accent)] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#1D1613]"
                  >
                    Try again
                  </motion.button>
                ) : null}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => void openUrl(RELEASES_PAGE)}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-stone-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  GitHub Releases
                </motion.button>
                {onDismissFailed ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={onDismissFailed}
                    className="rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500"
                  >
                    Dismiss
                  </motion.button>
                ) : null}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={phase}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 shadow-inner backdrop-blur-md">
                {phase === "installing" ? (
                  <Icon icon="line-md:folder-check-twotone" className="h-8 w-8 text-[color:var(--accent)]" />
                ) : (
                  <Icon icon="line-md:downloading-loop" className="h-8 w-8 text-[color:var(--accent)]" />
                )}
              </div>

              <h1 id="ruforge-update-screen-title" className="text-center text-2xl font-black tracking-tight text-stone-100 uppercase">
                {phase === "installing" ? "Applying update" : "Downloading update"}
              </h1>

              <p className="mt-4 max-w-xs text-center text-[13px] leading-relaxed font-medium text-stone-500">
                {phase === "installing"
                  ? "Finalizing the latest version of RuForge. The app will restart automatically in a moment."
                  : "A new version of RuForge is being prepared. The app will be unavailable until the download completes."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-12 w-full">
          <AnimatePresence mode="wait">
            {phase === "downloading" && hasTotal ? (
              <motion.div
                key="pct-display"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center"
              >
                <div className="relative mb-6">
                  <motion.p 
                    key={pct}
                    initial={{ scale: 0.95, opacity: 0.8 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-6xl font-black tabular-nums tracking-tighter text-stone-100"
                  >
                    {pct}<span className="text-2xl text-[color:var(--accent)] ml-1">%</span>
                  </motion.p>
                </div>
                
                {/* Unique Progress Bar */}
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/5 border border-white/5 shadow-inner">
                  {/* Animated Background Shimmer for the track */}
                  <motion.div 
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"
                  />
                  
                  {/* Progress Fill */}
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--accent)]"
                    style={{ 
                      boxShadow: `0 0 20px color-mix(in srgb, var(--accent), transparent 60%)`
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
                  >
                    {/* High-performance CSS-only Light Bead */}
                    <motion.div 
                      animate={{ 
                        backgroundPosition: ["200% 0", "-200% 0"] 
                      }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: 1.2, 
                        ease: "linear" 
                      }}
                      className="absolute inset-0 bg-[length:200%_100%] bg-no-repeat"
                      style={{
                        backgroundImage: `radial-gradient(circle at center, rgba(255,255,255,0.8) 0%, transparent 40%)`,
                        mixBlendMode: 'overlay',
                      }}
                    />
                    
                    {/* Glowing Tip */}
                    <div className="absolute right-0 top-0 bottom-0 w-2 bg-white blur-[2px] rounded-full" />
                  </motion.div>
                </div>

                <div className="mt-4 flex w-full justify-between px-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-600">Progress</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-500 tabular-nums">
                    {(downloaded / 1024 / 1024).toFixed(1)}MB / {(contentLength! / 1024 / 1024).toFixed(1)}MB
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="loading-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center"
              >
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5 border border-white/5">
                  <motion.div
                    animate={{ 
                      x: ["-100%", "300%"],
                    }}
                    transition={{ 
                      repeat: Infinity, 
                      duration: 1.5, 
                      ease: "easeInOut" 
                    }}
                    className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-[color:var(--accent)] to-transparent"
                  />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-stone-600" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-600">
                    {phase === "installing" ? "Finalizing installation" : "Preparing download"}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Footer Branding */}
      <div className="absolute bottom-12 left-0 right-0 flex justify-center opacity-20">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-400">RuForge System Update</p>
      </div>
    </motion.div>
  );
}

export { RELEASES_PAGE, CHANGELOG_PAGE };
