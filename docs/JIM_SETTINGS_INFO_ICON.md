# Jim handoff: Settings info-icon descriptions

Chad landed click-to-toggle descriptions on the **Playback** tab (`SettingsTreeRow`, SponsorBlock tree). Legacy tabs still use inline descriptions on `SettingItem`.

## Apply globally (no logic changes)

- **General, Downloads, Appearance, Advanced:** every `SettingItem` row
- Hide the `<p>` description by default
- Add Iconify `mdi:information-variant-circle-outline` on the right
- **Click** icon toggles description open; stays open until click again
- Match hover/bg from existing `SettingItem` rows

Reference: [`src/components/settings/SettingsTreeRow.tsx`](../src/components/settings/SettingsTreeRow.tsx)

Do not change `updateSetting` keys, controls, or tab layout.
