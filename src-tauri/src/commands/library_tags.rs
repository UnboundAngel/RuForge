use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::commands::gallery::resolve_info_json_path;
use crate::commands::music_playlists::write_atomic;

const TAGS_FILENAME: &str = "library-tags.json";
/// Tag rules only read descriptions; anything past this is not worth matching against.
const DESCRIPTION_MAX_CHARS: usize = 20_000;

fn tags_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join(TAGS_FILENAME))
}

/// Returns `None` when the file does not exist yet.
#[tauri::command]
pub fn read_library_tags_file(app: AppHandle) -> Result<Option<String>, String> {
    let path = tags_path(&app)?;
    if !path.is_file() {
        return Ok(None);
    }
    std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_library_tags_file(app: AppHandle, contents: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| format!("Refusing to write invalid tags JSON: {e}"))?;
    write_atomic(&tags_path(&app)?, &contents)
}

#[derive(Deserialize)]
struct InfoSidecar {
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    view_count: Option<u64>,
    #[serde(default)]
    upload_date: Option<String>,
}

fn read_sidecar(media: &Path) -> Option<InfoSidecar> {
    let parent = media.parent()?;
    let stem = media.file_stem()?.to_str()?;
    let info = resolve_info_json_path(parent, stem)?;
    let text = std::fs::read_to_string(info).ok()?;
    serde_json::from_str(&text).ok()
}

fn clean_description(raw: Option<String>) -> Option<String> {
    let raw = raw?;
    let desc = raw.trim();
    if desc.is_empty() {
        return None;
    }
    Some(desc.chars().take(DESCRIPTION_MAX_CHARS).collect())
}

fn description_for(media: &Path) -> Option<String> {
    clean_description(read_sidecar(media)?.description)
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InfoMeta {
    description: Option<String>,
    view_count: Option<u64>,
    upload_date: Option<String>,
}

fn meta_for(media: &Path) -> InfoMeta {
    match read_sidecar(media) {
        Some(s) => InfoMeta {
            description: clean_description(s.description),
            view_count: s.view_count,
            upload_date: s.upload_date.filter(|d| d.len() == 8 && d.bytes().all(|b| b.is_ascii_digit())),
        },
        None => InfoMeta { description: None, view_count: None, upload_date: None },
    }
}

/// Description plus view count and upload date (`YYYYMMDD`) from the `.info.json` sidecar.
#[tauri::command]
pub async fn library_info_meta(app: AppHandle, path: String) -> Result<InfoMeta, String> {
    let checked = crate::library::path_access::allow_path(&app, &path).ok();
    tauri::async_runtime::spawn_blocking(move || match checked {
        Some(p) => meta_for(&p),
        None => InfoMeta { description: None, view_count: None, upload_date: None },
    })
    .await
    .map_err(|e| e.to_string())
}

/// One entry per path, in order: the yt-dlp `.info.json` description, or `None` when there is none.
#[tauri::command]
pub async fn library_info_descriptions(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
    let checked: Vec<Option<PathBuf>> = paths
        .iter()
        .map(|p| crate::library::path_access::allow_path(&app, p).ok())
        .collect();
    tauri::async_runtime::spawn_blocking(move || {
        checked
            .iter()
            .map(|p| p.as_deref().and_then(description_for))
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_description_from_sidecar() {
        let dir = std::env::temp_dir().join(format!("rf-tags-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let media = dir.join("Clip.mp4");
        std::fs::write(&media, b"x").unwrap();
        assert_eq!(description_for(&media), None);
        std::fs::write(dir.join("Clip.info.json"), r#"{"id":"x","description":"  Seed 123  "}"#).unwrap();
        assert_eq!(description_for(&media).as_deref(), Some("Seed 123"));
        std::fs::write(dir.join("Clip.info.json"), r#"{"id":"x","description":""}"#).unwrap();
        assert_eq!(description_for(&media), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_meta_from_sidecar() {
        let dir = std::env::temp_dir().join(format!("rf-meta-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let media = dir.join("Clip.mp4");
        std::fs::write(&media, b"x").unwrap();
        let none = InfoMeta { description: None, view_count: None, upload_date: None };
        assert_eq!(meta_for(&media), none);
        std::fs::write(
            dir.join("Clip.info.json"),
            r#"{"description":" Hi ","view_count":1529501,"upload_date":"20261009"}"#,
        )
        .unwrap();
        assert_eq!(
            meta_for(&media),
            InfoMeta {
                description: Some("Hi".into()),
                view_count: Some(1529501),
                upload_date: Some("20261009".into())
            }
        );
        std::fs::write(dir.join("Clip.info.json"), r#"{"upload_date":"bad"}"#).unwrap();
        assert_eq!(meta_for(&media), none);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
