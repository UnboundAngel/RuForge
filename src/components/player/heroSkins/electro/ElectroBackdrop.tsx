import "./electro.css";

/** Stage behind the record: LED dot wall built from the cover, floor haze. */
export default function ElectroBackdrop({ coverSrc }: { coverSrc: string | null }) {
  return (
    <div className="ex-stage" aria-hidden>
      {coverSrc && (
        <div className="ex-led">
          <img src={coverSrc} alt="" />
          <div className="ex-led-tint" />
        </div>
      )}
      <div className="ex-haze" />
    </div>
  );
}
