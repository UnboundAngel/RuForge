mod app_state;
mod commands;
mod hardware_acceleration;
mod tray;
mod utils;

use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

use crate::app_state::AppConfig;
use crate::commands::downloader::{download_video, get_video_info};
use crate::commands::ffprobe::probe_local_media_ffprobe;
use crate::commands::gallery::scan_gallery;
use crate::commands::media::{
    delete_media, ensure_poster_if_missing, extract_frames, get_subtitle_tracks, read_local_subtitle_vtt,
};
use crate::commands::player::{eval_in_webview, open_mini_player, open_youtube_explorer};
use crate::commands::settings::{
    authorize_cleanup, clear_ruforge_cache, get_hardware_acceleration_browser_args,
    get_hardware_acceleration_pref, get_storage_stats, open_windows_sound_settings,
    set_hardware_acceleration_pref, update_tray_config,
};
use crate::commands::system::open_external_url;
use crate::hardware_acceleration::apply_hardware_acceleration_prefs_to_context;
use crate::tray::setup_tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    apply_hardware_acceleration_prefs_to_context(&mut context);

    tauri::Builder::default()
        .manage(AppConfig {
            minimize_to_tray: Mutex::new(true),
        })
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--silently"])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(updater) = handle.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        println!("Update found: {}", update.version);
                    }
                }
            });

            setup_tray(app)?;

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
            get_video_info,
            download_video,
            scan_gallery,
            open_mini_player,
            open_youtube_explorer,
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
            read_local_subtitle_vtt
        ])
        .run(context)
        .expect("error while running tauri application");
}
