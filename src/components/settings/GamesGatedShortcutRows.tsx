import { GAMES_ENABLED } from "@games";
import { FixedHotkeyKeys, MOUSE_RIGHT_CLICK } from "./HotkeyBindingControl";
import { SettingItem } from "./settingsChrome";

/** Fixed chords in the App group; the glance ones only exist when Games is in the build. */
export function AppGlanceShortcutRows() {
  return (
    <>
      {GAMES_ENABLED ? (
        <SettingItem
          title="Reload glance"
          description="Reloads the page open in glance."
          control={<FixedHotkeyKeys combos={[["Ctrl", "R"], ["F5"]]} />}
        />
      ) : null}
      <SettingItem
        title="Find on page"
        description={
          GAMES_ENABLED
            ? "Finds text on the current page, or the page open in glance. Enter and Shift+Enter step through matches."
            : "Finds text on the current page. Enter and Shift+Enter step through matches."
        }
        control={<FixedHotkeyKeys combos={[["Ctrl", "F"]]} />}
      />
      {GAMES_ENABLED ? (
        <>
          <SettingItem
            title="Back and forward in glance"
            description="Moves through the pages you opened inside glance."
            control={<FixedHotkeyKeys combos={[["Alt", "←"], ["Alt", "→"]]} />}
          />
          <SettingItem
            title="Guide options"
            description="On a guide card: open it in glance or your browser, or pick how that site always opens."
            control={<FixedHotkeyKeys combos={[[MOUSE_RIGHT_CLICK]]} />}
          />
        </>
      ) : null}
    </>
  );
}

export function LibraryGameShortcutRows() {
  if (!GAMES_ENABLED) return null;
  return (
    <>
      <SettingItem
        title="Move through game results"
        description="In Add a game, steps the highlight across the posters."
        control={<FixedHotkeyKeys combos={[["←"], ["↑"], ["→"], ["↓"]]} />}
      />
      <SettingItem
        title="Add the picked game"
        description="Adds the highlighted game, or the top match when nothing is highlighted."
        control={<FixedHotkeyKeys combos={[["Enter"]]} />}
      />
    </>
  );
}
