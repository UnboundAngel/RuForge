import { jitter } from "./jagged";

type Cutout = { c: string; bg: string; fg: string; font: string; rot: number; size: number; style?: "italic" | "bold" };

const WORDS: Cutout[][] = [
  [
    { c: "P", bg: "#f5e400", fg: "#111", font: "Impact, sans-serif", rot: -6, size: 12.5 },
    { c: "L", bg: "#fff", fg: "#111", font: "Georgia, serif", rot: 4, size: 11, style: "italic" },
    { c: "A", bg: "#111", fg: "#fff", font: "'Arial Black', sans-serif", rot: -3, size: 11.5 },
    { c: "Y", bg: "#ff2e88", fg: "#fff", font: "'Times New Roman', serif", rot: 7, size: 12 },
  ],
  [
    { c: "L", bg: "#fff", fg: "#e0161b", font: "'Courier New', monospace", rot: -5, size: 11, style: "bold" },
    { c: "O", bg: "#111", fg: "#f5e400", font: "Impact, sans-serif", rot: 3, size: 13 },
    { c: "U", bg: "#e9e1cf", fg: "#111", font: "Georgia, serif", rot: -8, size: 10.5 },
    { c: "D", bg: "#ff2e88", fg: "#111", font: "'Arial Black', sans-serif", rot: 5, size: 12 },
  ],
];

/** Uneven scissor cut per letter. */
function cutClip(i: number) {
  const j = (k: number) => (jitter(i * 7 + k) * 9).toFixed(1);
  return `polygon(${j(1)}% ${j(2)}%, ${100 - Number(j(3))}% ${j(4)}%, ${100 - Number(j(5))}% ${100 - Number(j(6))}%, ${j(7)}% ${100 - Number(j(8))}%)`;
}

export function RansomNote() {
  let n = 0;
  return (
    <div
      className="absolute flex items-end gap-[3cqw]"
      style={{ left: "-9%", bottom: "-15%", transform: "rotate(-4deg)" }}
    >
      {WORDS.map((word, w) => (
        <div key={w} className="flex items-end">
          {word.map(({ c, bg, fg, font, rot, size, style }) => {
            const i = n++;
            return (
              <span
                key={i}
                className="pk-letter"
                style={{
                  background: bg,
                  color: fg,
                  fontFamily: font,
                  fontSize: `${size}cqw`,
                  fontStyle: style === "italic" ? "italic" : undefined,
                  fontWeight: style === "bold" ? 700 : 900,
                  transform: `rotate(${rot}deg)`,
                  clipPath: cutClip(i),
                }}
              >
                {c}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
