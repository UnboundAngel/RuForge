//! Top-center overlay window for the desktop Dynamic Island (minimized / tray-hidden main).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl};
use tauri::WebviewWindowBuilder;

use crate::hardware_acceleration::HardwareAccelerationDisk;
use crate::window_classname::OBS_COMPAT_WINDOW_CLASSNAME;

pub const ISLAND_LABEL: &str = "island";
pub const MAIN_HIDDEN_EVENT: &str = "ruforge:main-hidden";

const DEFAULT_LOGICAL_W: f64 = 380.0;
const DEFAULT_LOGICAL_H: f64 = 56.0;

/// Windows reports minimized outer positions near -32000; treat those as unusable.
const MIN_SANE_OUTER_COORD: i32 = -10_000;

static ISLAND_CREATE_LOCK: Mutex<()> = Mutex::new(());
static OVERLAY_READY: AtomicBool = AtomicBool::new(false);
static LAST_MAIN_MONITOR: Mutex<Option<Monitor>> = Mutex::new(None);

fn work_area_top_center(
    work: &tauri::PhysicalRect<i32, u32>,
    win_w: u32,
    win_h: u32,
    edge_margin: i32,
) -> PhysicalPosition<i32> {
    let wx = work.position.x;
    let wy = work.position.y;
    let ww = work.size.width as i32;
    let x = wx + (ww - win_w as i32) / 2;
    let y = wy + edge_margin;
    let _ = win_h;
    PhysicalPosition::new(x, y)
}

fn physical_size_for_island_window(
    monitor: &Monitor,
    logical_w: f64,
    logical_h: f64,
) -> (PhysicalSize<u32>, PhysicalPosition<i32>) {
    let scale = monitor.scale_factor();
    let win_w = ((logical_w * scale).round() as u32).max(1);
    let win_h = ((logical_h * scale).round() as u32).max(1);
    let work = monitor.work_area();
    let pos = work_area_top_center(work, win_w, win_h, 8);
    (PhysicalSize::new(win_w, win_h), pos)
}

fn outer_position_sane(pos: PhysicalPosition<i32>) -> bool {
    pos.x > MIN_SANE_OUTER_COORD && pos.y > MIN_SANE_OUTER_COORD
}

fn cache_main_monitor(monitor: Monitor) {
    if let Ok(mut guard) = LAST_MAIN_MONITOR.lock() {
        *guard = Some(monitor);
    }
}

/// Snapshot the monitor the main window currently occupies (call while still visible).
pub fn note_main_window_monitor(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    if let Ok(Some(m)) = main.current_monitor() {
        cache_main_monitor(m);
        return;
    }
    let Ok(pos) = main.outer_position() else {
        return;
    };
    if !outer_position_sane(pos) {
        return;
    }
    let Ok(size) = main.outer_size() else {
        return;
    };
    let cx = pos.x as f64 + size.width as f64 / 2.0;
    let cy = pos.y as f64 + size.height as f64 / 2.0;
    if let Ok(Some(m)) = main.monitor_from_point(cx, cy) {
        cache_main_monitor(m);
    }
}

fn resolve_island_monitor(app: &AppHandle) -> Result<Monitor, String> {
    if let Some(main) = app.get_webview_window("main") {
        let pos_ok = main
            .outer_position()
            .ok()
            .map(outer_position_sane)
            .unwrap_or(false);

        if pos_ok {
            if let Ok(Some(m)) = main.current_monitor() {
                cache_main_monitor(m.clone());
                return Ok(m);
            }
            if let (Ok(pos), Ok(size)) = (main.outer_position(), main.outer_size()) {
                let cx = pos.x as f64 + size.width as f64 / 2.0;
                let cy = pos.y as f64 + size.height as f64 / 2.0;
                if let Ok(Some(m)) = main.monitor_from_point(cx, cy) {
                    cache_main_monitor(m.clone());
                    return Ok(m);
                }
            }
        }

        if let Ok(guard) = LAST_MAIN_MONITOR.lock() {
            if let Some(ref m) = *guard {
                return Ok(m.clone());
            }
        }

        if let Ok(Some(m)) = main.current_monitor() {
            cache_main_monitor(m.clone());
            return Ok(m);
        }
    }

    if let Ok(guard) = LAST_MAIN_MONITOR.lock() {
        if let Some(ref m) = *guard {
            return Ok(m.clone());
        }
    }

    app.primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no primary monitor".to_string())
}

fn reposition_island_window(
    app: &AppHandle,
    window: &tauri::WebviewWindow,
    logical_w: f64,
    logical_h: f64,
) -> Result<(), String> {
    let monitor = resolve_island_monitor(app)?;
    let (size, pos) = physical_size_for_island_window(&monitor, logical_w, logical_h);
    window
        .set_size(tauri::Size::Physical(size))
        .map_err(|e| e.to_string())?;
    window
        .set_position(tauri::Position::Physical(pos))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure_island_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(ISLAND_LABEL) {
        return Ok(w);
    }

    let _guard = ISLAND_CREATE_LOCK
        .lock()
        .map_err(|_| "island window lock poisoned".to_string())?;
    if let Some(w) = app.get_webview_window(ISLAND_LABEL) {
        return Ok(w);
    }

    let prefs = HardwareAccelerationDisk::load(&app.config().identifier);

    let mut builder = WebviewWindowBuilder::new(
        app,
        ISLAND_LABEL,
        WebviewUrl::App("index.html?rfWindow=island".into()),
    )
        .title("RuForge")
        .inner_size(DEFAULT_LOGICAL_W, DEFAULT_LOGICAL_H)
        .min_inner_size(220.0, 48.0)
        .max_inner_size(420.0, 280.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .window_classname(OBS_COMPAT_WINDOW_CLASSNAME);

    if let Some(browser_args) = prefs.webview_additional_browser_args() {
        builder = builder.additional_browser_args(&browser_args);
    }

    let window = builder.build().map_err(|e| e.to_string())?;
    reposition_island_window(app, &window, DEFAULT_LOGICAL_W, DEFAULT_LOGICAL_H)?;
    Ok(window)
}

#[tauri::command]
pub async fn island_overlay_ready(_app: AppHandle) -> Result<(), String> {
    OVERLAY_READY.store(true, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub async fn show_island_overlay(app: AppHandle) -> Result<(), String> {
    note_main_window_monitor(&app);
    let window = ensure_island_window(&app)?;
    reposition_island_window(&app, &window, DEFAULT_LOGICAL_W, DEFAULT_LOGICAL_H)?;
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn hide_island_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(ISLAND_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_island_overlay_bounds(
    app: AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(ISLAND_LABEL) else {
        return Ok(());
    };
    let w = width.clamp(220.0, 420.0);
    let h = height.clamp(48.0, 280.0);
    reposition_island_window(&app, &window, w, h)?;
    Ok(())
}
