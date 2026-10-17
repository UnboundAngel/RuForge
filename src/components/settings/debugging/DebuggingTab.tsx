import { CompanionDebugSection } from "./CompanionDebugSection";
import { DownloadReplaySection } from "./DownloadReplaySection";
import { ExperimentalSection } from "./ExperimentalSection";
import { LibraryToolsSection } from "./LibraryToolsSection";
import { LogsDiagnosticsSection } from "./LogsDiagnosticsSection";
import { ScreenPreviewsSection } from "./ScreenPreviewsSection";
import { UpdatesPreviewSection } from "./UpdatesPreviewSection";

/** Release work comes first, then previews, companion, library tools and toggles. The tall log tree and capture gallery go last. */
export function DebuggingTab({
  showDebuggingSettings,
  active,
}: {
  showDebuggingSettings: boolean;
  active: boolean;
}) {
  return (
    <>
      <UpdatesPreviewSection />
      <ScreenPreviewsSection />
      {showDebuggingSettings ? <CompanionDebugSection active={active} /> : null}
      <LibraryToolsSection />
      <ExperimentalSection />
      {import.meta.env.DEV ? <DownloadReplaySection active={active} /> : null}
      <LogsDiagnosticsSection showDevTools={showDebuggingSettings} />
    </>
  );
}
