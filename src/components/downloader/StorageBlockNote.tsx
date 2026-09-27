import { HardDrive } from "lucide-react";
import type { DownloadJob } from "../../downloadQueue";
import { mediaPathsMatch } from "../../lib/mediaPathMatch";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { NOT_ENOUGH_STORAGE_LABEL } from "../../storageFit";

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
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span
        className="flex items-center gap-1.5 text-[10px] font-semibold text-red-300/85"
        data-tooltip={tooltip}
      >
        <HardDrive size={11} strokeWidth={2.25} aria-hidden />
        {NOT_ENOUGH_STORAGE_LABEL}
      </span>
      {canCleanup && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void openAuthorizeCleanupModal();
          }}
          className="text-[10px] font-semibold text-stone-400 underline-offset-2 transition-colors hover:text-white hover:underline"
        >
          Free up space
        </button>
      )}
    </span>
  );
}
