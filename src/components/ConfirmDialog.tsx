import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Trash2 } from "lucide-react";

export type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  itemPreview?: string | null; // Optional path/URL to a thumbnail
  itemMeta?: string;    // Optional specs text (e.g. "1.2 GB • 10:24")
};

type PendingConfirm = ConfirmDialogOptions & {
  resolve: (approved: boolean) => void;
};

let setPendingHost: ((pending: PendingConfirm | null) => void) | null = null;

/** Promise resolves `true` on confirm, `false` on cancel or if host is not mounted. */
export function askConfirm(options: ConfirmDialogOptions): Promise<boolean> {
  const host = setPendingHost;
  if (!host) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    host({ ...options, resolve });
  });
}

function ConfirmDialogView({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingConfirm;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmLabel = pending.confirmLabel ?? "Confirm";
  const cancelLabel = pending.cancelLabel ?? "Cancel";

  return (
    <div className="fixed inset-0 z-[300] pointer-events-none flex items-end justify-end p-10">
      <motion.div
        initial={{ opacity: 0, x: 100, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 100, scale: 0.9 }}
        transition={{ type: "spring", duration: 0.6, bounce: 0.2 }}
        className="rf-confirm-panel bg-[#1D1613]/95 backdrop-blur-xl border border-white/10 rounded-[32px] overflow-hidden w-[340px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] pointer-events-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rf-confirm-title"
        aria-describedby="rf-confirm-message"
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        {/* Toast-Style Header - Slightly shorter aspect */}
        {pending.itemPreview && (
          <div className="relative aspect-video w-full bg-[#110D0B] overflow-hidden">
            <img 
              src={convertFileSrc(pending.itemPreview)} 
              alt="" 
              className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110"
            />
            <img 
              src={convertFileSrc(pending.itemPreview)} 
              alt="" 
              className="relative w-full h-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1D1613] via-transparent to-transparent" />
          </div>
        )}

        <div className="relative">
          {/* Red dotted border for the action area - higher visibility */}
          <div className="absolute inset-0 border-2 border-dotted border-red-500/80 rounded-b-[32px] border-t-0 pointer-events-none" />

          <div className="p-8 pt-4 relative">
            <div className="space-y-1.5 mb-8">
              <h2 id="rf-confirm-title" className="text-stone-100 text-lg font-bold tracking-tight">
                {pending.title}
              </h2>
              <p id="rf-confirm-message" className="text-stone-500 text-[12px] leading-relaxed">
                {pending.message}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <button 
                type="button" 
                className="text-[10px] font-black uppercase tracking-widest text-stone-600 hover:text-stone-200 transition-colors cursor-pointer" 
                onClick={onCancel}
              >
                {cancelLabel}
              </button>
              <button 
                type="button" 
                className="text-[10px] font-black uppercase tracking-widest text-stone-600 hover:text-red-400 transition-colors cursor-pointer flex items-center gap-2 group" 
                onClick={onConfirm}
              >
                <Trash2 size={14} className="group-hover:scale-110 transition-transform" />
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>

      </motion.div>
    </div>
  );
}

/** Mount once near the app root (e.g. `App.tsx`). */
export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    setPendingHost = setPending;
    return () => {
      setPendingHost = null;
    };
  }, []);

  const settle = useCallback((approved: boolean) => {
    setPending((current) => {
      if (current) current.resolve(approved);
      return null;
    });
  }, []);

  const onConfirm = useCallback(() => settle(true), [settle]);
  const onCancel = useCallback(() => settle(false), [settle]);

  return (
    <AnimatePresence>
      {pending && (
        <ConfirmDialogView 
          key="confirm-dialog"
          pending={pending} 
          onConfirm={onConfirm} 
          onCancel={onCancel} 
        />
      )}
    </AnimatePresence>
  );
}
