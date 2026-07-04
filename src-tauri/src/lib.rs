mod app_state;
pub mod commands;
pub mod companion;
pub mod debug_log;
mod deno_binary;
mod dev_gate;
mod download_job_manager;
mod focus_protocol;
mod hardware_acceleration;
pub mod library;
mod media_bundle;
mod process_tree;
mod telemetry_prefs;
mod tray;
mod utils;
mod ytdlp_binary;
mod ytdlp_rate_limit;
pub mod telemetry_scrub {
    pub use ::telemetry_scrub::*;
}
#[cfg(windows)]
mod taskbar_thumbbar;
#[cfg(windows)]
mod taskbar_thumbbar_icons;
#[cfg(windows)]
mod windows_audio_brand;

use std::sync::Mutex;

use tauri::{Listener, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::app_state::AppConfig;
use crate::commands::deno_update::{download_deno, get_deno_status};
use crate::commands::dev_captures::{
    capture_main_window_dev, delete_dev_captures, dev_captures_folder_path, list_dev_captures,
    read_dev_capture_png, start_dev_capture_file_drag, write_dev_capture_png, DevCaptureMainWindow,
};
use crate::commands::downloader::{
    get_music_browse_info, get_playlist_items_page, get_video_info, pause_download_job,
    start_download_job, stop_all_active_download_jobs,
};
use crate::commands::explorer_embed::{
    embedded_explorer_webview_label, ensure_embedded_explorer_bounds, is_linux_host,
    set_embedded_explorer_visible,
};
use crate::commands::export::{cancel_export_bundle, export_media_bundle, ExportBundleState};
use crate::commands::ffprobe::probe_local_media_ffprobe;
use crate::commands::gallery::{
    regroup_playlist_downloads, scan_dir_for_neighbors, sweep_library_download_duplicates,
};
use crate::commands::media::{
    delete_media, delete_media_batch, ensure_poster_if_missing, extract_frames,
    get_subtitle_tracks, list_scrub_sprite_paths, read_local_subtitle_vtt,
};
use crate::commands::migrate::migrate_library_layout;
use crate::commands::music_listen_log::{
    music_listen_accumulate, music_listen_begin, music_listen_clear, music_listen_end,
    music_listen_get_integrity, music_listen_get_snapshot, music_listen_import_legacy,
    music_listen_rebuild_snapshot, music_listen_transfer,
};
use crate::commands::musicmeta::{
    backfill_music_meta, ensure_artist_meta_sidecar, ensure_music_meta, get_artist_info,
    read_artist_meta_sidecar, read_music_meta,
};
use crate::commands::notify_overlay::{
    hide_notify_overlay_window, notify_overlay_ready, push_background_notify,
    sync_notify_overlay_bounds,
};
use crate::commands::player::{
    eval_in_webview, get_embedded_explorer_webview_url, open_mini_player, open_music_mini_player,
    open_youtube_explorer,
};
use crate::commands::playlist_sidecar::{
    find_playlist_sidecar_by_list_url, kickoff_playlist_download_sidecar,
    read_playlist_download_sidecar, update_playlist_download_sidecar_metadata,
    update_playlist_download_sidecar_track,
};
use crate::commands::recently_deleted::{
    list_recently_deleted, remove_recently_deleted_entry, restore_recently_deleted,
};
use crate::commands::removable_drives::{
    export_dest_dir_available, poll_removable_drives, RemovableDrivesState,
};
use crate::commands::settings::{
    authorize_cleanup, clear_ruforge_cache, get_hardware_acceleration_browser_args,
    get_hardware_acceleration_pref, get_show_debugging_settings_pref, get_storage_stats,
    open_windows_sound_settings, set_hardware_acceleration_pref, set_show_debugging_settings_pref,
    update_tray_config,
};
use crate::commands::sponsorblock::ensure_sponsorblock_segments;
use crate::commands::system::{open_external_url, open_in_file_manager};
use crate::commands::telemetry::sync_telemetry_prefs;
use crate::commands::ytdlp_update::{
    download_ytdlp_update, get_ytdlp_update_status, warm_ytdlp_release_cache_spawn,
};
use crate::debug_log::sync_debug_log_categories;
use crate::dev_gate::DevGateDisk;
use crate::download_job_manager::DownloadJobManager;
use crate::hardware_acceleration::apply_hardware_acceleration_prefs_to_context;
use crate::library::commands::{
    get_library_snapshot, library_get_config, library_reindex, library_set_config,
};
use crate::library::LibraryState;
use crate::tray::{setup_tray, tray_front_debug};
use crate::focus_protocol::TRAY_SHOW_MAIN_EVENT;

fn aptabase_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let key = option_env!("APTABASE_APP_KEY").unwrap_or("");
    let host = option_env!("APTABASE_HOST").unwrap_or("");
    let mut opts = tauri_plugin_aptabase::InitOptions::default();
    if !host.is_empty() {
        opts.host = Some(host.to_string());
    }
    tauri_plugin_aptabase::Builder::new(key)
        .with_options(opts)
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    apply_hardware_acceleration_prefs_to_context(&mut context);

    #[cfg(windows)]
    {
        let app_id = windows_audio_brand::process_app_user_model_id(&context.config().identifier);
        windows_audio_brand::set_explicit_app_user_model_id(&app_id);
    }

    let identifier = context.config().identifier.clone();
    // WebView localStorage is unavailable at this point; read the on-disk mirror of showDebuggingSettings so Aptabase registers only when the dev gate was enabled at last quit.
    let aptabase_dev_gate = DevGateDisk::load(&identifier).show_debugging_settings;

    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
            // `tauri-plugin-single-instance` with the `deep-link` feature forwards argv to
            // `tauri-plugin-deep-link`, which emits `deep-link://new-url` on the running instance.
        }));
    }

    builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .manage(AppConfig {
            minimize_to_tray: Mutex::new(true),
        })
        .manage(DownloadJobManager::default())
        .manage(ExportBundleState::default())
        .manage(RemovableDrivesState::default())
        .manage(crate::companion::CompanionState::new())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--silently"])))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_snap_layout::init()
                .button_id("ruforge-tb-maximize")
                .build(),
        )
        .append_invoke_initialization_script(
            r";(function(){try{var h=(window.location.hostname||'').toLowerCase();if(h==='tauri.localhost'||h==='localhost'||h==='127.0.0.1'||h.endsWith('.tauri.localhost'))return;if((window.location.protocol||'')==='tauri:')return;window.__snapLayoutInit=true;}catch(e){}})();",
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(crate::debug_log::plugin_max_level())
                .filter(|meta| crate::debug_log::log_filter(meta))
                .build(),
        );

    if aptabase_dev_gate {
        builder = builder.plugin(aptabase_plugin());
    }

    builder
        .setup(|app| {
            let handle = app.handle().clone();

            // Rust is the sole authority for library config + index. Seed/load
            // persisted config now, before any command can race the first
            // `get_library_snapshot` / companion start call.
            let library_config = crate::library::config::load_or_init(&handle)
                .map_err(|e| format!("failed to load library config: {e}"))?;
            app.manage(LibraryState::new(library_config));

            crate::companion::register_progress_query_listener(&handle);

            warm_ytdlp_release_cache_spawn(handle.clone());
            tauri::async_runtime::spawn(async move {
                if let Ok(updater) = handle.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        crate::rf_log!(
                            "core.startup",
                            log::Level::Info,
                            "Update found: {}",
                            update.version
                        );
                    }
                }
            });

            setup_tray(app)?;

            focus_protocol::setup_focus_protocol(app)?;

            #[cfg(windows)]
            windows_audio_brand::apply_window_taskbar_icons(app.handle());

            if let Err(e) =
                crate::commands::music_listen_log::music_listen_startup_housekeeping(app.handle())
            {
                crate::rf_log!(
                    "core.startup",
                    log::Level::Warn,
                    "listen log startup housekeeping failed: {e}"
                );
            }

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
                app.manage(DevCaptureMainWindow(main.clone()));
                let _ = main.listen(TRAY_SHOW_MAIN_EVENT, |_event| {
                    crate::rf_log!(
                        "core.tray",
                        log::Level::Info,
                        "main webview received `{TRAY_SHOW_MAIN_EVENT}` (routing OK)"
                    );
                });
            } else {
                crate::rf_log!(
                    "core.tray",
                    log::Level::Warn,
                    "setup could not resolve main webview — tray emit will miss"
                );
            }

            #[cfg(windows)]
            taskbar_thumbbar::attach_to_main(app);

            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(windows)]
            if window.label() == "main" {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    taskbar_thumbbar::on_main_destroyed();
                }
            }

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
            capture_main_window_dev,
            dev_captures_folder_path,
            list_dev_captures,
            read_dev_capture_png,
            write_dev_capture_png,
            delete_dev_captures,
            start_dev_capture_file_drag,
            sync_debug_log_categories,
            sync_telemetry_prefs,
            tray_front_debug,
            get_video_info,
            get_music_browse_info,
            get_playlist_items_page,
            start_download_job,
            pause_download_job,
            stop_all_active_download_jobs,
            scan_dir_for_neighbors,
            sweep_library_download_duplicates,
            regroup_playlist_downloads,
            get_library_snapshot,
            library_get_config,
            library_set_config,
            library_reindex,
            ensure_sponsorblock_segments,
            ensure_music_meta,
            read_music_meta,
            backfill_music_meta,
            get_artist_info,
            read_artist_meta_sidecar,
            ensure_artist_meta_sidecar,
            kickoff_playlist_download_sidecar,
            read_playlist_download_sidecar,
            find_playlist_sidecar_by_list_url,
            update_playlist_download_sidecar_metadata,
            update_playlist_download_sidecar_track,
            open_mini_player,
            open_music_mini_player,
            open_youtube_explorer,
            get_embedded_explorer_webview_url,
            update_tray_config,
            extract_frames,
            list_scrub_sprite_paths,
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
            get_show_debugging_settings_pref,
            set_show_debugging_settings_pref,
            get_hardware_acceleration_browser_args,
            open_windows_sound_settings,
            probe_local_media_ffprobe,
            open_external_url,
            open_in_file_manager,
            get_subtitle_tracks,
            read_local_subtitle_vtt,
            crate::commands::comments_sidecar::read_video_comments_sidecar,
            crate::commands::comments_sidecar::ensure_video_comments_sidecar,
            get_ytdlp_update_status,
            download_ytdlp_update,
            get_deno_status,
            download_deno,
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
            remove_recently_deleted_entry,
            music_listen_begin,
            music_listen_transfer,
            music_listen_accumulate,
            music_listen_end,
            music_listen_get_snapshot,
            music_listen_get_integrity,
            music_listen_rebuild_snapshot,
            music_listen_import_legacy,
            music_listen_clear,
            crate::companion::commands::companion_start,
            crate::companion::commands::companion_stop,
            crate::companion::commands::companion_status,
            crate::companion::commands::companion_qr_payload,
            crate::companion::commands::companion_sessions,
            crate::companion::commands::companion_revoke_all,
            crate::companion::commands::companion_local_name_experiment,
            #[cfg(windows)]
            taskbar_thumbbar::sync_taskbar_transport,
        ])
        .run(context)
        .expect("error while running tauri application");
}
