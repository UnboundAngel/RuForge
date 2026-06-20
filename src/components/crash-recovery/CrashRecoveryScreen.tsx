import { RotateCcw } from "lucide-react";

import { CrashErrorDetails } from "./CrashErrorDetails";
import { CrashRecoveryHero } from "./CrashRecoveryHero";

export type CrashRecoveryVariant = "ui" | "fatal";

export const CRASH_RECOVERY_PREVIEW_SAMPLES: Record<
  CrashRecoveryVariant,
  { message: string; detail: string }
> = {
  ui: {
    message: "TypeError: Cannot read properties of undefined (reading 'map')",
    detail:
      "    at MediaView (src/components/MediaView.tsx:142:18)\n    at App (src/App.tsx:1804:19)\n    at renderWithHooks (react-dom.development.js:15486:18)",
  },
  fatal: {
    message: "Out of memory",
    detail:
      "The WebView2 renderer process exited unexpectedly.\n\nIf this keeps happening, close other apps or lower concurrent downloads in Settings.",
  },
};

type CrashRecoveryScreenProps = {
  variant: CrashRecoveryVariant;
  message: string;
  errorName?: string;
  detail: string;
  copyDetail?: string;
  onReload: () => void;
  preview?: boolean;
  className?: string;
};

export function CrashRecoveryScreen({
  variant,
  message,
  errorName,
  detail,
  copyDetail,
  onReload,
  preview = false,
  className,
}: CrashRecoveryScreenProps) {
  return (
    <div
      className={className ?? "rf-crash-screen fixed inset-0 z-[100000] flex flex-col overflow-hidden"}
      style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}
      data-rf-crash-recovery={variant}
      data-rf-crash-preview={preview ? "1" : undefined}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="rf-crash-recovery-title"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 20% 0%, var(--accent-glow), transparent 70%), radial-gradient(ellipse 50% 40% at 85% 100%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 65%)",
        }}
      />

      <div className="relative z-10 mx-auto h-full min-h-0 w-full max-w-2xl px-8">
        <div className="rf-crash-screen__primary absolute inset-0 flex flex-col items-center justify-center py-8 text-center">
          <div className="rf-crash-screen__primary-inner flex flex-col items-center">
            <CrashRecoveryHero variant={variant} />
            <button
              type="button"
              onClick={onReload}
              className="rf-crash-reload-btn mt-8"
            >
              <RotateCcw size={15} strokeWidth={2.25} aria-hidden />
              <span>Reload app</span>
            </button>
          </div>
        </div>

        <div className="rf-crash-screen__details rf-scrollbar absolute inset-x-0 bottom-0 px-8 pb-5 pt-1">
          <CrashErrorDetails
            message={message}
            errorName={errorName}
            detail={detail}
            copyDetail={copyDetail}
          />
        </div>
      </div>
    </div>
  );
}
