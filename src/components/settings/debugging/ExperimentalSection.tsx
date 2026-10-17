import { useRuforgeStore } from "../../../store/ruforgeStore";
import { Switch } from "../../ui/Switch";
import { SettingItem, SettingsSection } from "../settingsChrome";

export function ExperimentalSection() {
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);

  return (
    <SettingsSection variant="group" title="Experimental" keywords="experimental toggles flags behavior">
      <SettingItem
        title="Notifications in island"
        description="The bell opens notifications inside the Dynamic Island. Tapping the empty island opens them too."
        keywords="bell dynamic island"
        active={settings.notificationsInIsland === true}
        control={
          <Switch
            checked={settings.notificationsInIsland === true}
            onChange={() =>
              void updateSetting("notificationsInIsland", settings.notificationsInIsland !== true)
            }
          />
        }
      />
      <SettingItem
        title="Hide songs from main library"
        description="Keep audio downloads and music playlists in Music mode only. The main Video Library shows movies and videos."
        keywords="audio music video library"
        control={
          <Switch
            checked={settings.hideAudioFromMainLibrary !== false}
            onChange={() =>
              void updateSetting("hideAudioFromMainLibrary", settings.hideAudioFromMainLibrary === false)
            }
          />
        }
      />
      <SettingItem
        title="Stamp artist tags on download"
        description="After audio downloads, copy MusicBrainz artist genres and MBID onto each track sidecar. Turn off to skip artist lookups during the session; run Enrich music metadata to backfill later."
        keywords="musicbrainz mbid genres sidecar"
        active={settings.stampTrackSidecarArtistTags !== false}
        control={
          <Switch
            checked={settings.stampTrackSidecarArtistTags !== false}
            onChange={() =>
              void updateSetting(
                "stampTrackSidecarArtistTags",
                settings.stampTrackSidecarArtistTags === false,
              )
            }
          />
        }
      />
    </SettingsSection>
  );
}
