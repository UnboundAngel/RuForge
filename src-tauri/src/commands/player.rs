use tauri::{AppHandle, Manager};

use crate::hardware_acceleration::HardwareAccelerationDisk;

#[cfg(windows)]
fn apply_window_icon(app: &AppHandle, window: &tauri::WebviewWindow) {
    if let Some(icon) = app.default_window_icon().cloned() {
        let _ = window.set_icon(icon);
    }
}

/// Current navigation URL of the embedded explorer webview (for main-window UI).
#[tauri::command]
pub fn get_embedded_explorer_webview_url(app: AppHandle) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    let label = "explorer-surface";
    #[cfg(not(target_os = "linux"))]
    let label = "explorer-view";

    let webview = app
        .get_webview(label)
        .ok_or_else(|| "Explorer webview is not active.".to_string())?;
    webview
        .url()
        .map(|u| u.to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn eval_in_webview(app: AppHandle, label: String, script: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{label}' is not active."))?;
    webview.eval(&script).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_mini_player(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mini") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let prefs = HardwareAccelerationDisk::load(&app.config().identifier);

    let mut mini_builder =
        tauri::WebviewWindowBuilder::new(&app, "mini", tauri::WebviewUrl::App("index.html".into()))
            .title("RuForge Mini")
            .inner_size(480.0, 320.0)
            .min_inner_size(242.0, 70.0)
            .resizable(true)
            .decorations(false)
            .transparent(true)
            .shadow(false);

    if let Some(browser_args) = prefs.webview_additional_browser_args() {
        mini_builder = mini_builder.additional_browser_args(&browser_args);
    }

    let window = mini_builder.build().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    apply_window_icon(&app, &window);
    Ok(())
}

#[tauri::command]
pub async fn open_music_mini_player(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("music-mini") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let prefs = HardwareAccelerationDisk::load(&app.config().identifier);

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "music-mini",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("RuForge Music")
    .inner_size(400.0, 515.0)
    .min_inner_size(400.0, 515.0)
    .max_inner_size(400.0, 515.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false);

    if let Some(browser_args) = prefs.webview_additional_browser_args() {
        builder = builder.additional_browser_args(&browser_args);
    }

    let window = builder.build().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    apply_window_icon(&app, &window);
    Ok(())
}

#[tauri::command]
pub async fn open_youtube_explorer(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("explorer") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("explorer-data");

    let prefs = HardwareAccelerationDisk::load(&app.config().identifier);

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "explorer",
        tauri::WebviewUrl::External("https://www.youtube.com".parse().unwrap()),
    )
    .title("YouTube Explorer")
    .inner_size(1200.0, 800.0)
    .data_directory(data_dir)
    .browser_extensions_enabled(false)
    .user_agent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )
    .initialization_script(
        r#"
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
                
                setInterval(checkUrl, 1000);
                window.addEventListener('yt-navigate-finish', checkUrl);

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
        "#,
    );

    if let Some(browser_args) = prefs.webview_additional_browser_args() {
        builder = builder.additional_browser_args(&browser_args);
    }

    let window = builder.build().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    apply_window_icon(&app, &window);

    Ok(())
}
