import { useState } from "react";
import { useRuforgeStore } from "../../../store/ruforgeStore";
import { galleryScanRootsFromStore } from "../../../lib/libraryConfig";
import { RegroupPlaylistModal } from "../../RegroupPlaylistModal";
import { MigrateLibraryModal } from "../../MigrateLibraryModal";
import { MusicMetaBackfillModal } from "../../MusicMetaBackfillModal";
import { SettingItem, SettingsSection } from "../settingsChrome";

export function LibraryToolsSection() {
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const internalVault = useRuforgeStore((s) => s.internalVault);
  const libraryScanDirs = useRuforgeStore((s) => s.libraryScanDirs);
  const [regroupPlaylistOpen, setRegroupPlaylistOpen] = useState(false);
  const [migrateLibraryOpen, setMigrateLibraryOpen] = useState(false);
  const [musicMetaBackfillOpen, setMusicMetaBackfillOpen] = useState(false);

  return (
    <>
      <SettingsSection variant="group"
        title="Library tools"
        keywords="library migrate metadata sidecar playlist folder maintenance"
      >
        <SettingItem
          title="Enrich music metadata"
          description="Scan library audio for missing sidecars and patch legacy sidecars without artist genres. Always includes artist tag stamping."
          keywords="musicbrainz backfill genres"
          onClick={() => setMusicMetaBackfillOpen(true)}
        />
        <SettingItem
          title="Migrate library layout"
          description="Reorganize the flat media root into Videos/, Music/, and Playlists/ bucket folders with per-item subfolders. Preview first, then confirm to move."
          keywords="move folders buckets"
          onClick={() => setMigrateLibraryOpen(true)}
        />
        <SettingItem
          title="Group playlist downloads"
          description="Move flat playlist files into a numbered subfolder so Media shows one stack card."
          keywords="regroup stack"
          onClick={() => setRegroupPlaylistOpen(true)}
        />
      </SettingsSection>
      <RegroupPlaylistModal
        open={regroupPlaylistOpen}
        onClose={() => setRegroupPlaylistOpen(false)}
        customOutputDir={outputDir}
      />
      <MigrateLibraryModal
        open={migrateLibraryOpen}
        onClose={() => setMigrateLibraryOpen(false)}
        libraryRoot={internalVault}
      />
      <MusicMetaBackfillModal
        open={musicMetaBackfillOpen}
        onClose={() => setMusicMetaBackfillOpen(false)}
        roots={galleryScanRootsFromStore({ internalVault, libraryScanDirs })}
      />
    </>
  );
}
