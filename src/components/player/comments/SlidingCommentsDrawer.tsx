import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import type { VideoCommentsViewState } from "./useVideoComments";
import { CommentsPanel } from "./CommentsPanel";
import { COMMENTS_PANEL_WIDTH } from "./commentThreadUtils";
import type { VideoComment } from "@/lib/videoCommentsTypes";

export { COMMENTS_PANEL_WIDTH };

type SlidingCommentsDrawerProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  comments: VideoComment[];
  commentsLoading?: boolean;
  commentsLoadingLabel?: string;
  commentsViewState?: VideoCommentsViewState;
  downloadCommentsEnabled?: boolean;
  onCommentsRetry?: () => void;
  enableEdgeHold?: boolean;
  onAnimatedXChange?: (x: number) => void;
};

export function SlidingCommentsDrawer({
  isOpen,
  onOpenChange,
  comments,
  commentsLoading = false,
  commentsLoadingLabel,
  commentsViewState = "loading",
  downloadCommentsEnabled = false,
  onCommentsRetry,
  enableEdgeHold = true,
  onAnimatedXChange,
}: SlidingCommentsDrawerProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [filterType, setFilterType] = useState<"top" | "newest">("top");

  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const holdAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const dragOffsetRef = useRef(0);
  const prefersReducedMotion = useReducedMotion();

  const targetX = useMotionValue(COMMENTS_PANEL_WIDTH);
  const animatedX = useSpring(targetX, {
    stiffness: prefersReducedMotion ? 500 : 340,
    damping: prefersReducedMotion ? 40 : 30,
  });
  const holdProgress = useMotionValue(0);
  const holdScaleY = useTransform(holdProgress, [0, 1], [0.3, 1]);
  const holdOpacity = useTransform(holdProgress, [0, 1], [0, 0.8]);

  useEffect(() => {
    animatedX.jump(isOpen ? 0 : COMMENTS_PANEL_WIDTH);
  }, []);

  useEffect(() => {
    targetX.set(isOpen ? 0 : COMMENTS_PANEL_WIDTH);
  }, [isOpen, targetX]);

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
        const newX = currentXRef.current - window.innerWidth + COMMENTS_PANEL_WIDTH;
        targetX.set(Math.max(0, Math.min(newX, COMMENTS_PANEL_WIDTH)));
      },
    });
  };

  const handlePanelEdgeDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !isOpen) return;
    setIsDragging(true);
    const currentLeftEdgeVisually =
      window.innerWidth - COMMENTS_PANEL_WIDTH + animatedX.get();
    dragOffsetRef.current = e.clientX - currentLeftEdgeVisually;
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      currentXRef.current = e.clientX;
      if (isHolding) {
        if (Math.abs(e.clientX - startXRef.current) > 10) cancelHold();
      } else if (isDragging) {
        let newX = e.clientX - dragOffsetRef.current - window.innerWidth + COMMENTS_PANEL_WIDTH;
        newX = Math.max(0, Math.min(newX, COMMENTS_PANEL_WIDTH));
        targetX.set(newX);
      }
    };

    const handlePointerUp = () => {
      if (isHolding) {
        cancelHold();
      } else if (isDragging) {
        setIsDragging(false);
        const shouldOpen = targetX.get() < COMMENTS_PANEL_WIDTH * 0.55;
        onOpenChange(shouldOpen);
      }
    };

    if (isHolding || isDragging) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [isHolding, isDragging, onOpenChange, targetX]);

  return (
    <>
      <motion.div
        style={{
          width: COMMENTS_PANEL_WIDTH,
          x: animatedX,
        }}
        className="absolute bottom-0 right-0 top-0 z-[65] flex flex-col bg-[#271C18]"
      >
        <svg
          className="pointer-events-none absolute right-full top-0 h-5 w-5"
          viewBox="0 0 20 20"
          aria-hidden
        >
          <path d="M20 0H0C11.046 0 20 8.954 20 20V0Z" fill="#271C18" />
        </svg>

        {isOpen ? (
          <div
            className="group absolute bottom-0 left-[-14px] top-0 z-30 flex w-7 cursor-ew-resize items-center justify-center"
            onPointerDown={handlePanelEdgeDown}
          >
            <div className="h-12 w-1 rounded-full bg-white/0 transition-colors delay-100 duration-200 group-hover:bg-white/20" />
          </div>
        ) : null}

        <CommentsPanel
          comments={comments}
          filterType={filterType}
          onFilterChange={setFilterType}
          onClose={() => onOpenChange(false)}
          loading={commentsLoading}
          loadingLabel={commentsLoadingLabel}
          viewState={commentsViewState}
          downloadCommentsEnabled={downloadCommentsEnabled}
          onRetry={onCommentsRetry}
        />
      </motion.div>

      {!isOpen && enableEdgeHold ? (
        <div
          onPointerDown={handleRightEdgeDown}
          className={`absolute bottom-0 right-0 top-0 z-[66] flex w-16 touch-none select-none items-center justify-end pr-2 ${isHolding ? "cursor-grabbing" : "cursor-pointer"}`}
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
          aria-label="Close comments"
          className="absolute bottom-0 left-0 top-0 z-[64] cursor-pointer border-none bg-transparent"
          style={{ right: COMMENTS_PANEL_WIDTH }}
          onClick={() => onOpenChange(false)}
        />
      ) : null}
    </>
  );
}