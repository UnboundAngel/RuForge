import { useId } from "react";
import "./aero.css";

const SUN = { x: 230, y: 40 };
const RAYS = Array.from({ length: 11 }, (_, i) => {
  const a = ((12 + i * 7.5) * Math.PI) / 180;
  const spread = (1.6 * Math.PI) / 180;
  const len = 1900;
  const p = (ang: number) => `${(SUN.x + Math.cos(ang) * len).toFixed(0)},${(SUN.y + Math.sin(ang) * len).toFixed(0)}`;
  return `M${SUN.x},${SUN.y} L${p(a - spread)} L${p(a + spread)} Z`;
});

const FAR_HILL = "M-50 700 C 250 610, 520 600, 820 650 S 1350 690, 1650 620 L1650 900 L-50 900 Z";
const NEAR_HILL = "M-50 790 C 300 700, 700 690, 1000 735 S 1450 800, 1650 760 L1650 900 L-50 900 Z";

/** Procedural at native resolution: fractal-noise clouds, soft rays, textured hills. */
export default function AeroBackdrop() {
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `rf-ae-${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <svg className="size-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0846b8" />
            <stop offset="42%" stopColor="#2b8cee" />
            <stop offset="70%" stopColor="#8fd3ff" />
            <stop offset="84%" stopColor="#e4f7ff" />
          </linearGradient>
          <radialGradient id={id("sun")} cx={SUN.x} cy={SUN.y} r="900" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="12%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="45%" stopColor="#d8f2ff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id={id("soft")} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id={id("clouds")} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0028 0.0085" numOctaves="6" seed="17" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.4 0 0 0 -1.55" result="puff" />
            <feOffset in="puff" dy="14" result="low" />
            <feColorMatrix in="low" type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.74  0 0 0 0 0.9  0 0 0 0.55 0" result="belly" />
            <feMerge>
              <feMergeNode in="belly" />
              <feMergeNode in="puff" />
            </feMerge>
          </filter>
          <linearGradient id={id("cloudBand")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="12%" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="72%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={id("cloudMask")}>
            <rect width="1600" height="900" fill={url("cloudBand")} />
          </mask>
          <linearGradient id={id("far")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9fe07a" />
            <stop offset="60%" stopColor="#5cb33c" />
          </linearGradient>
          <linearGradient id={id("near")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8ee85a" />
            <stop offset="25%" stopColor="#5fc238" />
            <stop offset="100%" stopColor="#23701a" />
          </linearGradient>
          <filter id={id("grass")} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9 0.11" numOctaves="3" seed="4" result="n" />
            <feColorMatrix
              in="n"
              type="matrix"
              values="0 0 0 0 0.08  0 0 0 0 0.28  0 0 0 0 0.04  0 0 0 1.1 -0.32"
              result="blades"
            />
            <feComposite in="blades" in2="SourceGraphic" operator="in" result="textured" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="textured" />
            </feMerge>
          </filter>
          <linearGradient id={id("haze")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="60%" stopColor="#e8f8ff" stopOpacity="0" />
            <stop offset="76%" stopColor="#e8f8ff" stopOpacity="0.35" />
            <stop offset="80%" stopColor="#e8f8ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={id("shade")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="72%" stopColor="#002814" stopOpacity="0" />
            <stop offset="100%" stopColor="#002814" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        <rect width="1600" height="900" fill={url("sky")} />
        <rect width="1600" height="900" fill={url("sun")} />
        <g fill="#ffffff" opacity="0.13" filter={url("soft")}>
          {RAYS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <rect width="1600" height="900" filter={url("clouds")} mask={url("cloudMask")} />
        <rect width="1600" height="900" fill={url("haze")} />

        <path d={FAR_HILL} fill={url("far")} opacity="0.9" />
        <path d={FAR_HILL} fill="none" stroke="#dfffc4" strokeOpacity="0.5" strokeWidth="3" filter={url("soft")} />
        <path d={NEAR_HILL} fill={url("near")} filter={url("grass")} />
        <path d={NEAR_HILL} fill="none" stroke="#e8ffc8" strokeOpacity="0.7" strokeWidth="4" filter={url("soft")} />

        <rect width="1600" height="900" fill={url("shade")} />
      </svg>
    </div>
  );
}
