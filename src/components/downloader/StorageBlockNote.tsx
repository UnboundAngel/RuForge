import type { DownloadJob } from "../../downloadQueue";
import { mediaPathsMatch } from "../../lib/mediaPathMatch";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { NOT_ENOUGH_STORAGE_LABEL } from "../../storageFit";

/** Red border for a queued row the storage gate is holding back. */
export const STORAGE_BLOCK_ROW_CLASS = "ring-1 ring-inset ring-red-500/70";

type Props = {
  job: DownloadJob;
  className?: string;
};

export function StorageBlockNote({ job, className = "" }: Props) {
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const internalVault = useRuforgeStore((s) => s.internalVault);
  const openAuthorizeCleanupModal = useRuforgeStore((s) => s.openAuthorizeCleanupModal);
  if (!job.storageBlock) return null;

  // Cleanup only deletes vault files, so it cannot help a job bound for another folder.
  const canCleanup =
    saveToInternal && mediaPathsMatch(job.options.outputDir.trim(), internalVault.trim());
  const tooltip =
    job.storageBlock === "cap"
      ? "This download would pass your library storage limit. It starts on its own once there is room."
      : "The download folder's disk is too full for this file. It starts on its own once there is room.";

  return (
    <span className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] ${className}`}>
      <span className="text-red-400" data-tooltip={tooltip}>
        {NOT_ENOUGH_STORAGE_LABEL}
      </span>
      {canCleanup && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void openAuthorizeCleanupModal();
          }}
          className="text-stone-400 underline decoration-stone-600 underline-offset-2 transition-colors hover:text-white"
        >
          Authorize Cleanup
        </button>
      )}
    </span>
  );
}
