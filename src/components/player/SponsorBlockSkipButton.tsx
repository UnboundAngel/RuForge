import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";

type SkipButtonProps = {
  showControls: boolean;
  onClick: () => void;
  label: string;
  activeCategory: string | null;
};

export const SponsorBlockSkipButton: React.FC<SkipButtonProps> = ({
  showControls,
  onClick,
  label,
  activeCategory,
}) => {
  const [progress, setProgress] = useState(0);
  const [isAutoHidden, setIsAutoHidden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (showControls) {
      // Pinned open when controls are visible (mouse moving)
      setIsAutoHidden(false);
      setProgress(0);
      if (timerRef.current) clearInterval(timerRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    } else {
      // Start auto-hide progress and timer when controls are hidden
      setProgress(0);
      setIsAutoHidden(false);
      
      const startTime = Date.now();
      const duration = 4000; // 4 seconds fill (Netflix skip intro style)

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const currentProgress = Math.min(1, elapsed / duration);
        setProgress(currentProgress);

        if (currentProgress >= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          // Wait 1 second and then auto-hide
          if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = setTimeout(() => {
            setIsAutoHidden(true);
          }, 1000);
        }
      }, 16); // ~60fps
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [showControls, activeCategory]);

  if (isAutoHidden) {
    return null;
  }

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className="rf-sb-skip-btn absolute z-[56] pointer-events-auto right-6 sm:right-8 rounded-xl bg-[#271C18]/95 border border-white/10 text-[11px] font-black tracking-widest text-white uppercase shadow-lg active:scale-95 overflow-hidden select-none hover:bg-[#2A1E1A]"
    >
      {/* Background Fill Overlay (only when controls are hidden) */}
      {!showControls && (
        <div
          className="absolute inset-y-0 left-0 bg-white/15 pointer-events-none"
          style={{
            width: `${progress * 100}%`,
          }}
        />
      )}

      {/* Button Content */}
      <div className="px-4 py-2.5 relative z-10 flex items-center justify-center">
        {label}
      </div>
    </motion.button>
  );
};
