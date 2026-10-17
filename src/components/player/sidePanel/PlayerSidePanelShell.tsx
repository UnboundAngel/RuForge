import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

export const SIDE_PANEL_WIDTH = 420;

type PlayerSidePanelShellProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hold the right edge of the player to pull the panel out. Only one panel at a time owns that strip. */
  enableEdgeHold?: boolean;
  onAnimatedXChange?: (x: number) => void;
  children: ReactNode;
};

/** The sheet chrome shared by Description/Comments and Next up: spring slide, drag, edge hold, click-outside close. */
export function PlayerSidePanelShell({
  isOpen,
  onOpenChange,
  enableEdgeHold = true,
  onAnimatedXChange,
  children,
}: PlayerSidePanelShellProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const holdAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const dragOffsetRef = useRef(0);
  const prefersReducedMotion = useReducedMotion();

  const targetX = useMotionValue(SIDE_PANEL_WIDTH);
  const animatedX = useSpring(targetX, {
    stiffness: prefersReducedMotion ? 500 : 340,
    damping: prefersReducedMotion ? 40 : 30,
  });
  const holdProgress = useMotionValue(0);
  const holdScaleY = useTransform(holdProgress, [0, 1], [0.3, 1]);
  const holdOpacity = useTransform(holdProgress, [0, 1], [0, 0.8]);

  useEffect(() => {
    animatedX.jump(isOpen ? 0 : SIDE_PANEL_WIDTH);
  }, []);

  useEffect(() => {
    // Also re-runs when a drag or hold ends, so the drawn position can never stay out of step with `isOpen`.
    if (!isDragging && !isHolding) targetX.set(isOpen ? 0 : SIDE_PANEL_WIDTH);
  }, [isOpen, isDragging, isHolding, targetX]);

  useEffect(() => {
    if (!onAnimatedXChange) return;
    const unsub = animatedX.on("change", onAnimatedXChange);
    onAnimatedXChange(animatedX.get());
    return unsub;
  }, [animatedX, onAnimatedXChange]);

  const cancelHold = () => {
    setIsHolding(false);
    if (holdAnimationRef.current) holdAnimationRef.current.stop();
    holdProgress.set(0);
  };

  const handleRightEdgeDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || isOpen || !enableEdgeHold) return;
    startXRef.current = e.clientX;
    currentXRef.current = e.clientX;
    setIsHolding(true);
    holdProgress.set(0);

    holdAnimationRef.current = animate(holdProgress, 1, {
      duration: 0.28,
      ease: "linear",
      onComplete: () => {
        setIsHolding(false);
        setIsDragging(true);
        dragOffsetRef.current = 0;
        const newX = currentXRef.current - window.innerWidth + SIDE_PANEL_WIDTH;
        targetX.set(Math.max(0, Math.min(newX, SIDE_PANEL_WIDTH)));
      },
    });
  };

  const handlePanelEdgeDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !isOpen) return;
    setIsDragging(true);
    const currentLeftEdgeVisually = window.innerWidth - SIDE_PANEL_WIDTH + animatedX.get();
    dragOffsetRef.current = e.clientX - currentLeftEdgeVisually;
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      // A release outside the window or a cancelled pointer never fires pointerup; without this the
      // panel keeps following the cursor and `isOpen` never catches up.
      if (e.buttons === 0) {
        handlePointerUp();
        return;
      }
      currentXRef.current = e.clientX;
      if (isHolding) {
        if (Math.abs(e.clientX - startXRef.current) > 10) cancelHold();
      } else if (isDragging) {
        let newX = e.clientX - dragOffsetRef.current - window.innerWidth + SIDE_PANEL_WIDTH;
        newX = Math.max(0, Math.min(newX, SIDE_PANEL_WIDTH));
        targetX.set(newX);
      }
    };

    const handlePointerUp = () => {
      if (isHolding) {
        cancelHold();
      } else if (isDragging) {
        setIsDragging(false);
        const shouldOpen = targetX.get() < SIDE_PANEL_WIDTH * 0.55;
        // Snap here too: releasing on the side it started leaves `isOpen` unchanged, so the effect never re-fires.
        targetX.set(shouldOpen ? 0 : SIDE_PANEL_WIDTH);
        onOpenChange(shouldOpen);
      }
    };

    if (isHolding || isDragging) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };
    }
  }, [isHolding, isDragging, onOpenChange, targetX]);

  return (
    <>
      <motion.div
        style={{
          width: SIDE_PANEL_WIDTH,
          x: animatedX,
        }}
        className={`absolute bottom-0 right-0 top-0 z-[85] flex flex-col bg-black ${
          isOpen || isDragging || isHolding ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <svg
          className="pointer-events-none absolute right-full top-0 h-5 w-5"
          viewBox="0 0 20 20"
          aria-hidden
        >
          <path d="M20 0H0C11.046 0 20 8.954 20 20V0Z" className="fill-black" />
        </svg>

        {isOpen ? (
          <div
            className="group absolute bottom-0 left-[-14px] top-0 z-30 flex w-7 cursor-ew-resize items-center justify-center"
            onPointerDown={handlePanelEdgeDown}
          >
            <div className="h-12 w-1 rounded-full bg-white/0 transition-colors delay-100 duration-200 group-hover:bg-white/20" />
          </div>
        ) : null}

        {children}
      </motion.div>

      {!isOpen && enableEdgeHold ? (
        <div
          onPointerDown={handleRightEdgeDown}
          className={`absolute right-0 top-14 z-[55] flex w-3 touch-none select-none items-center justify-end ${isHolding ? "cursor-grabbing" : "cursor-pointer"}`}
          style={{ bottom: "7.5rem" }}
          aria-hidden
        >
          <motion.div
            className="h-24 w-1 origin-center rounded-full bg-white/80"
            style={{ scaleY: holdScaleY, opacity: holdOpacity }}
          />
        </div>
      ) : null}

      {isOpen && !isDragging ? (
        <button
          type="button"
          aria-label="Close panel"
          className="absolute bottom-0 left-0 top-0 z-[64] cursor-pointer border-none bg-transparent"
          style={{ right: SIDE_PANEL_WIDTH }}
          onClick={() => onOpenChange(false)}
        />
      ) : null}
    </>
  );
}
