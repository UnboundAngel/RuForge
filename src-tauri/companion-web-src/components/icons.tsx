import type { CSSProperties } from "react";
import { useReducedMotion } from "motion/react";

export {
  ArrowDownUp,
  Check,
  CircleCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  Settings,
  Unlock,
  Disc3,
  CloudOff,
  Download,
  HardDrive,
  RefreshCw,
  Share,
  Smartphone,
  SquarePlus,
  Wifi,
  WifiOff,
  Home,
  Library,
  Maximize,
  Minimize,
  Music,
  Music2,
  Pause,
  Play,
  Repeat1,
  Search,
  Shuffle,
  Video,
  Volume2,
  X,
} from "lucide-react";

// Desktop renders these through Iconify's API; the phone gets the same bodies inline so it
// never waits on a third-party fetch.
const ICONIFY = {
  shuffle: { box: 24, body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m18 4l3 3l-3 3m0 10l3-3l-3-3"/><path d="M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5m0-10h-5a4.98 4.98 0 0 0-3 1m-4 8a5 5 0 0 1-3 1H3"/></g>' },
  prev: { box: 24, body: '<path fill="currentColor" d="m20.341 4.247l-8 7a1 1 0 0 0 0 1.506l8 7c.647.565 1.659.106 1.659-.753V5c0-.86-1.012-1.318-1.659-.753m-11 0l-8 7a1 1 0 0 0 0 1.506l8 7C9.988 20.318 11 19.859 11 19V5c0-.86-1.012-1.318-1.659-.753"/>' },
  next: { box: 24, body: '<path fill="currentColor" d="M2 5v14c0 .86 1.012 1.318 1.659.753l8-7a1 1 0 0 0 0-1.506l-8-7C3.012 3.682 2 4.141 2 5m11 0v14c0 .86 1.012 1.318 1.659.753l8-7a1 1 0 0 0 0-1.506l-8-7C14.012 3.682 13 4.141 13 5"/>' },
  gauge: { box: 24, body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0"/><path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0m2.41-1.41L16 8m-9 4a5 5 0 0 1 5-5"/></g>' },
  skipPrev: { box: 24, body: '<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M19 5.8v12.4L8.4 12z"/><path d="M5.5 5.5v13" fill="none"/></g>' },
  skipNext: { box: 24, body: '<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M5 5.8v12.4L15.6 12z"/><path d="M18.5 5.5v13" fill="none"/></g>' },
  queue: { box: 24, body: '<path fill="currentColor" d="M16 20q-1.25 0-2.125-.875T13 17t.875-2.125T16 14q.275 0 .525.038T17 14.2V7q0-.425.288-.712T18 6h3q.425 0 .713.288T22 7t-.288.713T21 8h-2v9q0 1.25-.875 2.125T16 20M4 16q-.425 0-.712-.288T3 15t.288-.712T4 14h6q.425 0 .713.288T11 15t-.288.713T10 16zm0-4q-.425 0-.712-.288T3 11t.288-.712T4 10h10q.425 0 .713.288T15 11t-.288.713T14 12zm0-4q-.425 0-.712-.288T3 7t.288-.712T4 6h10q.425 0 .713.288T15 7t-.288.713T14 8z"/>' },
  playCircle: { box: 24, body: '<path fill="currentColor" d="m10.65 15.75l4.875-3.125q.35-.225.35-.625t-.35-.625L10.65 8.25q-.375-.25-.763-.038t-.387.663v6.25q0 .45.388.663t.762-.038M12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22"/>' },
  loop: { box: 15, body: '<path fill="currentColor" d="M1.5 7a.5.5 0 0 1 .5.5A3.5 3.5 0 0 0 5.5 11h7.293l-1.147-1.146l-.064-.078a.5.5 0 0 1 .693-.694l.079.065l2 2a.5.5 0 0 1 0 .707l-2 2a.5.5 0 1 1-.708-.707L12.793 12H5.5A4.5 4.5 0 0 1 1 7.5a.5.5 0 0 1 .5-.5m1.225-5.918a.5.5 0 0 1 .693.694l-.065.078L2.207 3H9.5A4.5 4.5 0 0 1 14 7.5a.5.5 0 0 1-1 0A3.5 3.5 0 0 0 9.5 4H2.207l1.146 1.147l.065.078a.5.5 0 0 1-.693.693l-.079-.064l-2-2a.5.5 0 0 1 0-.707l2-2z"/>' },
} as const;

export type IconifyName = keyof typeof ICONIFY;

export function RfIcon({ name, size = 20, className }: { name: IconifyName; size?: number; className?: string }) {
  const icon = ICONIFY[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${icon.box} ${icon.box}`}
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}

const MORPH = {
  pause: ["M25 20 L42 20 L42 80 L25 80 Z", "M58 20 L75 20 L75 80 L58 80 Z"],
  play: ["M30 20 L76 46 L78 50 L30 50 Z", "M30 50 L78 50 L76 54 L30 80 Z"],
} as const;

/** Port of desktop `PlayPauseMorphIcon`: the two halves morph between play and pause. */
export function PlayPauseMorphIcon({ playing, size = 24 }: { playing: boolean; size?: number }) {
  const reduceMotion = useReducedMotion();
  const transition = `d ${reduceMotion ? "1ms" : "200ms"} cubic-bezier(0.16, 1, 0.3, 1)`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="ph-morph" aria-hidden>
      {MORPH[playing ? "pause" : "play"].map((d, i) => (
        <path
          key={i}
          d={d}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={6}
          strokeLinejoin="round"
          style={{ d: `path("${d}")`, transition } as CSSProperties}
        />
      ))}
    </svg>
  );
}
