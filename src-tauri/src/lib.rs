mod app_state;
mod commands;
mod download_job_manager;
mod process_tree;
mod hardware_acceleration;
mod tray;
mod media_bundle;
mod utils;
mod ytdlp_binary;
#[cfg(windows)]
mod windows_audio_brand;

use std::sync::Mutex;

use tauri::{Listener, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::app_state::AppConfig;
use crate::commands::downloader::{
    get_music_browse_info, get_playlist_items_page,
    get_video_info, pause_download_job, start_download_job, stop_all_active_download_jobs,
};
use crate::commands::export::{
    cancel_export_bundle, export_media_bundle, ExportBundleState,
};
use crate::download_job_manager::DownloadJobManager;
use crate::commands::ffprobe::probe_local_media_ffprobe;
use crate::commands::gallery::{regroup_playlist_downloads, scan_gallery};
use crate::commands::migrate::migrate_library_layout;
use crate::commands::sponsorblock::ensure_sponsorblock_segments;
use crate::commands::musicmeta::{
    backfill_music_meta, ensure_artist_meta_sidecar, ensure_music_meta, get_artist_info,
    read_artist_meta_sidecar, read_music_meta,
};
use crate::commands::media::{
    delete_media, delete_media_batch, ensure_poster_if_missing, extract_frames, get_subtitle_tracks,
    read_local_subtitle_vtt,
};
use crate::commands::recently_deleted::{
    list_recently_deleted, remove_recently_deleted_entry, restore_recently_deleted,
};
use crate::commands::notify_overlay::{
    hide_notify_overlay_window, notify_overlay_ready, push_background_notify, sync_notify_overlay_bounds,
};
use crate::commands::explorer_embed::{
    embedded_explorer_webview_label, ensure_embedded_explorer_bounds, is_linux_host,
    set_embedded_explorer_visible,
};
use crate::commands::player::{
    eval_in_webview, get_embedded_explorer_webview_url, open_mini_player, open_youtube_explorer,
};
use crate::commands::settings::{
    authorize_cleanup, clear_ruforge_cache, get_hardware_acceleration_browser_args,
    get_hardware_acceleration_pref, get_storage_stats, open_windows_sound_settings,
    set_hardware_acceleration_pref, update_tray_config,
};
use crate::commands::removable_drives::{
    export_dest_dir_available, poll_removable_drives, RemovableDrivesState,
};
use crate::commands::system::{open_external_url, open_in_file_manager};
use crate::commands::ytdlp_update::{
    download_ytdlp_update, get_ytdlp_update_status, warm_ytdlp_release_cache_spawn,
};
use crate::hardware_acceleration::apply_hardware_acceleration_prefs_to_context;
use crate::tray::{setup_tray, tray_front_debug, TRAY_SHOW_MAIN_EVENT};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    apply_hardware_acceleration_prefs_to_context(&mut context);

    #[cfg(windows)]
    windows_audio_brand::set_explicit_app_user_model_id(&context.config().identifier);

    tauri::Builder::default()
        .manage(AppConfig {
            minimize_to_tray: Mutex::new(true),
        })
        .manage(DownloadJobManager::default())
        .manage(ExportBundleState::default())
        .manage(RemovableDrivesState::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--silently"])))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
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

            #[cfg(windows)]
            {
                let display_name = app
                    .config()
                    .product_name
                    .clone()
                    .unwrap_or_else(|| "RuForge".to_string());
                let icon_path = std::env::current_exe().unwrap_or_default();
                windows_audio_brand::spawn_mixer_branding_thread(display_name, icon_path);
            }

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
            get_music_browse_info,
            get_playlist_items_page,
            start_download_job,
            pause_download_job,
            stop_all_active_download_jobs,
            scan_gallery,
            regroup_playlist_downloads,
            ensure_sponsorblock_segments,
            ensure_music_meta,
            read_music_meta,
            backfill_music_meta,
            get_artist_info,
            read_artist_meta_sidecar,
            ensure_artist_meta_sidecar,
            open_mini_player,
            open_youtube_explorer,
            get_embedded_explorer_webview_url,
            update_tray_config,
            extract_frames,
            ensure_poster_if_missing,
            delete_media,
            delete_media_batch,
            get_storage_stats,
            authorize_cleanup,
            clear_ruforge_cache,
            eval_in_webview,
            is_linux_host,
            embedded_explorer_webview_label,
            ensure_embedded_explorer_bounds,
            set_embedded_explorer_visible,
            get_hardware_acceleration_pref,
            set_hardware_acceleration_pref,
            get_hardware_acceleration_browser_args,
            open_windows_sound_settings,
            probe_local_media_ffprobe,
            open_external_url,
            open_in_file_manager,
            get_subtitle_tracks,
            read_local_subtitle_vtt,
            get_ytdlp_update_status,
            download_ytdlp_update,
            push_background_notify,
            sync_notify_overlay_bounds,
            hide_notify_overlay_window,
            notify_overlay_ready,
            export_media_bundle,
            cancel_export_bundle,
            poll_removable_drives,
            export_dest_dir_available,
            migrate_library_layout,
            list_recently_deleted,
            restore_recently_deleted,
            remove_recently_deleted_entry
        ])
        .run(context)
        .expect("error while running tauri application");
}
