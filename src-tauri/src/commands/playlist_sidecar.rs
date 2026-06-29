use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const SIDECAR_SCHEMA_VERSION: u32 = 2;
const SIDECAR_FILENAME: &str = ".ruforge-playlist.json";
const PLAYLIST_COVER_FILENAME: &str = ".ruforge-playlist-cover.jpg";

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlist_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub declared_track_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browse_entity_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_year: Option<u32>,
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

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSidecarMetadataInput {
    #[serde(default)]
    pub cover_url: Option<String>,
    #[serde(default)]
    pub playlist_kind: Option<String>,
    #[serde(default)]
    pub declared_track_count: Option<u32>,
    #[serde(default)]
    pub curator_name: Option<String>,
    #[serde(default)]
    pub curator_id: Option<String>,
    #[serde(default)]
    pub curator_url: Option<String>,
    #[serde(default)]
    pub browse_entity_url: Option<String>,
    #[serde(default)]
    pub release_year: Option<u32>,
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

pub fn playlist_cover_path_for(output_dir: &str, folder_name: &str) -> PathBuf {
    PathBuf::from(output_dir)
        .join("Playlists")
        .join(folder_name)
        .join(PLAYLIST_COVER_FILENAME)
}

fn schedule_playlist_cover_persist(cover_url: String, output_dir: String, folder_name: String) {
    tauri::async_runtime::spawn(async move {
        let dest = playlist_cover_path_for(&output_dir, &folder_name);
        if dest.is_file() {
            return;
        }
        let client = match reqwest::Client::builder()
            .user_agent("RuForge/1.0 (+https://github.com/UnboundAngel/RuForge)")
            .timeout(std::time::Duration::from_secs(45))
            .build()
        {
            Ok(c) => c,
            Err(_) => return,
        };
        let Ok(resp) = client.get(&cover_url).send().await else {
            return;
        };
        if !resp.status().is_success() {
            return;
        }
        let Ok(bytes) = resp.bytes().await else {
            return;
        };
        if bytes.is_empty() {
            return;
        }
        if let Some(parent) = dest.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&dest, &bytes);
    });
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

fn extract_playlist_list_id(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    let marker = "list=";
    if let Some(idx) = lower.find(marker) {
        let tail = &trimmed[idx + marker.len()..];
        let end = tail
            .find(['&', '#', '?'])
            .map(|i| &tail[..i])
            .unwrap_or(tail)
            .trim();
        if !end.is_empty() {
            return Some(end.to_string());
        }
    }
    None
}

fn playlist_list_ids_match(a: &str, b: &str) -> bool {
    match (extract_playlist_list_id(a), extract_playlist_list_id(b)) {
        (Some(ia), Some(ib)) => ia.eq_ignore_ascii_case(&ib),
        _ => false,
    }
}

fn sorted_playlist_folder_entries(playlists_dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(playlists_dir) else {
        return vec![];
    };
    let mut entries: Vec<PathBuf> = rd
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_dir())
        .collect();
    entries.sort_by(|a, b| {
        a.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
            .cmp(
                &b.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase(),
            )
    });
    entries
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSidecarLookupDto {
    pub output_dir: String,
    pub folder_name: String,
    pub sidecar: PlaylistSidecarDto,
}

fn trim_opt(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn apply_metadata_patch(dto: &mut PlaylistSidecarDto, patch: &PlaylistSidecarMetadataInput) {
    if let Some(url) = trim_opt(patch.cover_url.clone()) {
        dto.cover_url = Some(url);
    }
    if let Some(kind) = trim_opt(patch.playlist_kind.clone()) {
        dto.playlist_kind = Some(kind);
    }
    if let Some(count) = patch.declared_track_count {
        dto.declared_track_count = Some(count);
    }
    if let Some(name) = trim_opt(patch.curator_name.clone()) {
        dto.curator_name = Some(name);
    }
    if let Some(id) = trim_opt(patch.curator_id.clone()) {
        dto.curator_id = Some(id);
    }
    if let Some(url) = trim_opt(patch.curator_url.clone()) {
        dto.curator_url = Some(url);
    }
    if let Some(url) = trim_opt(patch.browse_entity_url.clone()) {
        dto.browse_entity_url = Some(url);
    }
    if let Some(year) = patch.release_year {
        dto.release_year = Some(year);
    }
}

#[tauri::command]
pub fn kickoff_playlist_download_sidecar(
    output_dir: String,
    folder_name: String,
    list_url: String,
    title: String,
    tracks: Vec<PlaylistSidecarTrackInput>,
    metadata: Option<PlaylistSidecarMetadataInput>,
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

    let mut dto = PlaylistSidecarDto {
        schema_version: SIDECAR_SCHEMA_VERSION,
        list_url: list_url.to_string(),
        title: title.trim().to_string(),
        cover_url: None,
        playlist_kind: None,
        declared_track_count: None,
        curator_name: None,
        curator_id: None,
        curator_url: None,
        browse_entity_url: None,
        release_year: None,
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

    if let Some(meta) = metadata {
        apply_metadata_patch(&mut dto, &meta);
        if let Some(url) = trim_opt(meta.cover_url.clone()) {
            schedule_playlist_cover_persist(
                url,
                output_dir.trim().to_string(),
                folder.to_string(),
            );
        }
    }

    let path = sidecar_path_for(output_dir.trim(), folder);
    write_json_sidecar(&path, &dto)
}

#[tauri::command]
pub fn read_playlist_download_sidecar(
    output_dir: String,
    folder_name: String,
) -> Result<Option<PlaylistSidecarDto>, String> {
    let folder = folder_name.trim();
    if folder.is_empty() {
        return Err("Playlist folder name is empty.".into());
    }
    let path = sidecar_path_for(output_dir.trim(), folder);
    Ok(read_sidecar(&path))
}

#[tauri::command]
pub fn find_playlist_sidecar_by_list_url(
    scan_roots: Vec<String>,
    list_url: String,
) -> Result<Option<PlaylistSidecarLookupDto>, String> {
    let want = list_url.trim();
    if want.is_empty() {
        return Ok(None);
    }
    for root in scan_roots {
        let root = root.trim();
        if root.is_empty() {
            continue;
        }
        let playlists_dir = PathBuf::from(root).join("Playlists");
        if !playlists_dir.is_dir() {
            continue;
        }
        for folder in sorted_playlist_folder_entries(&playlists_dir) {
            let sidecar_path = folder.join(SIDECAR_FILENAME);
            let Some(dto) = read_sidecar(&sidecar_path) else {
                continue;
            };
            if playlist_list_ids_match(&dto.list_url, want) {
                let folder_name = folder
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                if folder_name.is_empty() {
                    continue;
                }
                return Ok(Some(PlaylistSidecarLookupDto {
                    output_dir: root.to_string(),
                    folder_name,
                    sidecar: dto,
                }));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn update_playlist_download_sidecar_metadata(
    output_dir: String,
    folder_name: String,
    metadata: PlaylistSidecarMetadataInput,
) -> Result<(), String> {
    let folder = folder_name.trim();
    if folder.is_empty() {
        return Err("Playlist folder name is empty.".into());
    }

    let path = sidecar_path_for(output_dir.trim(), folder);
    let mut dto = read_sidecar(&path).ok_or_else(|| "Playlist sidecar not found.".to_string())?;
    dto.schema_version = SIDECAR_SCHEMA_VERSION;
    apply_metadata_patch(&mut dto, &metadata);
    write_json_sidecar(&path, &dto)?;
    if let Some(url) = trim_opt(metadata.cover_url.clone()) {
        schedule_playlist_cover_persist(
            url,
            output_dir.trim().to_string(),
            folder.to_string(),
        );
    }
    Ok(())
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
    dto.schema_version = SIDECAR_SCHEMA_VERSION;

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

    #[test]
    fn playlist_list_ids_match_across_hosts() {
        assert!(playlist_list_ids_match(
            "https://music.youtube.com/playlist?list=OLAK5uy_test",
            "https://www.youtube.com/playlist?list=OLAK5uy_test",
        ));
        assert!(!playlist_list_ids_match(
            "https://music.youtube.com/playlist?list=OLAK5uy_a",
            "https://music.youtube.com/playlist?list=OLAK5uy_b",
        ));
    }

    #[test]
    fn find_playlist_sidecar_by_list_url_locates_match() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let playlist_dir = root.join("Playlists").join("Test Album");
        std::fs::create_dir_all(&playlist_dir).unwrap();
        let sidecar = playlist_dir.join(SIDECAR_FILENAME);
        let json = r#"{
            "schemaVersion": 2,
            "listUrl": "https://music.youtube.com/playlist?list=OLAK5uy_testid",
            "title": "Test Album",
            "coverUrl": "https://i9.ytimg.com/s_p/OLAK5uy_test/maxresdefault.jpg",
            "tracks": [{ "title": "A", "status": "done" }],
            "status": "complete"
        }"#;
        std::fs::write(&sidecar, json).unwrap();
        let found = find_playlist_sidecar_by_list_url(
            vec![root.to_string_lossy().to_string()],
            "https://www.youtube.com/playlist?list=OLAK5uy_testid".to_string(),
        )
        .unwrap();
        let lookup = found.expect("lookup");
        assert_eq!(lookup.folder_name, "Test Album");
        assert_eq!(lookup.sidecar.status, "complete");
    }

    #[test]
    fn read_playlist_download_sidecar_reads_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let playlist_dir = root.join("Playlists").join("Disk Read");
        std::fs::create_dir_all(&playlist_dir).unwrap();
        let sidecar = playlist_dir.join(SIDECAR_FILENAME);
        let json = r#"{
            "schemaVersion": 2,
            "listUrl": "https://music.youtube.com/playlist?list=PLtest",
            "title": "Disk Read",
            "tracks": [{ "title": "A", "status": "pending" }],
            "status": "downloading"
        }"#;
        std::fs::write(&sidecar, json).unwrap();
        let dto = read_playlist_download_sidecar(
            root.to_string_lossy().to_string(),
            "Disk Read".to_string(),
        )
        .unwrap()
        .expect("dto");
        assert_eq!(dto.title, "Disk Read");
        assert_eq!(dto.status, "downloading");
    }

    #[test]
    fn v1_sidecar_deserializes_with_missing_v2_fields() {
        let json = r#"{
            "schemaVersion": 1,
            "listUrl": "https://music.youtube.com/playlist?list=PLtest",
            "title": "Test",
            "tracks": [{ "title": "A", "status": "pending" }],
            "status": "downloading"
        }"#;
        let dto: PlaylistSidecarDto = serde_json::from_str(json).unwrap();
        assert_eq!(dto.schema_version, 1);
        assert!(dto.cover_url.is_none());
        assert!(dto.playlist_kind.is_none());
        assert!(dto.declared_track_count.is_none());
    }
}
