import "./street.css";

/** Brick wall behind the record, tinted by the cover, lit from above. */
export default function StreetBackdrop({ coverSrc }: { coverSrc: string | null }) {
  return (
    <div className="st-wall" aria-hidden>
      {coverSrc && <img src={coverSrc} alt="" className="st-wall-tint" />}
      <div className="st-wall-light" />
    </div>
  );
}
