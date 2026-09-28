import { useId } from "react";
import { jitter } from "./jagged";

/** Scissor-cut paper border in a 120-unit box where the cover spans 10..110: straight-ish cuts, skewed corners. */
const PAPER_PATH = (() => {
  const c = (i: number, base: number, dir: number) => (base + dir * (1 + jitter(i) * 3.5)).toFixed(2);
  const outer = `M${c(1, 10, -1)},${c(2, 10, -1)} L${c(3, 110, 1)},${c(4, 10, -1)} L${c(5, 110, 1)},${c(6, 110, 1)} L${c(7, 10, -1)},${c(8, 110, 1)} Z`;
  return `${outer} M11,11 L11,109 L109,109 L109,11 Z`;
})();

export function CutPaper() {
  const uid = useId().replace(/:/g, "");
  const shadowId = `rf-pk-paper-${uid}`;
  return (
    <svg className="absolute -inset-[10%] size-[120%] overflow-visible" viewBox="0 0 120 120" aria-hidden>
      <defs>
        <filter id={shadowId} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="1.2" dy="1.6" stdDeviation="0.8" floodColor="#000" floodOpacity="0.8" />
        </filter>
      </defs>
      <path d={PAPER_PATH} fillRule="evenodd" fill="#f1efe8" filter={`url(#${shadowId})`} />
    </svg>
  );
}
