type ModeSwapListener = () => void;

const modeSwapListeners = new Set<ModeSwapListener>();

export function subscribeOnboardingModeSwap(listener: ModeSwapListener): () => void {
  modeSwapListeners.add(listener);
  return () => {
    modeSwapListeners.delete(listener);
  };
}

export function notifyOnboardingModeSwap(): void {
  for (const listener of modeSwapListeners) {
    listener();
  }
}

type OccupancyListener = () => void;

const occupancyListeners = new Set<OccupancyListener>();
let islandOccupied = false;

export function subscribeOnboardingIslandOccupiedChange(listener: OccupancyListener): () => void {
  occupancyListeners.add(listener);
  return () => {
    occupancyListeners.delete(listener);
  };
}

export function getOnboardingIslandOccupied(): boolean {
  return islandOccupied;
}

export function setOnboardingIslandOccupied(occupied: boolean): void {
  if (islandOccupied === occupied) return;
  islandOccupied = occupied;
  for (const listener of occupancyListeners) {
    listener();
  }
}
