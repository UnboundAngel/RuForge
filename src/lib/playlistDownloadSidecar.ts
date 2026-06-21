import { invoke } from "@tauri-apps/api/core";
import type { DownloadJob } from "@/downloadQueue";
import type { MusicExploreHarvestedTracklist } from "@/lib/musicExploreTracklistHarvest";
import type { MusicExplorePageContext } from "@/lib/musicExplorePageContext";
import type { MusicPlaylistPage, PlaylistKind } from "@/lib/musicExploreTracks";
import type { MusicTrackInfo } from "@/lib/musicExploreTracks";
import { extractYouTubeVideoId, extractYouTubePlaylistId } from "@/youtubeUrl";
import { throttleMusicExplorePageFetch } from "@/lib/ytdlpPageFetchThrottle";

export type PlaylistSidecarTrackKickoff = {
  url: string;
  id?: string | null;
  title: string;
};

export type PlaylistSidecarMetadata = {
  coverUrl?: string | null;
  playlistKind?: PlaylistKind | null;
  declaredTrackCount?: number | null;
  curatorName?: string | null;
  curatorId?: string | null;
  curatorUrl?: string | null;
  browseEntityUrl?: string | null;
  releaseYear?: number | null;
};

export type PlaylistSidecarKickoff = {
  outputDir: string;
  folderName: string;
  listUrl: string;
  title: string;
  tracks: PlaylistSidecarTrackKickoff[];
  metadata?: PlaylistSidecarMetadata;
};

export type PlaylistSidecarRead = {
  schemaVersion: number;
  listUrl: string;
  title: string;
  coverUrl?: string | null;
  playlistKind?: PlaylistKind | string | null;
  declaredTrackCount?: number | null;
  curatorName?: string | null;
  curatorId?: string | null;
  curatorUrl?: string | null;
  browseEntityUrl?: string | null;
  releaseYear?: number | null;
  tracks: Array<{
    url?: string | null;
    id?: string | null;
    title: string;
    status: string;
  }>;
  status: string;
};

export type PlaylistSidecarLookup = {
  outputDir: string;
  folderName: string;
  sidecar: PlaylistSidecarRead;
};

export type PlaylistSidecarLocation = {
  outputDir: string;
  folderName: string;
};

export function isStalePlaylistCoverUrl(url: string | null | undefined): boolean {
  const u = url?.trim();
  if (!u) return true;
  if (u.includes("?")) return false;
  if (/maxresdefault\.jpg$/i.test(u)) return true;
  if (/ytimg\.com\/s_p\//i.test(u)) return true;
  return false;
}

export function isUsablePlaylistCoverUrl(url: string | null | undefined): boolean {
  const u = url?.trim();
  return Boolean(u) && !isStalePlaylistCoverUrl(u);
}

export function playlistSidecarLocationFromTrackPath(path: string): PlaylistSidecarLocation | null {
  const normalized = path.replace(/\\/g, "/");
  const match = normalized.match(/^(.*)\/Playlists\/([^/]+)\//i);
  if (!match) return null;
  const outputDir = match[1]!.trim();
  const folderName = match[2]!.trim();
  if (!outputDir || !folderName) return null;
  return { outputDir, folderName };
}

function effectivePlaylistCoverUrl(
  base?: string | null,
  patch?: string | null,
): string | null {
  const baseTrim = base?.trim() || null;
  const patchTrim = patch?.trim() || null;
  const baseOk = baseTrim && !isStalePlaylistCoverUrl(baseTrim) ? baseTrim : null;
  const patchOk = patchTrim && !isStalePlaylistCoverUrl(patchTrim) ? patchTrim : null;
  return patchOk || baseOk || null;
}

function isMpadBrowseUrl(url: string | null | undefined): boolean {
  return Boolean(url?.trim() && /music\.youtube\.com\/browse\/MPAD/i.test(url));
}

export function inferPlaylistKindFromListUrl(
  listUrl: string,
  hints?: {
    pageKind?: MusicExplorePageContext["kind"];
    shelfKind?: MusicExploreHarvestedTracklist["shelfKind"];
  },
): PlaylistKind {
  const listId = extractYouTubePlaylistId(listUrl);
  if (listId?.startsWith("OLAK") || listId?.startsWith("OL")) return "album";
  if (listId?.startsWith("RD")) return "mix";
  if (listId?.startsWith("PL")) return "userPlaylist";
  if (isMpadBrowseUrl(listUrl)) return "album";
  if (hints?.shelfKind === "musicShelfRenderer") return "album";
  if (hints?.pageKind === "album") return "album";
  if (hints?.pageKind === "playlist") return "userPlaylist";
  return "unknown";
}

export function browseEntityUrlFromHarvest(
  harvest: MusicExploreHarvestedTracklist | null | undefined,
  listUrl: string,
): string | null {
  const browse = harvest?.browseTargetUrl?.trim();
  if (browse && isMpadBrowseUrl(browse)) return browse;
  if (isMpadBrowseUrl(listUrl)) return listUrl.trim();
  return null;
}

export function sidecarMetadataFromHarvest(
  listUrl: string,
  harvest: MusicExploreHarvestedTracklist | null | undefined,
  pageContext?: Pick<MusicExplorePageContext, "kind">,
): PlaylistSidecarMetadata {
  return {
    playlistKind: inferPlaylistKindFromListUrl(listUrl, {
      pageKind: pageContext?.kind,
      shelfKind: harvest?.shelfKind ?? null,
    }),
    declaredTrackCount: harvest?.headerTrackCount ?? null,
    browseEntityUrl: browseEntityUrlFromHarvest(harvest, listUrl),
    curatorName: null,
  };
}

export function sidecarMetadataFromPlaylistPage(
  page: MusicPlaylistPage,
  listUrl: string,
): PlaylistSidecarMetadata {
  return {
    coverUrl: page.coverUrl?.trim() || null,
    playlistKind: page.playlistKind ?? inferPlaylistKindFromListUrl(listUrl),
    declaredTrackCount: page.declaredTrackCount ?? page.total ?? null,
    curatorName: page.curatorName?.trim() || null,
    curatorId: page.curatorId?.trim() || null,
    curatorUrl: page.curatorUrl?.trim() || null,
    browseEntityUrl: page.browseEntityUrl?.trim() || null,
    releaseYear: page.releaseYear ?? null,
  };
}

export function mergePlaylistSidecarMetadata(
  base: PlaylistSidecarMetadata,
  patch: PlaylistSidecarMetadata,
): PlaylistSidecarMetadata {
  return {
    coverUrl: effectivePlaylistCoverUrl(base.coverUrl, patch.coverUrl),
    playlistKind: patch.playlistKind ?? base.playlistKind ?? null,
    declaredTrackCount: patch.declaredTrackCount ?? base.declaredTrackCount ?? null,
    curatorName: patch.curatorName?.trim() || base.curatorName?.trim() || null,
    curatorId: patch.curatorId?.trim() || base.curatorId?.trim() || null,
    curatorUrl: patch.curatorUrl?.trim() || base.curatorUrl?.trim() || null,
    browseEntityUrl: patch.browseEntityUrl?.trim() || base.browseEntityUrl?.trim() || null,
    releaseYear: patch.releaseYear ?? base.releaseYear ?? null,
  };
}

export function sidecarMetadataFromRead(sidecar: PlaylistSidecarRead): PlaylistSidecarMetadata {
  return {
    coverUrl: sidecar.coverUrl?.trim() || null,
    playlistKind: (sidecar.playlistKind as PlaylistKind | null) ?? null,
    declaredTrackCount: sidecar.declaredTrackCount ?? null,
    curatorName: sidecar.curatorName?.trim() || null,
    curatorId: sidecar.curatorId?.trim() || null,
    curatorUrl: sidecar.curatorUrl?.trim() || null,
    browseEntityUrl: sidecar.browseEntityUrl?.trim() || null,
    releaseYear: sidecar.releaseYear ?? null,
  };
}

export function sidecarCoverNeedsHeal(coverUrl: string | null | undefined): boolean {
  return isStalePlaylistCoverUrl(coverUrl);
}

export function sidecarTracksFromMusicTrackInfo(
  tracks: MusicTrackInfo[],
): PlaylistSidecarTrackKickoff[] {
  return tracks.map((track) => {
    const url = track.url.trim();
    const id = track.id?.trim() || extractYouTubeVideoId(url) || null;
    return {
      url,
      id,
      title: track.title.trim() || url,
    };
  });
}

function metadataInvokePayload(metadata?: PlaylistSidecarMetadata) {
  if (!metadata) return undefined;
  return {
    coverUrl: metadata.coverUrl?.trim() || null,
    playlistKind: metadata.playlistKind ?? null,
    declaredTrackCount: metadata.declaredTrackCount ?? null,
    curatorName: metadata.curatorName?.trim() || null,
    curatorId: metadata.curatorId?.trim() || null,
    curatorUrl: metadata.curatorUrl?.trim() || null,
    browseEntityUrl: metadata.browseEntityUrl?.trim() || null,
    releaseYear: metadata.releaseYear ?? null,
  };
}

export function kickoffPlaylistDownloadSidecar(input: PlaylistSidecarKickoff): Promise<void> {
  return invoke("kickoff_playlist_download_sidecar", {
    outputDir: input.outputDir,
    folderName: input.folderName,
    listUrl: input.listUrl,
    title: input.title,
    tracks: input.tracks.map((t) => ({
      url: t.url,
      id: t.id ?? null,
      title: t.title,
    })),
    metadata: metadataInvokePayload(input.metadata) ?? null,
  });
}

export function updatePlaylistDownloadSidecarMetadata(input: {
  outputDir: string;
  folderName: string;
  metadata: PlaylistSidecarMetadata;
}): Promise<void> {
  return invoke("update_playlist_download_sidecar_metadata", {
    outputDir: input.outputDir,
    folderName: input.folderName,
    metadata: metadataInvokePayload(input.metadata),
  });
}

export async function fetchPlaylistRootMetaPage(
  listUrl: string,
  browserCookies: string | null,
  cookieFile: string | null,
): Promise<MusicPlaylistPage> {
  await throttleMusicExplorePageFetch();
  return invoke<MusicPlaylistPage>("get_playlist_items_page", {
    url: listUrl,
    offset: 0,
    limit: 1,
    browserCookies,
    cookieFile,
  });
}

export function readPlaylistDownloadSidecar(
  outputDir: string,
  folderName: string,
): Promise<PlaylistSidecarRead | null> {
  return invoke<PlaylistSidecarRead | null>("read_playlist_download_sidecar", {
    outputDir,
    folderName,
  });
}

export function findPlaylistSidecarByListUrl(
  scanRoots: string[],
  listUrl: string,
): Promise<PlaylistSidecarLookup | null> {
  return invoke<PlaylistSidecarLookup | null>("find_playlist_sidecar_by_list_url", {
    scanRoots,
    listUrl,
  });
}

export async function healPlaylistSidecarCover(input: {
  outputDir: string;
  folderName: string;
  listUrl: string;
  browserCookies: string | null;
  cookieFile: string | null;
  known?: PlaylistSidecarMetadata;
}): Promise<boolean> {
  try {
    const page = await fetchPlaylistRootMetaPage(
      input.listUrl,
      input.browserCookies,
      input.cookieFile,
    );
    const patch = sidecarMetadataFromPlaylistPage(page, input.listUrl);
    if (!isUsablePlaylistCoverUrl(patch.coverUrl)) return false;
    const merged = mergePlaylistSidecarMetadata(input.known ?? {}, patch);
    if (!isUsablePlaylistCoverUrl(merged.coverUrl)) return false;
    const hasPatch = Boolean(
      merged.coverUrl
      || merged.curatorName
      || merged.curatorId
      || merged.curatorUrl
      || merged.releaseYear
      || merged.browseEntityUrl,
    );
    if (!hasPatch) return false;
    await updatePlaylistDownloadSidecarMetadata({
      outputDir: input.outputDir,
      folderName: input.folderName,
      metadata: merged,
    });
    return isUsablePlaylistCoverUrl(merged.coverUrl);
  } catch {
    return false;
  }
}

export async function applyPlaylistSidecarRootMetaBackfill(input: {
  outputDir: string;
  folderName: string;
  listUrl: string;
  browserCookies: string | null;
  cookieFile: string | null;
  known?: PlaylistSidecarMetadata;
}): Promise<void> {
  const page = await fetchPlaylistRootMetaPage(
    input.listUrl,
    input.browserCookies,
    input.cookieFile,
  );
  const patch = sidecarMetadataFromPlaylistPage(page, input.listUrl);
  const merged = mergePlaylistSidecarMetadata(input.known ?? {}, patch);
  const hasPatch = Boolean(
    merged.coverUrl
    || merged.curatorName
    || merged.curatorId
    || merged.curatorUrl
    || merged.releaseYear
    || merged.browseEntityUrl,
  );
  if (!hasPatch) return;
  await updatePlaylistDownloadSidecarMetadata({
    outputDir: input.outputDir,
    folderName: input.folderName,
    metadata: merged,
  });
}

export function schedulePlaylistSidecarRootMetaBackfill(input: {
  outputDir: string;
  folderName: string;
  listUrl: string;
  browserCookies: string | null;
  cookieFile: string | null;
  known?: PlaylistSidecarMetadata;
}): void {
  void applyPlaylistSidecarRootMetaBackfill(input).catch(() => {
    /* sidecar is best-effort */
  });
}

function isMusicExplorePlaylistBatchIdle(jobs: DownloadJob[], folderName: string): boolean {
  return !jobs.some(
    (j) =>
      j.options.playlistOutputFolder === folderName
      && (j.status === "queued" || j.status === "downloading" || j.status === "paused"),
  );
}

export function updatePlaylistDownloadSidecarFromJob(
  jobs: DownloadJob[],
  job: Pick<DownloadJob, "url" | "options">,
  status: "done" | "failed",
): void {
  const folderName = job.options.playlistOutputFolder?.trim();
  const outputDir = job.options.outputDir?.trim();
  if (!folderName || !outputDir) return;

  const trackUrl = job.url.trim();
  const trackId = extractYouTubeVideoId(trackUrl);
  const batchIdle = isMusicExplorePlaylistBatchIdle(jobs, folderName);

  void invoke("update_playlist_download_sidecar_track", {
    outputDir,
    folderName,
    trackUrl,
    trackId: trackId ?? null,
    status,
    batchIdle,
  }).catch(() => {
    /* sidecar is best-effort */
  });
}
