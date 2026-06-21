import { invoke } from "@tauri-apps/api/core";
import type { DownloadJob } from "@/downloadQueue";
import type { MusicTrackInfo } from "@/lib/musicExploreTracks";
import { extractYouTubeVideoId } from "@/youtubeUrl";

export type PlaylistSidecarTrackKickoff = {
  url: string;
  id?: string | null;
  title: string;
};

export type PlaylistSidecarKickoff = {
  outputDir: string;
  folderName: string;
  listUrl: string;
  title: string;
  tracks: PlaylistSidecarTrackKickoff[];
};

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
