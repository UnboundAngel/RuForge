//! Watches downloaded YouTube playlists for videos a friend adds later. Mirrors the channel
//! watchlist: RSS with a page fallback, the same cadence, and results handed to the main webview
//! through the private mailbox with a payload-free ping.

pub mod feed;
pub mod model;
pub mod poller;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, EventTarget, Manager, State};

use super::playlist_sidecar::{
    extract_playlist_list_id, normalize_youtube_id, read_sidecar, sorted_playlist_folder_entries, SIDECAR_FILENAME,
};
use model::{is_watchable_list_id, new_watched, remember, PlaylistWatchFile, MAX_PLAYLISTS};

const FILENAME: &str = "playlist-watch.json";
pub const PLAYLIST_WATCH_EVENT: &str = "playlist-watch-new";

pub struct PlaylistWatchState {
    file: Mutex<PlaylistWatchFile>,
    path: PathBuf,
    client: reqwest::Client,
    poke: tokio::sync::Notify,
    /// Off until the main webview reports the setting, so nothing is fetched before the user's choice is known.
    enabled: AtomicBool,
}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

fn read_file(path: &Path) -> PlaylistWatchFile {
    let Ok(text) = std::fs::read_to_string(path) else {
        return PlaylistWatchFile::default();
    };
    serde_json::from_str(&text).unwrap_or_else(|e| {
        let _ = std::fs::rename(path, path.with_file_name(format!("{FILENAME}.bad")));
        crate::rf_log!(
            "core.startup",
            log::Level::Warn,
            "{FILENAME} was unreadable and was moved aside: {e}"
        );
        PlaylistWatchFile::default()
    })
}

impl PlaylistWatchState {
    pub fn load(app: &AppHandle) -> PlaylistWatchState {
        let path = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("ruforge"))
            .join(FILENAME);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(crate::commands::watchlist::BROWSER_UA)
            .build()
            .unwrap_or_default();
        PlaylistWatchState {
            file: Mutex::new(read_file(&path)),
            path,
            client,
            poke: tokio::sync::Notify::new(),
            enabled: AtomicBool::new(false),
        }
    }

    fn save(&self, file: &PlaylistWatchFile) -> Result<(), String> {
        let text = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
        crate::commands::music_playlists::write_atomic(&self.path, &text)
    }
}

/// Payload-free ping: the Explorer webview can hear `emit_to`, so the data only travels via the mailbox.
fn emit_new(app: &AppHandle) {
    let _ = app.emit_to(EventTarget::webview_window("main"), PLAYLIST_WATCH_EVENT, ());
}

pub(crate) struct Discovered {
    list_id: String,
    list_url: String,
    title: String,
    output_dir: String,
    folder: String,
    ids: Vec<String>,
}

/// One sidecar per `<root>/Playlists/<folder>`. First root wins when a list is downloaded twice.
pub(crate) fn discover(roots: &[String]) -> Vec<Discovered> {
    let mut out: Vec<Discovered> = Vec::new();
    for root in roots {
        for dir in sorted_playlist_folder_entries(&Path::new(root).join("Playlists")) {
            let Some(sidecar) = read_sidecar(&dir.join(SIDECAR_FILENAME)) else {
                continue;
            };
            let Some(list_id) = extract_playlist_list_id(&sidecar.list_url).filter(|id| is_watchable_list_id(id)) else {
                continue;
            };
            if out.iter().any(|d| d.list_id == list_id) {
                continue;
            }
            let Some(folder) = dir.file_name().map(|n| n.to_string_lossy().into_owned()) else {
                continue;
            };
            let ids = sidecar
                .tracks
                .iter()
                .filter_map(|t| t.id.clone().or_else(|| t.url.as_deref().and_then(normalize_youtube_id)))
                .collect();
            out.push(Discovered {
                list_id,
                list_url: sidecar.list_url.clone(),
                title: sidecar.title.clone(),
                output_dir: root.clone(),
                folder,
                ids,
            });
        }
    }
    out
}

pub(crate) fn apply_discovery(file: &mut PlaylistWatchFile, found: Vec<Discovered>, now: i64) {
    file.playlists.retain(|p| found.iter().any(|d| d.list_id == p.list_id));
    for d in found {
        if let Some(pl) = file.playlists.iter_mut().find(|p| p.list_id == d.list_id) {
            pl.title = d.title;
            pl.list_url = d.list_url;
            pl.output_dir = d.output_dir;
            pl.folder_name = d.folder;
            remember(pl, d.ids);
        } else if file.playlists.len() < MAX_PLAYLISTS {
            file.playlists
                .push(new_watched(&d.list_id, &d.list_url, &d.title, &d.output_dir, &d.folder, d.ids, now));
        }
    }
}

/// Called by the main webview on launch, after a playlist download starts, and when the setting
/// flips. Re-scans the library roots so playlists downloaded earlier are picked up too.
#[tauri::command]
pub async fn playlist_watch_sync(
    app: AppHandle,
    state: State<'_, PlaylistWatchState>,
    scan_roots: Vec<String>,
    enabled: bool,
) -> Result<(), String> {
    state.enabled.store(enabled, Ordering::Relaxed);
    if !enabled {
        return Ok(());
    }
    let roots = crate::library::path_access::allowed_roots(&app, &scan_roots);
    if roots.is_empty() {
        return Ok(());
    }
    let found = tauri::async_runtime::spawn_blocking(move || discover(&roots))
        .await
        .map_err(|e| e.to_string())?;
    {
        let mut file = state.file.lock().map_err(|e| e.to_string())?;
        apply_discovery(&mut file, found, now_secs());
        state.save(&file)?;
    }
    state.poke.notify_one();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_sidecar(root: &Path, folder: &str, list_url: &str, ids: &[&str]) {
        let dir = root.join("Playlists").join(folder);
        std::fs::create_dir_all(&dir).unwrap();
        let tracks: Vec<String> = ids
            .iter()
            .map(|id| format!(r#"{{"id":"{id}","title":"t","status":"done"}}"#))
            .collect();
        let json = format!(
            r#"{{"schemaVersion":2,"listUrl":"{list_url}","title":"{folder}","tracks":[{}],"status":"complete"}}"#,
            tracks.join(",")
        );
        std::fs::write(dir.join(SIDECAR_FILENAME), json).unwrap();
    }

    #[test]
    fn playlist_watch_discovers_user_playlists_only() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().into_owned();
        write_sidecar(tmp.path(), "Road", "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf", &["aaaaaaaaaaa"]);
        write_sidecar(tmp.path(), "Mix", "https://www.youtube.com/watch?v=aaaaaaaaaaa&list=RDaaaaaaaaaaa", &["aaaaaaaaaaa"]);
        let found = discover(&[root.clone()]);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].folder, "Road");
        assert_eq!(found[0].ids, vec!["aaaaaaaaaaa"]);

        let mut file = PlaylistWatchFile::default();
        apply_discovery(&mut file, found, 7);
        assert_eq!(file.playlists.len(), 1);
        assert_eq!(file.playlists[0].next_check_at, 7);
        assert!(!file.playlists[0].seeded);
        apply_discovery(&mut file, Vec::new(), 8);
        assert!(file.playlists.is_empty());
    }
}
