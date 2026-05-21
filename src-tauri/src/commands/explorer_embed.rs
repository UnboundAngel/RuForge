//! Embedded explorer on Linux uses a child `WebviewWindow` parented to `main`, positioned in
//! screen space. Tauri packs in-window child webviews into a GtkBox below the main UI, which
//! breaks overlay layout on Linux.

use std::sync::Mutex;

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager};

#[cfg(target_os = "linux")]
use tauri::{
    PhysicalPosition, PhysicalSize, Url, WebviewUrl, WebviewWindowBuilder,
};

#[cfg(target_os = "linux")]
use crate::hardware_acceleration::HardwareAccelerationDisk;

#[cfg(target_os = "linux")]
const LINUX_EXPLORER_LABEL: &str = "explorer-surface";

#[cfg(target_os = "linux")]
static LINUX_CREATE_LOCK: Mutex<()> = Mutex::new(());

#[cfg(target_os = "linux")]
static LAST_LINUX_PHYSICAL_BOUNDS: Mutex<Option<(i32, i32, u32, u32)>> = Mutex::new(None);

#[cfg(not(target_os = "linux"))]
static LAST_IN_WINDOW_LOGICAL_BOUNDS: Mutex<Option<(i32, i32, u32, u32)>> = Mutex::new(None);

#[tauri::command]
pub fn is_linux_host() -> bool {
    cfg!(target_os = "linux")
}

#[tauri::command]
pub fn embedded_explorer_webview_label() -> String {
    #[cfg(target_os = "linux")]
    {
        return LINUX_EXPLORER_LABEL.to_string();
    }
    #[cfg(not(target_os = "linux"))]
    {
        "explorer-view".to_string()
    }
}

#[tauri::command]
pub fn ensure_embedded_explorer_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        return linux_ensure_surface_bounds(&app, x, y, width, height);
    }

    #[cfg(not(target_os = "linux"))]
    {
        sync_in_window_child_bounds(&app, x, y, width, height)
    }
}

#[tauri::command]
pub fn set_embedded_explorer_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let Some(win) = app.get_webview_window(LINUX_EXPLORER_LABEL) else {
            return Ok(());
        };
        if visible {
            win.show().map_err(|e| e.to_string())?;
        } else {
            win.hide().map_err(|e| e.to_string())?;
            if let Ok(mut cache) = LAST_LINUX_PHYSICAL_BOUNDS.lock() {
                *cache = None;
            }
        }
        return Ok(());
    }

    #[cfg(not(target_os = "linux"))]
    {
        let Some(webview) = app.get_webview("explorer-view") else {
            return Ok(());
        };
        if visible {
            webview.show().map_err(|e| e.to_string())?;
        } else {
            webview.hide().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

#[cfg(not(target_os = "linux"))]
fn sync_in_window_child_bounds(
    app: &AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let lx = x.round() as i32;
    let ly = y.round() as i32;
    let lw = width.round().max(1.0) as u32;
    let lh = height.round().max(1.0) as u32;

    let mut cache = LAST_IN_WINDOW_LOGICAL_BOUNDS
        .lock()
        .map_err(|_| "explorer bounds cache poisoned".to_string())?;
    if *cache == Some((lx, ly, lw, lh)) {
        return Ok(());
    }
    *cache = Some((lx, ly, lw, lh));
    drop(cache);

    let Some(webview) = app.get_webview("explorer-view") else {
        return Ok(());
    };
    webview
        .set_position(LogicalPosition::new(lx as f64, ly as f64))
        .map_err(|e| e.to_string())?;
    webview
        .set_size(LogicalSize::new(lw as f64, lh as f64))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn linux_close_legacy_in_window_child(app: &AppHandle) {
    if let Some(legacy) = app.get_webview("explorer-view") {
        let _ = legacy.close();
    }
}

#[cfg(target_os = "linux")]
fn linux_ensure_surface_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(LINUX_EXPLORER_LABEL) {
        return Ok(w);
    }

    let _guard = LINUX_CREATE_LOCK
        .lock()
        .map_err(|_| "explorer surface lock poisoned".to_string())?;
    if let Some(w) = app.get_webview_window(LINUX_EXPLORER_LABEL) {
        return Ok(w);
    }

    linux_close_legacy_in_window_child(app);

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("explorer-data");

    let prefs = HardwareAccelerationDisk::load(&app.config().identifier);

    let mut builder = WebviewWindowBuilder::new(
        app,
        LINUX_EXPLORER_LABEL,
        WebviewUrl::External(
            Url::parse("https://www.youtube.com").map_err(|e| e.to_string())?,
        ),
    )
    .title("RuForge Explorer")
    .parent(&main)
    .map_err(|e| e.to_string())?
    .decorations(false)
    .shadow(false)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .resizable(false)
    .inner_size(800.0, 600.0)
    .user_agent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )
    .data_directory(data_dir);

    if let Some(browser_args) = prefs.webview_additional_browser_args() {
        builder = builder.additional_browser_args(&browser_args);
    }

    builder.build().map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
fn linux_ensure_surface_bounds(
    app: &AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let surface = linux_ensure_surface_window(app)?;

    let scale = main.scale_factor().map_err(|e| e.to_string())?;
    let outer = main.outer_position().map_err(|e| e.to_string())?;

    let pw = ((width * scale).round() as u32).max(1);
    let ph = ((height * scale).round() as u32).max(1);
    let px = outer.x + (x * scale).round() as i32;
    let py = outer.y + (y * scale).round() as i32;

    let mut cache = LAST_LINUX_PHYSICAL_BOUNDS
        .lock()
        .map_err(|_| "explorer bounds cache poisoned".to_string())?;
    if *cache == Some((px, py, pw, ph)) {
        return Ok(());
    }
    *cache = Some((px, py, pw, ph));
    drop(cache);

    surface
        .set_size(tauri::Size::Physical(PhysicalSize::new(pw, ph)))
        .map_err(|e| e.to_string())?;
    surface
        .set_position(tauri::Position::Physical(PhysicalPosition::new(px, py)))
        .map_err(|e| e.to_string())?;
    surface.show().map_err(|e| e.to_string())?;
    Ok(())
}
