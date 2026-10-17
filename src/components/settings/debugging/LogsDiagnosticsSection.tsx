import { DEBUG_LOG_INTRO, DebugLogCategoryTree } from "../DebugLogCategoryTree";
import { DevCapturesSettingsSection } from "../../dev-captures/DevCapturesSection";
import { SearchableBlock, SettingsSection } from "../settingsChrome";

export function LogsDiagnosticsSection({ showDevTools }: { showDevTools: boolean }) {
  return (
    <>
      <SettingsSection
        variant="group"
        title="Logs and diagnostics"
        keywords="log category verbose rust debug diagnostics"
        intro={DEBUG_LOG_INTRO}
      >
        <SearchableBlock keywords="log category verbose rust debug logging">
          <DebugLogCategoryTree />
        </SearchableBlock>
      </SettingsSection>
      {import.meta.env.DEV && showDevTools ? <DevCapturesSettingsSection /> : null}
    </>
  );
}
