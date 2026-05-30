import { useEffect, useRef, useState, type CSSProperties } from "react";
import { navIconHoverAllowed } from "@/lib/navIconHoverGate";
import { motion, AnimatePresence, type Transition } from "motion/react";
import { RadialNavIcon, type RadialNavIconId } from "@/components/navigation/RadialNavIcon";
import { nextNavMode, type NavMode } from "@/store/types";
import { NAV_MODE_ENTER_LABEL, RADIAL_PALETTE } from "@/lib/radialNavTheme";
import logo from "@/assets/neotubeIcon.png";

export type RadialHintPlacement = "top" | "right" | "bottom" | "left";

export type RadialMenuItem = {
  id: string;
  label: string;
  iconId: RadialNavIconId;
  hintPlacement: RadialHintPlacement;
};

type RadialMenuProps = {
  open: boolean;
  navMode: NavMode;
  menuItems: RadialMenuItem[];
  size?: number;
  iconSize?: number;
  bandWidth?: number;
  innerGap?: number;
  outerGap?: number;
  outerRingWidth?: number;
  onSelect?: (item: RadialMenuItem) => void;
  onCenterClick?: () => void;
};

const menuTransition: Transition = {
  type: "spring",
  stiffness: 620,
  damping: 34,
  mass: 0.82,
};

const FULL_CIRCLE = 360;
const START_ANGLE = -90;

/** Gap between ring outer edge and hint label. */
const HINT_GAP = 10;

const MODE_FLASH_MS = 1400;

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function polarToCartesian(radius: number, angleDeg: number) {
  const rad = degToRad(angleDeg);
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius,
  };
}

function slicePath(
  index: number,
  total: number,
  wedgeRadius: number,
  innerRadius: number,
) {
  if (total <= 0) return "";
  if (total === 1) {
    return `M ${wedgeRadius} 0 A ${wedgeRadius} ${wedgeRadius} 0 1 1 ${-wedgeRadius} 0 A ${wedgeRadius} ${wedgeRadius} 0 1 1 ${wedgeRadius} 0 M ${innerRadius} 0 A ${innerRadius} ${innerRadius} 0 1 0 ${-innerRadius} 0 A ${innerRadius} ${innerRadius} 0 1 0 ${innerRadius} 0`;
  }
  const anglePerSlice = FULL_CIRCLE / total;
  const midDeg = START_ANGLE + anglePerSlice * index;
  const halfSlice = anglePerSlice / 2;
  const startDeg = midDeg - halfSlice;
  const endDeg = midDeg + halfSlice;
  const outerStart = polarToCartesian(wedgeRadius, startDeg);
  const outerEnd = polarToCartesian(wedgeRadius, endDeg);
  const innerStart = polarToCartesian(innerRadius, startDeg);
  const innerEnd = polarToCartesian(innerRadius, endDeg);
  const largeArcFlag = anglePerSlice > 180 ? 1 : 0;
  return `M ${outerStart.x} ${outerStart.y} A ${wedgeRadius} ${wedgeRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y} Z`;
}

function hintStyle(
  placement: RadialHintPlacement,
  menuRadius: number,
): CSSProperties {
  const r = menuRadius + HINT_GAP;
  switch (placement) {
    case "top":
      return {
        left: "50%",
        top: `calc(50% - ${r}px)`,
        transform: "translate(-50%, -100%)",
      };
    case "right":
      return {
        left: `calc(50% + ${r}px)`,
        top: "50%",
        transform: "translate(0, -50%)",
      };
    case "bottom":
      return {
        left: "50%",
        top: `calc(50% + ${r}px)`,
        transform: "translate(-50%, 0)",
      };
    case "left":
      return {
        left: `calc(50% - ${r}px)`,
        top: "50%",
        transform: "translate(-100%, -50%)",
      };
  }
}

export function RadialMenu({
  open,
  navMode,
  menuItems,
  size = 280,
  iconSize = 22,
  bandWidth = 54,
  innerGap = 4,
  outerGap = 8,
  outerRingWidth = 12,
  onSelect,
  onCenterClick,
}: RadialMenuProps) {
  const palette = RADIAL_PALETTE[navMode];
  const radius = size / 2;
  const outerRingOuterRadius = radius;
  const outerRingInnerRadius = outerRingOuterRadius - outerRingWidth;
  const wedgeOuterRadius = outerRingInnerRadius - outerGap;
  const wedgeInnerRadius = wedgeOuterRadius - bandWidth;
  const iconRingRadius = (wedgeOuterRadius + wedgeInnerRadius) / 2;
  const centerRadius = Math.max(wedgeInnerRadius - innerGap, 0);
  const slice = menuItems.length > 0 ? 360 / menuItems.length : 360;

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [modeFlashLabel, setModeFlashLabel] = useState<string | null>(null);
  const openedAtRef = useRef(0);

  const resetActive = () => setHoveredIndex(null);

  useEffect(() => {
    if (open) openedAtRef.current = performance.now();
  }, [open]);

  useEffect(() => {
    if (!modeFlashLabel) return;
    const t = window.setTimeout(() => setModeFlashLabel(null), MODE_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [modeFlashLabel]);

  const activeItem =
    hoveredIndex !== null && hoveredIndex >= 0
      ? menuItems[hoveredIndex]
      : null;

  const frame = size + 32;

  const handleCenterClick = () => {
    const entering = nextNavMode(navMode);
    setModeFlashLabel(NAV_MODE_ENTER_LABEL[entering]);
    onCenterClick?.();
  };

  return (
    <AnimatePresence onExitComplete={resetActive}>
      {open && (
        <div
          className="relative flex items-center justify-center"
          style={{ width: frame, height: frame }}
        >
          {activeItem ? (
            <div
              className="rf-radial-hint pointer-events-none absolute z-20"
              style={hintStyle(activeItem.hintPlacement, radius)}
            >
              {activeItem.label}
            </div>
          ) : null}

          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_24px_64px_rgba(0,0,0,0.55)] outline-none"
            style={{ width: size, height: size }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={menuTransition}
          >
            <svg
              className="absolute inset-0 size-full"
              viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}
            >
              {menuItems.map((item, index) => {
                const midDeg = START_ANGLE + slice * index;
                const { x: iconX, y: iconY } = polarToCartesian(
                  iconRingRadius,
                  midDeg,
                );
                const iconBox = iconSize * 2.4;
                const wedgeHovered = hoveredIndex === index;
                const isActive = wedgeHovered;

                return (
                  <g
                    key={item.id}
                    className="cursor-pointer"
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "mouse") return;
                      if (!navIconHoverAllowed(openedAtRef.current)) return;
                      setHoveredIndex(index);
                    }}
                    onPointerLeave={() => {
                      setHoveredIndex((cur) => (cur === index ? null : cur));
                    }}
                    onClick={() => onSelect?.(item)}
                  >
                    <path
                      d={slicePath(
                        index,
                        menuItems.length,
                        outerRingOuterRadius,
                        outerRingInnerRadius,
                      )}
                      fill={isActive ? palette.wedgeActive : palette.outerRing}
                    />
                    <path
                      d={slicePath(
                        index,
                        menuItems.length,
                        wedgeOuterRadius,
                        wedgeInnerRadius,
                      )}
                      fill={isActive ? palette.wedgeActive : palette.wedge}
                      stroke={
                        isActive ? palette.wedgeActiveStroke : palette.wedgeStroke
                      }
                      strokeWidth={1}
                    />
                    <foreignObject
                      x={iconX - iconBox / 2}
                      y={iconY - iconBox / 2}
                      width={iconBox}
                      height={iconBox}
                    >
                      <div
                        className={`flex size-full items-center justify-center outline-none ${
                          isActive
                            ? "text-[color:var(--accent)]"
                            : "text-stone-400"
                        }`}
                      >
                        <RadialNavIcon
                          id={item.iconId}
                          size={iconSize}
                          playing={wedgeHovered}
                        />
                      </div>
                    </foreignObject>
                  </g>
                );
              })}

              <circle
                cx={0}
                cy={0}
                r={centerRadius}
                fill={palette.centerFill}
                stroke={palette.centerStroke}
                strokeWidth={1}
              />
            </svg>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCenterClick();
              }}
              className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-[#1c1512] outline-none transition-transform hover:scale-[1.03] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
              style={{
                width: centerRadius * 2,
                height: centerRadius * 2,
              }}
              aria-label="Switch mode"
            >
              <AnimatePresence mode="wait">
                {modeFlashLabel ? (
                  <motion.span
                    key={modeFlashLabel}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className="px-2 text-center text-[11px] font-black uppercase leading-tight tracking-[0.12em] text-[color:var(--accent)]"
                  >
                    {modeFlashLabel}
                  </motion.span>
                ) : (
                  <motion.img
                    key="logo"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    src={logo}
                    alt=""
                    className="size-full scale-[1.35] object-cover object-center"
                  />
                )}
              </AnimatePresence>
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
