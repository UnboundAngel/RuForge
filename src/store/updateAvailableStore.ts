import { create } from "zustand";

/** Bridge from App's updater state to the persistent "update available" chip (default rail, Music library panel). */
type UpdateAvailableState = {
  version: string | null;
  /** Settings > Debugging preview; wins over `version` so App re-publishing cannot clear it. */
  previewVersion: string | null;
  open: () => void;
};

export const useUpdateAvailableStore = create<UpdateAvailableState>(() => ({
  version: null,
  previewVersion: null,
  open: () => {},
}));
