import { SprayCrown } from "./SprayCrown";
import { StreetChain } from "./StreetChain";
import { StreetPoster } from "./StreetPoster";
import "./street.css";

function ExplicitSticker() {
  return (
    <div className="st-sticker">
      <div className="st-sticker-box">
        <span className="text-[5.4cqw] tracking-[0.04em]">EXPLICIT</span>
        <span className="mt-[0.6cqw] text-[1.9cqw] tracking-[0.3em]">CONTENT</span>
      </div>
    </div>
  );
}

export default function StreetOrnaments() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 [container-type:inline-size]" aria-hidden>
      <SprayCrown />
      <StreetPoster />
      <ExplicitSticker />
      <StreetChain />
    </div>
  );
}
