import { useEffect } from "react";
import type { UpdaterPhase } from "@/components/UpdaterLayers";
import { useUpdateAvailableStore } from "@/store/updateAvailableStore";

/** Publishes the pending update (only while `available`) so the rail and music strip buttons can show it. */
export function useUpdateAvailableBridge(
  phase: UpdaterPhase,
  version: string | null,
  open: () => void,
) {
  useEffect(() => {
    useUpdateAvailableStore.setState({
      version: phase === "available" ? version : null,
      open,
    });
  }, [phase, version, open]);
}
