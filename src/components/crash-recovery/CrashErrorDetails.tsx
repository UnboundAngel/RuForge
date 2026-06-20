import { useMemo, useRef, useState, type MouseEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { trackEvent } from "@aptabase/tauri";
import { Copy, Check, ExternalLink } from "lucide-react";

import { CodeSnippetPanel } from "@/components/ui/CodeSnippetPanel";
import { copyPlainText } from "@/lib/copyPlainText";
import { getOrCreateInstallId } from "@/lib/telemetryInstallId";
import {
  crashBodyHtml,
  formatCrashMessage,
  parseCrashDetails,
} from "@/lib/parseCrashStack";
import { loadMergedSettings } from "@/store/types";

const ISSUES_NEW = "https://github.com/UnboundAngel/RuForge/issues/new";

type CrashErrorDetailsProps = {
  message: string;
  errorName?: string;
  detail: string;
  copyDetail?: string;
};

async function buildReportUrl(
  message: string,
  detail: string,
  errorName?: string,
): Promise<string> {
  let version = "unknown";
  try {
    version = await getVersion();
  } catch {
    /* dev / web */
  }
  const displayMessage = formatCrashMessage(message, errorName);
  const body = [
    "## What happened",
    displayMessage,
    "",
    "## Details",
    "```",
    detail.trim() || "(no stack trace)",
    "```",
    "",
    `**Version:** ${version}`,
  ].join("\n");

  const params = new URLSearchParams({
    title: `[crash] ${displayMessage.slice(0, 80)}`,
    body,
  });

  return `${ISSUES_NEW}?${params.toString()}`;
}

export function CrashErrorDetails({
  message,
  errorName,
  detail,
  copyDetail,
}: CrashErrorDetailsProps) {
  const parsed = useMemo(
    () => parseCrashDetails(message, detail, { errorName, copyDetail }),
    [message, detail, errorName, copyDetail],
  );
  const [copiedAll, setCopiedAll] = useState(false);
  const [reported, setReported] = useState(false);
  const hideCopiedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyAll = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const ok = await copyPlainText(parsed.fullText);
    if (!ok) return;
    setCopiedAll(true);
    if (hideCopiedRef.current) clearTimeout(hideCopiedRef.current);
    hideCopiedRef.current = setTimeout(() => setCopiedAll(false), 1600);
  };

  const handleReport = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const settings = loadMergedSettings();
    if (settings.telemetryCrashEnabled) {
      void trackEvent("crash_report_manual", {
        install_id: getOrCreateInstallId(),
        message: formatCrashMessage(message, errorName).slice(0, 200),
      });
    }
    await openUrl(await buildReportUrl(message, copyDetail ?? detail, errorName));
    setReported(true);
    setTimeout(() => setReported(false), 2200);
  };

  return (
    <section className="w-full text-left" aria-labelledby="rf-crash-error-details">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h2
          id="rf-crash-error-details"
          className="m-0 text-xs font-semibold"
          style={{ color: "var(--text)" }}
        >
          Error details
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rf-crash-details-action"
            onClick={(e) => void handleCopyAll(e)}
          >
            {copiedAll ? (
              <Check size={13} strokeWidth={2} aria-hidden />
            ) : (
              <Copy size={13} strokeWidth={1.75} aria-hidden />
            )}
            <span>{copiedAll ? "Copied" : "Copy all"}</span>
          </button>
          <button
            type="button"
            className="rf-crash-details-action rf-crash-details-action--accent"
            onClick={(e) => void handleReport(e)}
          >
            <ExternalLink size={13} strokeWidth={1.75} aria-hidden />
            <span>{reported ? "Opened" : "Report"}</span>
          </button>
        </div>
      </div>
      {parsed.sections.length > 0 ? (
        <div className="rf-crash-error-panels space-y-1.5">
          {parsed.sections.map((section) => (
            <CodeSnippetPanel
              key={section.id}
              file={section.file}
              languageLabel={section.languageLabel}
              lineHint={section.lineHint}
              caption={section.caption}
              html={crashBodyHtml(section.body)}
              copyText={section.body}
              defaultOpen={section.defaultOpen ?? false}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
