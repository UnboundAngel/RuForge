import "./aero.css";

const BUBBLES = [
  { x: "-34%", y: "8%", size: 34, dur: 7, delay: 0 },
  { x: "-22%", y: "72%", size: 18, dur: 9, delay: 1.2 },
  { x: "-40%", y: "46%", size: 12, dur: 6, delay: 2.5 },
  { x: "108%", y: "14%", size: 26, dur: 8, delay: 0.6 },
  { x: "116%", y: "58%", size: 40, dur: 10, delay: 1.8 },
  { x: "104%", y: "86%", size: 14, dur: 7.5, delay: 3.1 },
  { x: "70%", y: "-14%", size: 16, dur: 8.5, delay: 2 },
  { x: "22%", y: "-12%", size: 10, dur: 6.5, delay: 0.3 },
];

export default function AeroOrnaments({ animate, coverSrc }: { animate: boolean; coverSrc: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {coverSrc && (
        <div className="ae-reflect">
          <img src={coverSrc} alt="" />
        </div>
      )}
      <div className="ae-shadow" />
      <div className="ae-gloss" />
      <div className="ae-bezel" />
      {BUBBLES.map(({ x, y, size, dur, delay }, i) => (
        <span
          key={i}
          className={`ae-bubble ${animate ? "ae-float" : ""}`}
          style={{ left: x, top: y, width: size, height: size, "--dur": `${dur}s`, "--delay": `-${delay}s` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
