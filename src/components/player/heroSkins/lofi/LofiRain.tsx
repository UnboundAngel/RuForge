function rand(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

type Drop = { left: string; len: string; dur: string; delay: string; alpha: number };

/** Independent streaks with seeded variation; a tiled pattern visibly repeats in step. */
function makeDrops(count: number, seed: number): Drop[] {
  return Array.from({ length: count }, (_, i) => {
    const r = (k: number) => rand(seed + i * 7.3 + k);
    const dur = 0.55 + r(1) * 0.5;
    return {
      left: `${(r(2) * 112).toFixed(2)}%`,
      len: `${(5 + r(3) * 9).toFixed(1)}cqh`,
      dur: `${dur.toFixed(2)}s`,
      delay: `${(-r(4) * dur * 4).toFixed(2)}s`,
      alpha: 0.25 + r(5) * 0.55,
    };
  });
}

const PANES = {
  main: makeDrops(70, 1),
  side: makeDrops(18, 91),
};

export function LofiRain({ pane }: { pane: keyof typeof PANES }) {
  return (
    <div className={`lf-rain lf-rain-${pane}`}>
      {PANES[pane].map((d, i) => (
        <span
          key={i}
          className="lf-drop"
          style={
            { left: d.left, height: d.len, opacity: d.alpha, "--dur": d.dur, "--delay": d.delay } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
