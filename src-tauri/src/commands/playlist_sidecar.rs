use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const SIDECAR_SCHEMA_VERSION: u32 = 1;
const SIDECAR_FILENAME: &str = ".ruforge-playlist.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSidecarTrackDto {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub title: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSidecarDto {
    pub schema_version: u32,
    pub list_url: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    pub tracks: Vec<PlaylistSidecarTrackDto>,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSidecarTrackInput {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
    pub title: String,
}

fn write_json_sidecar<T: Serialize>(path: &Path, dto: &T) -> Result<(), String> {
    let json = serde_json::to_string_pretty(dto).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, json).map_err(|e| e.to_string())
}

pub fn sidecar_path_for(output_dir: &str, folder_name: &str) -> PathBuf {
    PathBuf::from(output_dir)
        .join("Playlists")
        .join(folder_name)
        .join(SIDECAR_FILENAME)
}

fn normalize_youtube_id(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.len() == 11
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Some(trimmed.to_string());
    }
    let lower = trimmed.to_ascii_lowercase();
    if let Some(idx) = lower.find("v=") {
        let tail = &trimmed[idx + 2..];
        let end = tail
            .find(['&', '#', '?'])
            .map(|i| &tail[..i])
            .unwrap_or(tail)
            .trim();
        if end.len() == 11 {
            return Some(end.to_string());
        }
    }
    if let Some(idx) = lower.find("/watch/") {
        let tail = &trimmed[idx + "/watch/".len()..];
        let id = tail
            .split(['/', '?', '#', '&'])
            .next()
            .unwrap_or("")
            .trim();
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    None
}

fn track_matches(entry: &PlaylistSidecarTrackDto, track_url: Option<&str>, track_id: Option<&str>) -> bool {
    if let Some(id) = track_id.filter(|s| !s.trim().is_empty()) {
        if entry.id.as_deref().map(str::trim) == Some(id.trim()) {
            return true;
        }
        if entry
            .url
            .as_deref()
            .and_then(|u| normalize_youtube_id(u))
            .as_deref()
            == Some(id.trim())
        {
            return true;
        }
    }
    if let Some(url) = track_url.filter(|s| !s.trim().is_empty()) {
        let want_id = normalize_youtube_id(url);
        if entry.url.as_deref().map(str::trim) == Some(url.trim()) {
            return true;
        }
        if let Some(want_id) = want_id.as_deref() {
            if entry.id.as_deref().map(str::trim) == Some(want_id) {
                return true;
            }
            if entry
                .url
                .as_deref()
                .and_then(|u| normalize_youtube_id(u))
                .as_deref()
                == Some(want_id)
            {
                return true;
            }
        }
    }
    false
}

fn derive_playlist_status(tracks: &[PlaylistSidecarTrackDto], batch_idle: bool) -> String {
    if !batch_idle {
        return "downloading".to_string();
    }
    if tracks.iter().all(|t| t.status == "done") {
        "complete".to_string()
    } else {
        "incomplete".to_string()
    }
}

fn read_sidecar(path: &Path) -> Option<PlaylistSidecarDto> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

#[tauri::command]
pub fn kickoff_playlist_download_sidecar(
    output_dir: String,
    folder_name: String,
    list_url: String,
    title: String,
    tracks: Vec<PlaylistSidecarTrackInput>,
) -> Result<(), String> {
    let folder = folder_name.trim();
    if folder.is_empty() {
        return Err("Playlist folder name is empty.".into());
    }
    let list_url = list_url.trim();
    if list_url.is_empty() {
        return Err("Playlist list URL is empty.".into());
    }
    if tracks.is_empty() {
        return Err("Playlist track roster is empty.".into());
    }

    let dto = PlaylistSidecarDto {
        schema_version: SIDECAR_SCHEMA_VERSION,
        list_url: list_url.to_string(),
        title: title.trim().to_string(),
        cover_url: None,
        tracks: tracks
            .into_iter()
            .map(|t| PlaylistSidecarTrackDto {
                url: t
                    .url
                    .as_ref()
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .map(String::from),
                id: t
                    .id
                    .as_ref()
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .or_else(|| t.url.as_deref().and_then(normalize_youtube_id)),
                title: t.title.trim().to_string(),
                status: "pending".to_string(),
            })
            .collect(),
        status: "downloading".to_string(),
    };

    let path = sidecar_path_for(output_dir.trim(), folder);
    write_json_sidecar(&path, &dto)
}

#[tauri::command]
pub fn update_playlist_download_sidecar_track(
    output_dir: String,
    folder_name: String,
    track_url: Option<String>,
    track_id: Option<String>,
    status: String,
    batch_idle: bool,
) -> Result<(), String> {
    let terminal = status.trim();
    if terminal != "done" && terminal != "failed" {
        return Err(format!("Invalid track status: {status}"));
    }
    let folder = folder_name.trim();
    if folder.is_empty() {
        return Err("Playlist folder name is empty.".into());
    }

    let path = sidecar_path_for(output_dir.trim(), folder);
    let mut dto = read_sidecar(&path).ok_or_else(|| "Playlist sidecar not found.".to_string())?;

    let url_ref = track_url.as_deref();
    let id_ref = track_id.as_deref();
    let mut matched = false;
    for track in &mut dto.tracks {
        if track_matches(track, url_ref, id_ref) {
            track.status = terminal.to_string();
            matched = true;
            break;
        }
    }
    if !matched {
        return Err("Track not found in playlist sidecar.".into());
    }

    dto.status = derive_playlist_status(&dto.tracks, batch_idle);
    write_json_sidecar(&path, &dto)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_status_while_active() {
        let tracks = vec![
            PlaylistSidecarTrackDto {
                url: None,
                id: Some("a".into()),
                title: "A".into(),
                status: "done".into(),
            },
            PlaylistSidecarTrackDto {
                url: None,
                id: Some("b".into()),
                title: "B".into(),
                status: "pending".into(),
            },
        ];
        assert_eq!(derive_playlist_status(&tracks, false), "downloading");
    }

    #[test]
    fn derive_status_complete_and_incomplete() {
        let done = vec![PlaylistSidecarTrackDto {
            url: None,
            id: Some("a".into()),
            title: "A".into(),
            status: "done".into(),
        }];
        assert_eq!(derive_playlist_status(&done, true), "complete");

        let mixed = vec![
            PlaylistSidecarTrackDto {
                url: None,
                id: Some("a".into()),
                title: "A".into(),
                status: "done".into(),
            },
            PlaylistSidecarTrackDto {
                url: None,
                id: Some("b".into()),
                title: "B".into(),
                status: "failed".into(),
            },
        ];
        assert_eq!(derive_playlist_status(&mixed, true), "incomplete");
    }
}
