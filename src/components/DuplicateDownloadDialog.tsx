import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle } from "lucide-react";
import type { DuplicateMatch } from "../duplicateDownload";

export type DuplicateDownloadChoice = "cancel" | "replace" | "create_new";

type Props = {
  open: boolean;
  videoTitle?: string | null;
  match: DuplicateMatch;
  onChoose: (choice: DuplicateDownloadChoice) => void;
};

export function DuplicateDownloadDialog({
  open,
  videoTitle,
  match: _match,
  onChoose,
}: Props) {
  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-download-title"
        >
          <motion.button
            type="button"
            aria-label="Cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onChoose("cancel")}
            className="absolute inset-0 bg-[#12100e]/85 backdrop-blur-xl"
          />

          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            className="relative w-full max-w-sm overflow-hidden rounded-[24px] border border-white/5 bg-[#271C18] p-8 shadow-[0_40px_80px_rgba(0,0,0,0.7)]"
          >
            {/* Glossy top edge highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="flex items-start gap-5">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[color:var(--accent)]"
              >
                <AlertCircle size={22} strokeWidth={2.5} aria-hidden />
              </motion.div>

              <div className="min-w-0 flex-1">
                <div className="space-y-1">
                  <h2
                    id="duplicate-download-title"
                    className="text-[10px] font-black uppercase tracking-[0.4em] text-[#EDD79C] opacity-60"
                  >
                    Replace download?
                  </h2>
                  <div className="h-px w-full bg-gradient-to-r from-[color:var(--accent)]/30 to-transparent" />
                </div>
                
                <p className="mt-5 text-[15px] font-bold leading-tight text-white line-clamp-2">
                  {videoTitle || "This video"}
                </p>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => onChoose("replace")}
                className="w-full rounded-full bg-[color:var(--accent)] py-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#1D1613] transition-all hover:brightness-110 active:scale-[0.98] shadow-lg"
              >
                Replace
              </button>
              
              <div className="flex items-center justify-center gap-6 pt-1">
                <button
                  type="button"
                  onClick={() => onChoose("create_new")}
                  className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-500 transition-all hover:text-stone-300"
                >
                  Create new
                </button>
                
                <div className="w-px h-2 bg-white/5" />

                <button
                  type="button"
                  onClick={() => onChoose("cancel")}
                  className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-600 transition-all hover:text-stone-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
