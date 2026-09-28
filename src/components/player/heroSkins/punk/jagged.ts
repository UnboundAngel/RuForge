/** Deterministic 0..1 noise so cut edges are stable across renders. */
export function jitter(i: number) {
  const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
}

/** Clip-path polygon with ragged top and bottom edges (torn strips). */
export function raggedEdges(teeth: number, depth: number, seed = 0) {
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= teeth; i++) {
    const x = (i / teeth) * 100;
    top.push(`${x.toFixed(1)}% ${(jitter(seed + i) * depth).toFixed(1)}%`);
    bottom.unshift(`${x.toFixed(1)}% ${(100 - jitter(seed + 80 + i) * depth).toFixed(1)}%`);
  }
  return `polygon(${[...top, ...bottom].join(", ")})`;
}
