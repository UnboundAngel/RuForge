use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use std::sync::Mutex;
use tauri_plugin_process::process::relaunch;

#[derive(Default)]
pub struct AppConfig {
    pub minimize_to_tray: Mutex<bool>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct VideoInfo {
    pub title: String,
    pub thumbnail: String,
    pub duration: f64,
    pub formats: Vec<String>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadOptions {
    pub format: String,
    pub output_dir: String,
    pub filename_template: String,
    pub browser_cookies: Option<String>,
    pub cookie_file: Option<String>,
}
#[derive(Clone, Serialize)]
struct ProgressPayload {
    percentage: f32,
    speed: String,
    eta: String,
    status: String,
}
#[tauri::command]
async fn get_video_info(url: String) -> Result<VideoInfo, String> {
    let output = Command::new("yt-dlp")
        .args(["--print-json", "-s", &url])
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    Ok(VideoInfo {
        title: json["title"].as_str().unwrap_or("Unknown").to_string(),
        thumbnail: json["thumbnail"].as_str().unwrap_or("").to_string(),
        duration: json["duration"].as_f64().unwrap_or(0.0),
        formats: vec![],
    })
}
#[tauri::command]
async fn download_video(
    app: AppHandle,
    url: String,
    options: DownloadOptions,
) -> Result<String, String> {
    let mut args = vec![
        "-f".to_string(),
        options.format,
        "-o".to_string(),
        format!("{}/{}", options.output_dir, options.filename_template),
        "--newline".to_string(),
    ];

    if let Some(cookie_file) = options.cookie_file {
        if !cookie_file.is_empty() {
            args.push("--cookies".to_string());
            args.push(cookie_file);
        }
    } else if let Some(browser) = options.browser_cookies {
        if !browser.is_empty() {
            args.push("--cookies-from-browser".to_string());
            args.push(browser);
        }
    }

    args.push(url);

    let mut child = Command::new("yt-dlp")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start download: {}", e))?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let mut reader = BufReader::new(stdout).lines();
    let mut err_reader = BufReader::new(stderr).lines();

    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = reader.next_line().await {
            if line.contains("[download]") && line.contains("%") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let percent_str = parts[1].trim_end_matches('%');
                    if let Ok(percentage) = percent_str.parse::<f32>() {
                        let speed = if parts.len() >= 6 { parts[5] } else { "" };
                        let eta = if parts.len() >= 8 { parts[7] } else { "" };
                        let _ = app_handle.emit(
                            "download-progress",
                            ProgressPayload {
                                percentage,
                                speed: speed.to_string(),
                                eta: eta.to_string(),
                                status: "downloading".to_string(),
                            },
                        );
                    }
                }
            }
        }
    });

    let error_log = std::sync::Arc::new(tokio::sync::Mutex::new(String::new()));
    let error_log_clone = error_log.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = err_reader.next_line().await {
            let mut log = error_log_clone.lock().await;
            log.push_str(&line);
            log.push('\n');
        }
    });

    let status = child.wait().await.map_err(|e| e.to_string())?;

    if status.success() {
        Ok("Download completed successfully".to_string())
    } else {
        let final_err = error_log.lock().await.clone();
        Err(format!(
            "yt-dlp exited with status: {}\nError output:\n{}",
            status, final_err
        ))
    }
}
#[derive(Debug, Serialize, Deserialize)]
pub struct MediaFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created: u64,
}
#[tauri::command]
async fn scan_gallery(dir: String) -> Result<Vec<MediaFile>, String> {
    let mut files = vec![];
    let paths = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for path in paths {
        let path = path.map_err(|e| e.to_string())?.path();
        if path.is_file() {
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            if ["mp4", "mkv", "webm", "mp3", "m4a", "flac"].contains(&ext) {
                let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
                files.push(MediaFile {
                    name: path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string(),
                    path: path.to_string_lossy().to_string(),
                    size: metadata.len(),
                    created: metadata
                        .created()
                        .map_err(|e| e.to_string())?
                        .duration_since(std::time::UNIX_EPOCH)
                        .map_err(|e| e.to_string())?
                        .as_secs(),
                });
            }
        }
    }
    Ok(files)
}
#[tauri::command]
fn update_tray_config(state: State<'_, AppConfig>, minimize: bool) {
    let mut minimize_to_tray = state.minimize_to_tray.lock().unwrap();
    *minimize_to_tray = minimize;
}
#[tauri::command]
async fn open_mini_player(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mini") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let _window =
        tauri::WebviewWindowBuilder::new(&app, "mini", tauri::WebviewUrl::App("index.html".into()))
            .title("RuForge Mini")
            .inner_size(480.0, 320.0)
            .min_inner_size(300.0, 200.0)
            .resizable(true)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .build()
            .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn open_youtube_explorer(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("explorer") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let ext_path = app.path().resource_dir()
        .map_err(|e| e.to_string())?
        .join("extensions/ublock");

    // Use a dedicated data directory for explorer to avoid conflicts with extensions enabled
    let data_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("explorer-data");

    let mut builder = tauri::WebviewWindowBuilder::new(&app, "explorer", tauri::WebviewUrl::External("https://www.youtube.com".parse().unwrap()))
        .title("YouTube Explorer")
        .inner_size(1200.0, 800.0)
        .data_directory(data_dir)
        .browser_extensions_enabled(true)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .initialization_script(r#"
            (function() {
                console.log('RuForge Explorer Active');
                let lastUrl = window.location.href;
                
                function checkUrl() {
                    const currentUrl = window.location.href;
                    if (currentUrl !== lastUrl) {
                        lastUrl = currentUrl;
                        if (currentUrl.includes('watch?v=')) {
                            window.__TAURI__.event.emit('explorer-url', currentUrl);
                        }
                    }
                }
                
                // Monitor navigation
                setInterval(checkUrl, 1000);
                window.addEventListener('yt-navigate-finish', checkUrl);

                // Add visual badge
                const style = document.createElement('style');
                style.innerHTML = `
                    #ruforge-badge {
                        position: fixed;
                        top: 10px;
                        right: 150px;
                        z-index: 9999;
                        background: #d4a373;
                        color: #1c1512;
                        padding: 5px 15px;
                        border-radius: 20px;
                        font-family: sans-serif;
                        font-weight: bold;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                        pointer-events: none;
                    }
                `;
                document.head.appendChild(style);
                const badge = document.createElement('div');
                badge.id = 'ruforge-badge';
                badge.innerText = 'RuForge Ready';
                document.body.appendChild(badge);
            })();
        "#);

    if ext_path.exists() && ext_path.join("manifest.json").exists() {
        builder = builder.extensions_path(ext_path);
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}
#[tauri::command]
async fn extract_frames(app: AppHandle, video_path: String) -> Result<Vec<String>, String> {
    let app_cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let video_name = std::path::Path::new(&video_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    
    let thumb_dir = app_cache.join("scrubber_thumbs").join(video_name);
    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

    // Check if thumbs already exist
    let mut existing_thumbs = vec![];
    if let Ok(entries) = std::fs::read_dir(&thumb_dir) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|s| s.to_str()) == Some("jpg") {
                existing_thumbs.push(entry.path().to_string_lossy().to_string());
            }
        }
    }
    
    if !existing_thumbs.is_empty() {
        existing_thumbs.sort();
        return Ok(existing_thumbs);
    }

    // Extract frames every 5 seconds (low res for performance)
    let output_pattern = thumb_dir.join("thumb_%04d.jpg");
    let status = Command::new("ffmpeg")
        .args([
            "-i", &video_path,
            "-vf", "fps=1/10,scale=160:90", // One frame every 10s, 160x90
            "-q:v", "20", // Lower quality for speed/space
            output_pattern.to_str().unwrap()
        ])
        .status()
        .await
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !status.success() {
        return Err("ffmpeg failed to extract frames".to_string());
    }

    let mut thumbs = vec![];
    if let Ok(entries) = std::fs::read_dir(&thumb_dir) {
        for entry in entries.flatten() {
            thumbs.push(entry.path().to_string_lossy().to_string());
        }
    }
    thumbs.sort();
    Ok(thumbs)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppConfig {
            minimize_to_tray: Mutex::new(true),
        })
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--silently"])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Handle silent start
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--silently".to_string()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            
            // Troubleshooting Submenu
            let reload_i = MenuItem::with_id(app, "reload", "Reload Interface", true, None::<&str>)?;
            let toggle_gpu_i = MenuItem::with_id(app, "toggle_gpu", "Toggle GPU Acceleration & Restart", true, None::<&str>)?;
            let reset_i = MenuItem::with_id(app, "reset_data", "Reset App Data & Restart", true, None::<&str>)?;
            
            let troubleshooting_m = Submenu::with_items(
                app,
                "Troubleshooting",
                true,
                &[&reload_i, &toggle_gpu_i, &reset_i],
            )?;

            let menu = Menu::with_items(app, &[&show_i, &troubleshooting_m.into(), &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "reload" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("location.reload()");
                            }
                        }
                        "toggle_gpu" => {
                            relaunch(app);
                        }
                        "reset_data" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("localStorage.clear(); location.reload();");
                            }
                            relaunch(app);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

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
            extract_frames
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
