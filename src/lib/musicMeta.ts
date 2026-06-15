import { invoke } from "@tauri-apps/api/core";

export interface MusicMetaYoutube {
  viewCount?: number | null;
  likeCount?: number | null;
  uploadDate?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
  sourceId?: string | null;
}

export interface MusicMetaSidecar {
  schemaVersion: number;
  enrichedAt: string;
  identitySource: string;
  canonicalArtist?: string | null;
  canonicalAlbum?: string | null;
  canonicalTitle?: string | null;
  year?: number | null;
  mbRecordingId?: string | null;
  mbReleaseId?: string | null;
  mbReleaseGroupId?: string | null;
  matchConfidence?: number | null;
  youtube?: MusicMetaYoutube | null;
  genres?: string[];
  artistMbId?: string | null;
}

export function ensureMusicMeta(
  mediaPath: string,
  force?: boolean,
  artistTags?: boolean,
): Promise<boolean> {
  return invoke<boolean>("ensure_music_meta", {
    mediaPath,
    force,
    artistTags,
  });
}

export function readMusicMeta(mediaPath: string): Promise<MusicMetaSidecar | null> {
  return invoke<MusicMetaSidecar | null>("read_music_meta", { mediaPath });
}

export function backfillMusicMeta(roots: string[]): Promise<number> {
  return invoke<number>("backfill_music_meta", { roots });
}

export interface ArtistInfo {
  mbId: string;
  name: string;
  /** "Person" | "Group" | "Orchestra" etc. */
  artistType?: string | null;
  /** Short MB disambiguation, e.g. "American rapper" */
  disambiguation?: string | null;
  /** City of origin from MB begin-area */
  originCity?: string | null;
  /** Two-letter country code, e.g. "US" */
  country?: string | null;
  /** Up to 5 top genre tag names */
  genres: string[];
}

export function getArtistInfo(artistName: string): Promise<ArtistInfo | null> {
  return invoke<ArtistInfo | null>("get_artist_info", { artistName });
}

export interface ArtistMetaSidecar {
  schemaVersion: number;
  fetchedAt: string;
  mbId: string;
  name: string;
  artistType?: string | null;
  disambiguation?: string | null;
  originCity?: string | null;
  country?: string | null;
  genres: string[];
}

function sidecarToArtistInfo(sidecar: ArtistMetaSidecar): ArtistInfo {
  return {
    mbId: sidecar.mbId,
    name: sidecar.name,
    artistType: sidecar.artistType ?? null,
    disambiguation: sidecar.disambiguation ?? null,
    originCity: sidecar.originCity ?? null,
    country: sidecar.country ?? null,
    genres: sidecar.genres ?? [],
  };
}

export async function readArtistMetaSidecar(artistName: string): Promise<ArtistInfo | null> {
  const sidecar = await invoke<ArtistMetaSidecar | null>("read_artist_meta_sidecar", { artistName });
  return sidecar ? sidecarToArtistInfo(sidecar) : null;
}

export function ensureArtistMetaSidecar(artistName: string, force?: boolean): Promise<boolean> {
  return invoke<boolean>("ensure_artist_meta_sidecar", { artistName, force });
}
