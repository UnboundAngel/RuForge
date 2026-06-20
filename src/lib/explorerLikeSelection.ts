export type ExplorerClickModifiers = {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

export function applyExplorerLikeClick(
  orderedPaths: readonly string[],
  selected: ReadonlySet<string>,
  anchorPath: string | null,
  clickedPath: string,
  mods: ExplorerClickModifiers,
): { selected: Set<string>; anchorPath: string } {
  const clickedIndex = orderedPaths.indexOf(clickedPath);
  if (clickedIndex < 0) {
    return { selected: new Set(selected), anchorPath: anchorPath ?? clickedPath };
  }

  const toggle = mods.ctrlKey || mods.metaKey;

  if (mods.shiftKey && anchorPath) {
    const anchorIndex = orderedPaths.indexOf(anchorPath);
    if (anchorIndex >= 0) {
      const lo = Math.min(anchorIndex, clickedIndex);
      const hi = Math.max(anchorIndex, clickedIndex);
      const next = toggle ? new Set(selected) : new Set<string>();
      for (let i = lo; i <= hi; i += 1) {
        next.add(orderedPaths[i]!);
      }
      return { selected: next, anchorPath };
    }
  }

  if (toggle) {
    const next = new Set(selected);
    if (next.has(clickedPath)) {
      next.delete(clickedPath);
    } else {
      next.add(clickedPath);
    }
    return { selected: next, anchorPath: clickedPath };
  }

  return { selected: new Set([clickedPath]), anchorPath: clickedPath };
}
