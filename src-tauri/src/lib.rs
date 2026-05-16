mod app_state;
mod commands;
mod download_job_manager;
mod hardware_acceleration;
mod tray;
mod utils;
mod ytdlp_binary;

use std::sync::Mutex;

use tauri::{Listener, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::app_state::AppConfig;
use crate::commands::downloader::{get_video_info, pause_download_job, start_download_job};
use crate::download_job_manager::DownloadJobManager;
use crate::commands::ffprobe::probe_local_media_ffprobe;
use crate::commands::gallery::scan_gallery;
use crate::commands::media::{
    delete_media, ensure_poster_if_missing, extract_frames, get_subtitle_tracks, read_local_subtitle_vtt,
};
use crate::commands::player::{
    eval_in_webview, get_embedded_explorer_webview_url, open_mini_player, open_youtube_explorer,
};
use crate::commands::settings::{
    authorize_cleanup, clear_ruforge_cache, get_hardware_acceleration_browser_args,
    get_hardware_acceleration_pref, get_storage_stats, open_windows_sound_settings,
    set_hardware_acceleration_pref, update_tray_config,
};
use crate::commands::system::open_external_url;
use crate::commands::ytdlp_update::{
    download_ytdlp_update, get_ytdlp_update_status, warm_ytdlp_release_cache_spawn,
};
use crate::hardware_acceleration::apply_hardware_acceleration_prefs_to_context;
use crate::tray::{setup_tray, tray_front_debug, TRAY_SHOW_MAIN_EVENT};

/// Windows toast header uses the parent process name in dev unless we set an explicit AppUserModelID.
#[cfg(windows)]
fn set_windows_notification_app_id(app_id: &str) {
    use std::ffi::OsStr;
    use std::os::windows::prelude::OsStrExt;

    let wide: Vec<u16> = OsStr::new(app_id)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    apply_hardware_acceleration_prefs_to_context(&mut context);

    tauri::Builder::default()
        .manage(AppConfig {
            minimize_to_tray: Mutex::new(true),
        })
        .manage(DownloadJobManager::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--silently"])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            #[cfg(windows)]
            set_windows_notification_app_id(&app.config().identifier);

            let handle = app.handle().clone();
            warm_ytdlp_release_cache_spawn(handle.clone());
            tauri::async_runtime::spawn(async move {
                if let Ok(updater) = handle.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        println!("Update found: {}", update.version);
                    }
                }
            });

            setup_tray(app)?;

            if let Some(main) = app.get_webview_window("main") {
                let _ = main.listen(TRAY_SHOW_MAIN_EVENT, |_event| {
                    eprintln!(
                        "[ruforge-tray] Rust: main webview received `{TRAY_SHOW_MAIN_EVENT}` (routing OK)"
                    );
                });
            } else {
                eprintln!(
                    "[ruforge-tray] Rust: setup could not resolve main webview — tray emit will miss"
                );
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppConfig>();
                let minimize_to_tray = *state.minimize_to_tray.lock().unwrap();
                
                if minimize_to_tray && window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            tray_front_debug,
            get_video_info,
            start_download_job,
            pause_download_job,
            scan_gallery,
            open_mini_player,
            open_youtube_explorer,
            get_embedded_explorer_webview_url,
            update_tray_config,
            extract_frames,
            ensure_poster_if_missing,
            delete_media,
            get_storage_stats,
            authorize_cleanup,
            clear_ruforge_cache,
            eval_in_webview,
            get_hardware_acceleration_pref,
            set_hardware_acceleration_pref,
            get_hardware_acceleration_browser_args,
            open_windows_sound_settings,
            probe_local_media_ffprobe,
            open_external_url,
            get_subtitle_tracks,
            read_local_subtitle_vtt,
            get_ytdlp_update_status,
            download_ytdlp_update
        ])
        .run(context)
        .expect("error while running tauri application");
}
