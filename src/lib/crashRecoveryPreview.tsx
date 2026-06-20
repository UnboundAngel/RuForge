import { createContext, useContext } from "react";
import type { CrashRecoveryVariant } from "@/components/crash-recovery/CrashRecoveryScreen";

export const CrashRecoveryPreviewContext = createContext<CrashRecoveryVariant | null>(
  null,
);

export function useCrashRecoveryPreviewActive(): boolean {
  return useContext(CrashRecoveryPreviewContext) !== null;
}

export function useCrashRecoveryPreview(): CrashRecoveryVariant | null {
  return useContext(CrashRecoveryPreviewContext);
}
