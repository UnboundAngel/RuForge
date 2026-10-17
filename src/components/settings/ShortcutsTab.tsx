import { GamesShortcutsRows } from "@games";
import { cn } from "@/lib/utils";
import "../../styles/shortcuts-tab.css";
import { HOTKEY_ACTIONS, HOTKEY_GROUPS } from "../../lib/hotkeys";
import { resetAllHotkeys } from "../../hooks/useHotkeys";
import { isMacPlatform } from "../../lib/shortcutLabels";
import { askConfirm } from "../ConfirmDialog";
import { AppGlanceShortcutRows, LibraryGameShortcutRows } from "./GamesGatedShortcutRows";
import {
  FixedHotkeyKeys,
  HotkeyBindingControl,
  MOUSE_DOUBLE_CLICK,
  MOUSE_DRAG,
  MOUSE_SCROLL,
} from "./HotkeyBindingControl";
import { SettingItem, SettingsSection } from "./settingsChrome";

interface ShortcutsTabProps {
  isSearching: boolean;
  tabLabel: string;
  hasCustomBindings: boolean;
}

export function ShortcutsTab({ isSearching, tabLabel, hasCustomBindings }: ShortcutsTabProps) {
  return (
    <div
      className={cn(
        "rf-shortcuts-tab flex flex-col",
        isSearching && "rf-settings-search-group",
      )}
    >
      {isSearching ? <h3 className="rf-settings-search-group-title">{tabLabel}</h3> : null}
      <SettingsSection title="Customize" keywords="keyboard shortcuts hotkeys keybinds">
        <SettingItem
          title="Rebind any action"
          description="Click a key, then press the new one. Esc cancels, Backspace clears."
          control={
            <button
              type="button"
              disabled={!hasCustomBindings}
              onClick={() => {
                void askConfirm({
                  title: "Reset all shortcuts",
                  message: "Every action goes back to its default key.",
                  confirmLabel: "Reset",
                  tone: "accent",
                }).then((ok) => {
                  if (ok) resetAllHotkeys();
                });
              }}
              className="rf-settings-btn"
            >
              Reset all
            </button>
          }
        />
      </SettingsSection>
      {HOTKEY_GROUPS.map((group) => (
        <SettingsSection
          key={group.id}
          title={group.label}
          keywords={`keyboard shortcuts hotkeys ${group.keywords}`}
        >
          {HOTKEY_ACTIONS.filter((a) => a.group === group.id).map((action) => (
            <SettingItem
              key={action.id}
              title={action.label}
              description={action.description}
              control={<HotkeyBindingControl id={action.id} />}
            />
          ))}
          {group.id === "app" ? (
            <>
              <SettingItem
                title="Radial menu"
                description="Hold to open, move toward a section, release to go there."
                control={<FixedHotkeyKeys combos={[[isMacPlatform() ? "⌥" : "Alt"]]} />}
              />
              <SettingItem
                title="Close or go back"
                description="Closes the open dialog, menu, search or glance."
                control={<FixedHotkeyKeys combos={[["Esc"]]} />}
              />
              <AppGlanceShortcutRows />
            </>
          ) : null}
          {group.id === "library" ? <LibraryGameShortcutRows /> : null}
          {group.id === "player" ? (
            <>
              <SettingItem
                title="Seek to 10% through 90%"
                description="Number keys 1 to 9 jump to that tenth of the video."
                control={<FixedHotkeyKeys combos={[["1-9"]]} />}
              />
              <SettingItem
                title="Zoom paused frame"
                description="While paused, zooms up to 8x at the cursor. Playing resets it."
                control={<FixedHotkeyKeys combos={[["Ctrl", MOUSE_SCROLL]]} />}
              />
              <SettingItem
                title="Pan zoomed frame"
                description="Drag to move around while zoomed in."
                control={<FixedHotkeyKeys combos={[[MOUSE_DRAG]]} />}
              />
              <SettingItem
                title="Reset zoom"
                description="Back to 1x. Clicking the zoom badge does the same."
                control={<FixedHotkeyKeys combos={[["Esc"], [MOUSE_DOUBLE_CLICK]]} />}
              />
            </>
          ) : null}
          {group.id === "games" ? <GamesShortcutsRows /> : null}
        </SettingsSection>
      ))}
    </div>
  );
}
