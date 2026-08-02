export type GalleryColdFetchStats = {
  ensureCalls: number;
  fetchStarts: number;
  fetchJoinedCold: number;
};

let stats: GalleryColdFetchStats = {
  ensureCalls: 0,
  fetchStarts: 0,
  fetchJoinedCold: 0,
};

let gallerySessionHadColdScan = false;
let galleryColdFetchPromise: Promise<void> | null = null;

export function getGalleryColdFetchStats(): GalleryColdFetchStats {
  return { ...stats };
}

export function resetGalleryColdFetchForTests(): void {
  stats = { ensureCalls: 0, fetchStarts: 0, fetchJoinedCold: 0 };
  gallerySessionHadColdScan = false;
  galleryColdFetchPromise = null;
}

export function noteGalleryFetchStart(): void {
  stats.fetchStarts += 1;
}

export function tryJoinColdGalleryFetch(): Promise<void> | null {
  if (!galleryColdFetchPromise) return null;
  stats.fetchJoinedCold += 1;
  return galleryColdFetchPromise;
}

export function isGalleryColdFetchInFlight(): boolean {
  return galleryColdFetchPromise !== null;
}

type QuietFetchOpts = {
  manageLoadingStart?: boolean;
  skipPosterBackfill?: boolean;
  skipScrubBackfill?: boolean;
  joinColdInFlight?: boolean;
  forceReindex?: boolean;
};

export async function runEnsureGalleryOnViewMount(opts: {
  forceCold?: boolean;
  fetchEntries: (fetchOpts?: QuietFetchOpts) => Promise<void>;
}): Promise<void> {
  stats.ensureCalls += 1;
  const explicitCold = opts.forceCold === true;

  if (explicitCold) {
    gallerySessionHadColdScan = true;
    if (galleryColdFetchPromise) {
      await galleryColdFetchPromise;
      return;
    }
    await opts.fetchEntries({ forceReindex: true });
    return;
  }

  if (galleryColdFetchPromise) {
    await galleryColdFetchPromise;
    return;
  }

  if (gallerySessionHadColdScan) {
    void opts.fetchEntries({
      manageLoadingStart: false,
      skipPosterBackfill: true,
      skipScrubBackfill: true,
      joinColdInFlight: true,
    });
    return;
  }

  gallerySessionHadColdScan = true;
  const run = opts.fetchEntries();
  galleryColdFetchPromise = run;
  try {
    await run;
  } finally {
    if (galleryColdFetchPromise === run) {
      galleryColdFetchPromise = null;
    }
  }
}
