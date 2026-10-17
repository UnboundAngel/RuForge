import { useEffect, useRef, useState } from "react";
import { navIconHoverAllowed } from "@/lib/navIconHoverGate";
import { motion, AnimatePresence, type Transition } from "motion/react";
import { RadialNavIcon, type RadialNavIconId } from "@/components/navigation/RadialNavIcon";
import { nextNavMode, type NavMode } from "@/store/types";
import { NAV_MODE_ENTER_LABEL, RADIAL_PALETTE } from "@/lib/radialNavTheme";
import { RADIAL_MENU_FRAME_PADDING, RADIAL_MENU_SIZE_DEFAULT } from "@/lib/radialMenuAnchor";
import logo from "@/assets/ruforgeAppIcon.png";

export type RadialMenuItem = {
  id: string;
  label: string;
  iconId: RadialNavIconId;
};

type RadialMenuProps = {
  open: boolean;
  navMode: NavMode;
  /** Library accent (hex). Ignored in Music, which is always red. */
  accent?: string;
  menuItems: RadialMenuItem[];
  size?: number;
  iconSize?: number;
  onSelect?: (item: RadialMenuItem) => void;
  onCenterClick?: () => void;
  /** Called whenever the hovered wedge id changes (null = none). */
  onHoveredItemChange?: (id: string | null) => void;
};

const menuTransition: Transition = {
  type: "spring",
  stiffness: 620,
  damping: 34,
  mass: 0.82,
};

const indicatorTransition: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 38,
  mass: 0.7,
};

const START_ANGLE = -90;
const RIM_W = 10;
const WELL_PAD = 5;
const HUB_R = 36;
const HUB_GAP = 6;
const TILE_GAP = 6;
const TILE_CORNER = 8;
const INDICATOR_SPAN_DEG = 20;
const INDICATOR_W = 3;
const MODE_FLASH_MS = 1400;

function polar(radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Hit area: the full slice from the hub to the disc edge, so the gaps between tiles never drop hover. */
function slicePath(midDeg: number, spanDeg: number, outer: number, inner: number) {
  const a0 = midDeg - spanDeg / 2;
  const a1 = midDeg + spanDeg / 2;
  const large = spanDeg > 180 ? 1 : 0;
  const o0 = polar(outer, a0);
  const o1 = polar(outer, a1);
  const i0 = polar(inner, a0);
  const i1 = polar(inner, a1);
  return `M ${o0.x} ${o0.y} A ${outer} ${outer} 0 ${large} 1 ${o1.x} ${o1.y} L ${i1.x} ${i1.y} A ${inner} ${inner} 0 ${large} 0 ${i0.x} ${i0.y} Z`;
}

/**
 * Annular tile with parallel gaps. Inset by the corner radius and stroked at twice that
 * with round joins in the fill color, which rounds all four corners.
 */
function tilePath(midDeg: number, spanDeg: number, outer: number, inner: number) {
  const ro = outer - TILE_CORNER;
  const ri = inner + TILE_CORNER;
  const pad = TILE_GAP / 2 + TILE_CORNER;
  const half = spanDeg / 2;
  const oa0 = midDeg - half + toDeg(pad / ro);
  const oa1 = midDeg + half - toDeg(pad / ro);
  const ia0 = midDeg - half + toDeg(pad / ri);
  const ia1 = midDeg + half - toDeg(pad / ri);
  const o0 = polar(ro, oa0);
  const o1 = polar(ro, oa1);
  const i0 = polar(ri, ia0);
  const i1 = polar(ri, ia1);
  return `M ${o0.x} ${o0.y} A ${ro} ${ro} 0 0 1 ${o1.x} ${o1.y} L ${i1.x} ${i1.y} A ${ri} ${ri} 0 0 0 ${i0.x} ${i0.y} Z`;
}

function topArcPath(radius: number, spanDeg: number) {
  const a = polar(radius, START_ANGLE - spanDeg / 2);
  const b = polar(radius, START_ANGLE + spanDeg / 2);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y}`;
}

export function RadialMenu({
  open,
  navMode,
  accent,
  menuItems,
  size = RADIAL_MENU_SIZE_DEFAULT,
  iconSize = 20,
  onSelect,
  onCenterClick,
  onHoveredItemChange,
}: RadialMenuProps) {
  const basePalette = RADIAL_PALETTE[navMode];
  const palette =
    navMode === "default" && accent
      ? {
          ...basePalette,
          accent,
          tileActive: `color-mix(in srgb, ${accent} 16%, ${basePalette.tile})`,
        }
      : basePalette;
  const radius = size / 2;
  const wellR = radius - RIM_W;
  const tileOuter = wellR - WELL_PAD;
  const tileInner = HUB_R + HUB_GAP;
  const contentRing = (tileOuter + tileInner) / 2;
  const indicatorR = wellR + RIM_W / 2;
  const slice = menuItems.length > 0 ? 360 / menuItems.length : 360;
  const contentW = Math.min(2 * contentRing * Math.sin(((slice / 2) * Math.PI) / 180) - 2 * TILE_GAP, 104);
  const contentH = tileOuter - tileInner;
  const logoSize = Math.round(HUB_R * 1.3);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [modeFlashLabel, setModeFlashLabel] = useState<string | null>(null);
  const openedAtRef = useRef(0);
  const onHoveredItemChangeRef = useRef(onHoveredItemChange);
  onHoveredItemChangeRef.current = onHoveredItemChange;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const hoveredIndexRef = useRef<number | null>(null);

  const setHovered = (index: number | null) => {
    setHoveredIndex(index);
    hoveredIndexRef.current = index;
    if (index !== null) {
      // Shortest way round, so the last slot to the first does not spin the long way.
      setRotation((prev) => {
        const delta = ((((slice * index - prev) % 360) + 540) % 360) - 180;
        return prev + delta;
      });
    }
    const id = index !== null ? (menuItems[index]?.id ?? null) : null;
    onHoveredItemChangeRef.current?.(id);
  };

  const resetActive = () => setHovered(null);

  // Fire selection for the hovered wedge when the menu closes (Alt release).
  useEffect(() => {
    if (open) return;
    const idx = hoveredIndexRef.current;
    if (idx !== null && menuItems[idx]) {
      onSelectRef.current?.(menuItems[idx]);
    }
    hoveredIndexRef.current = null;
    setHoveredIndex(null);
  }, [open]);

  useEffect(() => {
    if (open) openedAtRef.current = performance.now();
  }, [open]);

  useEffect(() => {
    setHovered(null);
  }, [navMode]);

  useEffect(() => {
    if (!modeFlashLabel) return;
    const t = window.setTimeout(() => setModeFlashLabel(null), MODE_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [modeFlashLabel]);

  const frame = size + RADIAL_MENU_FRAME_PADDING;
  const viewBox = `${-radius} ${-radius} ${size} ${size}`;
  const nextModeLabel = NAV_MODE_ENTER_LABEL[nextNavMode(navMode)];

  const handleCenterClick = () => {
    setModeFlashLabel(nextModeLabel);
    onCenterClick?.();
  };

  return (
    <AnimatePresence onExitComplete={resetActive}>
      {open && (
        <div
          className="relative flex items-center justify-center"
          style={{ width: frame, height: frame }}
        >
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_14px_36px_rgba(0,0,0,0.5)]"
            style={{ width: size, height: size }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={menuTransition}
          >
            <svg className="absolute inset-0 size-full" viewBox={viewBox} aria-hidden>
              <circle r={radius} style={{ fill: palette.rim }} />
              <circle r={wellR} style={{ fill: palette.well }} />
              {menuItems.map((item, index) => {
                const fill = hoveredIndex === index ? palette.tileActive : palette.tile;
                return (
                  <path
                    key={item.id}
                    d={tilePath(START_ANGLE + slice * index, slice, tileOuter, tileInner)}
                    strokeWidth={TILE_CORNER * 2}
                    strokeLinejoin="round"
                    style={{ fill, stroke: fill, transition: "fill 150ms ease-out, stroke 150ms ease-out" }}
                  />
                );
              })}
            </svg>

            <motion.div
              className="pointer-events-none absolute inset-0"
              initial={false}
              animate={{ rotate: rotation, opacity: hoveredIndex !== null ? 1 : 0 }}
              transition={indicatorTransition}
              aria-hidden
            >
              <svg className="size-full" viewBox={viewBox}>
                <path
                  d={topArcPath(indicatorR, INDICATOR_SPAN_DEG)}
                  fill="none"
                  stroke={palette.accent}
                  strokeWidth={INDICATOR_W}
                  strokeLinecap="round"
                />
              </svg>
            </motion.div>

            <svg className="absolute inset-0 size-full" viewBox={viewBox}>
              {menuItems.map((item, index) => {
                const midDeg = START_ANGLE + slice * index;
                const { x, y } = polar(contentRing, midDeg);
                const isActive = hoveredIndex === index;
                return (
                  <g
                    key={item.id}
                    className="cursor-pointer"
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "mouse") return;
                      if (!navIconHoverAllowed(openedAtRef.current)) return;
                      setHovered(index);
                    }}
                    onPointerLeave={() => {
                      if (hoveredIndexRef.current === index) setHovered(null);
                    }}
                  >
                    <path d={slicePath(midDeg, slice, radius, HUB_R)} fill="transparent" />
                    <foreignObject
                      x={x - contentW / 2}
                      y={y - contentH / 2}
                      width={contentW}
                      height={contentH}
                      className="pointer-events-none"
                    >
                      <div className="flex size-full flex-col items-center justify-center gap-1.5">
                        <span
                          className="flex transition-[color,transform] duration-150 ease-out"
                          style={{
                            color: isActive ? palette.accent : palette.iconIdle,
                            transform: isActive ? "translateY(-1px)" : undefined,
                          }}
                        >
                          <RadialNavIcon id={item.iconId} size={iconSize} />
                        </span>
                        <span
                          className="text-[9px] font-black uppercase leading-none tracking-[0.12em] transition-colors duration-150 ease-out"
                          style={{ color: isActive ? palette.accent : palette.labelIdle }}
                        >
                          {item.label}
                        </span>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </svg>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCenterClick();
              }}
              onPointerEnter={() => setHovered(null)}
              className="group/hub absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2"
              style={{
                width: HUB_R * 2,
                height: HUB_R * 2,
                backgroundColor: palette.hub,
                ["--tw-ring-color" as string]: palette.accent,
              }}
              aria-label={`Switch to ${nextModeLabel}`}
            >
              <AnimatePresence initial={false}>
                <motion.span
                  key={modeFlashLabel ?? "logo"}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  {modeFlashLabel ? (
                    <span
                      className="text-[10px] font-black uppercase leading-none tracking-[0.18em]"
                      style={{ color: palette.accent }}
                    >
                      {modeFlashLabel}
                    </span>
                  ) : (
                    <span
                      className="block overflow-hidden rounded-full transition-transform duration-150 ease-out group-hover/hub:scale-[1.06] group-active/hub:scale-[0.96]"
                      style={{ width: logoSize, height: logoSize }}
                    >
                      <img
                        src={logo}
                        alt=""
                        draggable={false}
                        className="block size-full scale-[1.35] object-cover object-center"
                      />
                    </span>
                  )}
                </motion.span>
              </AnimatePresence>
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
