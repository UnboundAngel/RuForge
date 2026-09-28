import { raggedEdges } from "./jagged";
import "./punk.css";

const STRIP_CLIP = raggedEdges(60, 14, 7);
const STRIP_TEXT = Array.from({ length: 14 }, () => "DIY OR DIE \u2715 ").join("");

export default function PunkBackdrop() {
  return (
    <div className="pk-wall" aria-hidden>
      <div className="pk-dots" />
      <div className="pk-dots-alt" />
      <div className="pk-strip text-[clamp(18px,3.4vw,56px)] tracking-[0.06em]" style={{ clipPath: STRIP_CLIP }}>
        {STRIP_TEXT}
      </div>
      <div className="pk-grime" />
      <div className="pk-vignette" />
    </div>
  );
}
