/** Dev-only: open whatever is mounted on the stats extra scheduled slot. */

type PreviewFn = () => void;

let preview: PreviewFn | null = null;

export function registerStatsExtraSlotPreview(fn: PreviewFn): () => void {
  preview = fn;
  return () => {
    if (preview === fn) preview = null;
  };
}

export function requestStatsExtraSlotPreview(): void {
  preview?.();
}
