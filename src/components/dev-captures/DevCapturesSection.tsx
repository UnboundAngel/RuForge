import { useDevCapturesList } from "../../hooks/useDevCapturesList";
import { SearchableBlock, SettingsSection } from "../settings/settingsChrome";
import { DevCapturesGrid } from "./DevCapturesGrid";

export function DevCapturesSettingsSection() {
  const { entries, folderPath, loading, refresh } = useDevCapturesList(true);

  return (
    <SettingsSection
      variant="group"
      title="Dev captures"
      keywords="screenshot capture annotate diagnostics"
      intro={
        <p>
          Hover the RuForge icon in the top-left corner and click capture. Shots save to{" "}
          <span className="font-mono text-stone-400">{folderPath || "…"}</span>. Right-click the icon for edit last or
          this library.
        </p>
      }
    >
      <SearchableBlock keywords="screenshot capture annotate">
        {loading && entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">loading…</p>
        ) : (
          <DevCapturesGrid entries={entries} onRefresh={() => void refresh()} />
        )}
      </SearchableBlock>
    </SettingsSection>
  );
}
