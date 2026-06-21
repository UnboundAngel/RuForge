import { useEffect, useState } from "react";
import { galleryScanRoots } from "@/libraryScanDirs";
import {
  findPlaylistSidecarByListUrl,
  healPlaylistSidecarCover,
  readPlaylistDownloadSidecar,
  sidecarCoverNeedsHeal,
  sidecarMetadataFromRead,
  type PlaylistSidecarLocation,
  type PlaylistSidecarLookup,
  type PlaylistSidecarRead,
} from "@/lib/playlistDownloadSidecar";
import { useRuforgeStore } from "@/store/ruforgeStore";

export function usePlaylistSidecarByListUrl(listUrl: string | null): PlaylistSidecarLookup | null {
  const libraryScanDirs = useRuforgeStore((s) => s.libraryScanDirs);
  const libraryScanRevision = useRuforgeStore((s) => s.libraryScanRevision);
  const [lookup, setLookup] = useState<PlaylistSidecarLookup | null>(null);

  useEffect(() => {
    if (!listUrl?.trim()) {
      setLookup(null);
      return;
    }
    let cancelled = false;
    const roots = galleryScanRoots(libraryScanDirs);
    void findPlaylistSidecarByListUrl(roots, listUrl).then((result) => {
      if (!cancelled) setLookup(result);
    });
    return () => {
      cancelled = true;
    };
  }, [listUrl, libraryScanDirs, libraryScanRevision]);

  return lookup;
}

export function usePlaylistSidecarAtLocation(
  location: PlaylistSidecarLocation | null,
  options?: { healStaleCover?: boolean },
): PlaylistSidecarRead | null {
  const healStaleCover = options?.healStaleCover === true;
  const settings = useRuforgeStore((s) => s.settings);
  const [sidecar, setSidecar] = useState<PlaylistSidecarRead | null>(null);

  useEffect(() => {
    if (!location) {
      setSidecar(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const dto = await readPlaylistDownloadSidecar(location.outputDir, location.folderName);
      if (cancelled) return;
      setSidecar(dto);
      if (!healStaleCover || !dto?.listUrl?.trim() || !sidecarCoverNeedsHeal(dto.coverUrl)) {
        return;
      }
      const healed = await healPlaylistSidecarCover({
        outputDir: location.outputDir,
        folderName: location.folderName,
        listUrl: dto.listUrl,
        browserCookies: settings.browserContext ?? null,
        cookieFile: settings.cookieFile ?? null,
        known: sidecarMetadataFromRead(dto),
      });
      if (!healed || cancelled) return;
      const updated = await readPlaylistDownloadSidecar(location.outputDir, location.folderName);
      if (!cancelled) setSidecar(updated);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    location?.outputDir,
    location?.folderName,
    healStaleCover,
    settings.browserContext,
    settings.cookieFile,
  ]);

  return sidecar;
}
