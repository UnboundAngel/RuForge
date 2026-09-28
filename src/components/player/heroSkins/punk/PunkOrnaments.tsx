import { CutPaper } from "./PunkBits";
import { RansomNote } from "./PunkRansom";
import "./punk.css";

export default function PunkOrnaments() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 [container-type:inline-size]" aria-hidden>
      <div className="pk-halftone" />
      <CutPaper />
      <RansomNote />
    </div>
  );
}
