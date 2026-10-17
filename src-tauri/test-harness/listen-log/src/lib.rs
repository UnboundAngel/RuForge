pub mod commands {
    #[path = "../../../../src/commands/music_listen_log.rs"]
    pub mod music_listen_log;
    #[path = "../../../../src/commands/music_playlists.rs"]
    pub mod music_playlists;
}
#[path = "../../../src/capability_audit.rs"]
mod capability_audit;
#[path = "../../../src/path_guard.rs"]
pub mod path_guard;
#[path = "../../../src/webview_trust.rs"]
pub mod webview_trust;

/// Stand-in for `library::path_access` without a library config: no UNC roots.
pub mod library {
    pub mod path_access {
        pub fn allow_path(_app: &tauri::AppHandle, raw: &str) -> Result<std::path::PathBuf, String> {
            crate::path_guard::check_path(raw, &[])
        }
    }
}
