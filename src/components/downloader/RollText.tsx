import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

const word: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.03 } },
  gone: { transition: { staggerChildren: 0.02 } },
};

const char: Variants = {
  hidden: { rotateX: -90, y: "0.35em", opacity: 0 },
  shown: { rotateX: 0, y: 0, opacity: 1, transition: { duration: 0.32, ease: EASE } },
  gone: { rotateX: 90, y: "-0.35em", opacity: 0, transition: { duration: 0.16, ease: EASE } },
};

/** Flips the new string in letter by letter whenever `id` changes. */
export function RollText({ id, children }: { id: string; children: string }) {
  const reduceMotion = useReducedMotion() ?? false;
  if (reduceMotion) return <span>{children}</span>;

  return (
    <span className="relative inline-flex [perspective:400px]" aria-label={children}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={id}
          aria-hidden
          variants={word}
          initial="hidden"
          animate="shown"
          exit="gone"
          className="inline-flex whitespace-pre"
        >
          {Array.from(children).map((c, i) => (
            <motion.span key={i} variants={char} className="inline-block origin-center">
              {c}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
