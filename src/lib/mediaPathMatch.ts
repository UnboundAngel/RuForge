/** Windows-safe path compare for gallery rows vs Rust/ffmpeg paths. */
export function mediaPathsMatch(a: string, b: string): boolean {
  return a.replace(/\//g, "\\").toLowerCase() === b.replace(/\//g, "\\").toLowerCase();
}

export function isPathInExtractingSet(
  filePath: string,
  extractingByPath: Record<string, boolean>,
): boolean {
  return Object.keys(extractingByPath).some(
    (p) => extractingByPath[p] && mediaPathsMatch(p, filePath),
  );
}
