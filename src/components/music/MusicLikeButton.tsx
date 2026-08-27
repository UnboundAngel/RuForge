import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import type { MediaFile } from "@/types";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { cn } from "@/lib/utils";
import { primaryArtist } from "./musicArtist";
import { musicTrackIdentityKey } from "./musicShelfDedup";

const ACCENT = "#ff0033";

const PARTICLES = [0, 1, 2, 3, 4].map((i) => {
  const angle = (i / 5) * Math.PI * 2;
  const radius = 18 + (i % 3) * 3;
  const scale = 0.85 + (i % 2) * 0.2;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.75,
    scale,
    delay: i * 0.04,
    duration: 0.62 + (i % 2) * 0.08,
  };
});

type Props = {
  file: MediaFile;
  className?: string;
  /** Match sibling controls (now playing transport uses 17, row menus use 15). */
  size?: number;
};

export function MusicLikeButton({ file, className, size = 17 }: Props) {
  const identityKey = useMemo(
    () => musicTrackIdentityKey(file, primaryArtist),
    [file],
  );
  const liked = useRuforgeStore((s) => s.musicLikedKeys.includes(identityKey));
  const toggleMusicLike = useRuforgeStore((s) => s.toggleMusicLike);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (!burst) return;
    const t = window.setTimeout(() => setBurst(false), 720);
    return () => window.clearTimeout(t);
  }, [burst]);

  return (
    <button
      type="button"
      className={cn(
        "relative shrink-0 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent overflow-visible transition-colors duration-150",
        className,
      )}
      style={{ color: liked ? "var(--music-accent)" : "rgba(255, 255, 255, 0.52)" }}
      aria-label={liked ? "Remove from Liked Songs" : "Add to Liked Songs"}
      aria-pressed={liked}
      onClick={(e) => {
        e.stopPropagation();
        if (!liked) setBurst(true);
        toggleMusicLike(file);
      }}
    >
      <AnimatePresence>
        {burst && (
          <>
            <motion.span
              key="burst"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
              style={{
                width: size * 2.6,
                height: size * 2.6,
                background: `radial-gradient(circle, rgba(255,0,51,0.45) 0%, rgba(255,0,51,0) 78%)`,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.35, 1], opacity: [0, 0.45, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
            {PARTICLES.map((p, i) => (
              <motion.span
                key={`particle-${i}`}
                className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
                style={{
                  width: 4 + (i % 2),
                  height: 4 + (i % 2),
                  marginLeft: -2,
                  marginTop: -2,
                  background: ACCENT,
                  filter: "blur(0.5px)",
                }}
                initial={{ x: 0, y: 0, opacity: 0.35, scale: 0 }}
                animate={{
                  x: [0, p.x],
                  y: [0, p.y],
                  opacity: [0.35, 0.85, 0],
                  scale: [0, p.scale, 0],
                }}
                transition={{ duration: p.duration, delay: p.delay, ease: "easeOut" }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      <motion.div
        className="relative flex items-center justify-center"
        initial={false}
        animate={{ scale: liked ? 1.08 : 1 }}
        whileTap={
          liked
            ? { scale: 1, rotate: 0 }
            : { scale: 0.85, rotate: -10 }
        }
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
      >
        <Heart
          size={size}
          strokeWidth={2}
          className={liked ? "opacity-0" : "opacity-100"}
          aria-hidden
        />
        <Heart
          size={size}
          strokeWidth={2}
          fill="currentColor"
          className="absolute inset-0 m-auto transition-opacity duration-300"
          style={{ opacity: liked ? 1 : 0 }}
          aria-hidden
        />
      </motion.div>
    </button>
  );
}
