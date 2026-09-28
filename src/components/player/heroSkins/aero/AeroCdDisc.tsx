import "./aero.css";

export default function AeroCdDisc({ coverSrc }: { coverSrc: string | null }) {
  return (
    <div className="ae-cd" aria-hidden>
      {coverSrc && (
        <div className="ae-cd-print">
          <img src={coverSrc} alt="" />
        </div>
      )}
    </div>
  );
}
