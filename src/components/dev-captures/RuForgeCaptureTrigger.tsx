import { useRef, useState, type CSSProperties } from "react";
import { Icon } from "@iconify/react";
import { motion } from "motion/react";
import logo from "@/assets/ruforgeAppIcon.png";
import { cn } from "@/lib/utils";
import { isDevCaptureEnabled } from "@/lib/devCaptureGate";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { useDevCaptureChrome } from "./DevCaptureChromeProvider";
import {
  DevCaptureTriggerContextMenu,
  type DevCaptureTriggerContextMenuState,
} from "./DevCaptureTriggerContextMenu";

type RuForgeCaptureTriggerProps = {
  screenLabel: string;
  className?: string;
  imgClassName?: string;
};

export function RuForgeCaptureTrigger({
  screenLabel,
  className,
  imgClassName = "h-8 w-8 rounded-lg object-cover",
}: RuForgeCaptureTriggerProps) {
  const showDebuggingSettings = useRuforgeStore((s) => s.settings.showDebuggingSettings);
  const enabled = isDevCaptureEnabled(showDebuggingSettings);

  if (!enabled) {
    return (
      <img src={logo} className={cn(imgClassName, className)} alt="RuForge" />
    );
  }

  return (
    <RuForgeCaptureTriggerActive
      screenLabel={screenLabel}
      className={className}
      imgClassName={imgClassName}
    />
  );
}

function RuForgeCaptureTriggerActive({
  screenLabel,
  className,
  imgClassName = "h-8 w-8 rounded-lg object-cover",
}: RuForgeCaptureTriggerProps) {
  const { captureFromTrigger, capturing, hasLastCapture, openLastCapture, goToDevCaptures } =
    useDevCaptureChrome();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [bounce, setBounce] = useState(false);
  const [hover, setHover] = useState(false);
  const [contextMenu, setContextMenu] = useState<DevCaptureTriggerContextMenuState | null>(null);

  const handleClick = () => {
    if (capturing || !buttonRef.current) return;
    setBounce(true);
    const rect = buttonRef.current.getBoundingClientRect();
    void captureFromTrigger(rect, screenLabel);
  };

  return (
    <>
      <motion.button
        ref={buttonRef}
        type="button"
        data-rf-capture-trigger
        className={cn(
          "group/capture relative shrink-0 cursor-pointer overflow-hidden rounded-lg",
          imgClassName,
          className,
        )}
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        aria-label="Capture screen"
        disabled={capturing}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        onClick={handleClick}
        animate={{ scale: bounce ? [1, 0.92, 1.04, 1] : 1 }}
        transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
        onAnimationComplete={() => setBounce(false)}
      >
        <img
          src={logo}
          alt=""
          className={cn(
            imgClassName,
            "transition-opacity duration-150",
            hover ? "opacity-0" : "opacity-100",
          )}
        />
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center text-stone-200 transition-opacity duration-150",
            hover ? "opacity-100" : "opacity-0",
          )}
        >
          <Icon icon="tabler:capture" width="100%" height="100%" aria-hidden />
        </span>
      </motion.button>

      <DevCaptureTriggerContextMenu
        menu={contextMenu}
        hasLastCapture={hasLastCapture}
        onEditLast={() => void openLastCapture()}
        onOpenLibrary={goToDevCaptures}
        onClose={() => setContextMenu(null)}
      />
    </>
  );
}
