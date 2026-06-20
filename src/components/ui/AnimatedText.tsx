import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { motion, type Variants } from "motion/react";

import { cn } from "@/lib/utils";

export type AnimatedTextProps = HTMLAttributes<HTMLDivElement> & {
  text?: string;
  children?: ReactNode;
  textClassName?: string;
  underlineClassName?: string;
  underlinePath?: string;
  underlineHoverPath?: string;
  underlineDuration?: number;
};

export const AnimatedText = forwardRef<HTMLDivElement, AnimatedTextProps>(
  (
    {
      text,
      children,
      textClassName,
      underlineClassName,
      underlinePath = "M 0,10 Q 75,0 150,10 Q 225,20 300,10",
      underlineHoverPath = "M 0,10 Q 75,20 150,10 Q 225,0 300,10",
      underlineDuration = 1.5,
      className,
      ...props
    },
    ref,
  ) => {
    const pathVariants: Variants = {
      hidden: {
        pathLength: 0,
        opacity: 0,
      },
      visible: {
        pathLength: 1,
        opacity: 1,
        transition: {
          duration: underlineDuration,
          ease: "easeInOut",
        },
      },
    };

    return (
      <div
        ref={ref}
        className={cn("flex flex-col items-center justify-center gap-2", className)}
        {...props}
      >
        <div className="relative pb-6">
          <motion.h1
            className={cn("text-center font-bold", textClassName)}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
            whileHover={{ scale: 1.02 }}
          >
            {children ?? text}
          </motion.h1>

          <motion.svg
            width="100%"
            height="20"
            viewBox="0 0 300 20"
            className={cn("absolute bottom-0 left-0", underlineClassName)}
            aria-hidden
          >
            <motion.path
              d={underlinePath}
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              variants={pathVariants}
              initial="hidden"
              animate="visible"
              whileHover={{
                d: underlineHoverPath,
                transition: { duration: 0.8 },
              }}
            />
          </motion.svg>
        </div>
      </div>
    );
  },
);

AnimatedText.displayName = "AnimatedText";
