import { useId } from "react";

/** Units are a 400x400 box laid over the square cover. */
const DRIPS = [
  { x: 52, w: 7, len: 58, r: 9 },
  { x: 96, w: 4, len: 26, r: 5.5 },
  { x: 238, w: 9, len: 88, r: 11.5 },
  { x: 274, w: 5, len: 38, r: 6.5 },
  { x: 350, w: 6, len: 48, r: 7.5 },
];

const POOL_DEPTHS = [10, 14, 9, 16, 11, 19, 9, 13, 17, 8, 12, 15, 10, 18, 11, 13, 9];

function poolPath() {
  const step = 400 / (POOL_DEPTHS.length - 1);
  let d = `M0 0 H400 V${POOL_DEPTHS[POOL_DEPTHS.length - 1]}`;
  for (let i = POOL_DEPTHS.length - 2; i >= 0; i--) {
    const x = i * step;
    const midX = x + step / 2;
    d += ` Q${midX} ${POOL_DEPTHS[i + 1] + 3} ${x} ${POOL_DEPTHS[i]}`;
  }
  return `${d} Z`;
}

const POOL_D = poolPath();

export function GothicBlood() {
  const uid = useId().replace(/:/g, "");
  const filterId = `rf-blood-${uid}`;
  const fillId = `rf-blood-fill-${uid}`;

  return (
    <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a0209" />
          <stop offset="30%" stopColor="#7c0a14" />
          <stop offset="100%" stopColor="#4a0106" />
        </linearGradient>
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="soft" />
          <feColorMatrix
            in="soft"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"
            result="goo"
          />
          <feGaussianBlur in="goo" stdDeviation="2" result="bump" />
          <feSpecularLighting
            in="bump"
            surfaceScale="5"
            specularConstant="1.1"
            specularExponent="32"
            lightingColor="#ffe0e0"
            result="spec"
          >
            <feDistantLight azimuth="235" elevation="52" />
          </feSpecularLighting>
          <feComposite in="spec" in2="goo" operator="in" result="gloss" />
          <feMorphology in="goo" operator="erode" radius="1.5" result="core" />
          <feComposite in="goo" in2="core" operator="out" result="rim" />
          <feColorMatrix in="rim" type="matrix" values="0 0 0 0 0.12  0 0 0 0 0  0 0 0 0 0.01  0 0 0 0.6 0" result="rimDark" />
          <feMerge>
            <feMergeNode in="goo" />
            <feMergeNode in="rimDark" />
            <feMergeNode in="gloss" />
          </feMerge>
        </filter>
      </defs>

      <g filter={`url(#${filterId})`} fill={`url(#${fillId})`}>
        <path d={POOL_D} />
        {DRIPS.map(({ x, w, len, r }) => (
          <g key={x}>
            <rect x={x - w / 2} y={0} width={w} height={len} />
            <circle cx={x} cy={len} r={r} />
          </g>
        ))}
      </g>
    </svg>
  );
}
