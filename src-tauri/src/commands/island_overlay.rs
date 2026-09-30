//! Top-center overlay window for the desktop Dynamic Island: music while main is minimized or
//! tray-hidden, downloads and background notices while main is unfocused.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl};
use tauri::WebviewWindowBuilder;

use crate::hardware_acceleration::HardwareAccelerationDisk;
use crate::window_classname::OBS_COMPAT_WINDOW_CLASSNAME;

pub const ISLAND_LABEL: &str = "island";
pub const MAIN_HIDDEN_EVENT: &str = "ruforge:main-hidden";

const DEFAULT_LOGICAL_W: f64 = 366.0;
const DEFAULT_LOGICAL_H: f64 = 46.0;
const MIN_LOGICAL_H: f64 = 40.0;
/// Physical px between the work area top and the window; the overlay adds its own 6px CSS inset.
const TOP_EDGE_MARGIN: i32 = 4;

/// Windows reports minimized outer positions near -32000; treat those as unusable.
const MIN_SANE_OUTER_COORD: i32 = -10_000;

static ISLAND_CREATE_LOCK: Mutex<()> = Mutex::new(());
static OVERLAY_READY: AtomicBool = AtomicBool::new(false);
static LAST_MAIN_MONITOR: Mutex<Option<Monitor>> = Mutex::new(None);
/// The overlay only re-sends bounds when its state changes, so a re-show must keep the last size.
static LAST_LOGICAL_BOUNDS: Mutex<(f64, f64)> = Mutex::new((DEFAULT_LOGICAL_W, DEFAULT_LOGICAL_H));
static LAST_ISLAND_MONITOR_POS: Mutex<Option<(i32, i32)>> = Mutex::new(None);

fn last_logical_bounds() -> (f64, f64) {
    LAST_LOGICAL_BOUNDS
        .lock()
        .map(|g| *g)
        .unwrap_or((DEFAULT_LOGICAL_W, DEFAULT_LOGICAL_H))
}

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
    let pos = work_area_top_center(work, win_w, win_h, TOP_EDGE_MARGIN);
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

/// Monitor of the window the user is working in. Skips the island itself so clicking it never
/// counts as switching displays.
#[cfg(windows)]
fn foreground_monitor(app: &AppHandle) -> Option<Monitor> {
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONULL};
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let fg = unsafe { GetForegroundWindow() };
    if fg.0.is_null() {
        return None;
    }
    let island = app
        .get_webview_window(ISLAND_LABEL)
        .and_then(|w| w.hwnd().ok())
        .map(|h| h.0 as usize);
    if island == Some(fg.0 as usize) {
        return None;
    }
    let hmon = unsafe { MonitorFromWindow(fg, MONITOR_DEFAULTTONULL) };
    if hmon.is_invalid() {
        return None;
    }
    let mut info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if !unsafe { GetMonitorInfoW(hmon, &mut info) }.as_bool() {
        return None;
    }
    let rc = info.rcMonitor;
    app.available_monitors()
        .ok()?
        .into_iter()
        .find(|m| m.position().x == rc.left && m.position().y == rc.top)
}

#[cfg(not(windows))]
fn foreground_monitor(_app: &AppHandle) -> Option<Monitor> {
    None
}

fn resolve_island_monitor(app: &AppHandle) -> Result<Monitor, String> {
    if let Some(m) = foreground_monitor(app) {
        return Ok(m);
    }
    if let Ok(cursor) = app.cursor_position() {
        if let Ok(Some(m)) = app.monitor_from_point(cursor.x, cursor.y) {
            return Ok(m);
        }
    }

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
    if let Ok(mut guard) = LAST_ISLAND_MONITOR_POS.lock() {
        *guard = Some((monitor.position().x, monitor.position().y));
    }
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
        .min_inner_size(220.0, MIN_LOGICAL_H)
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
    let (w, h) = last_logical_bounds();
    reposition_island_window(app, &window, w, h)?;
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
    let (w, h) = last_logical_bounds();
    reposition_island_window(&app, &window, w, h)?;
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

/// Whether the user is in RuForge: the OS foreground window is ours and is not the island.
/// Main's own focus flag drops when the Explorer child webview or an overlay window takes
/// focus, which would pop the desktop island while the user is still in the app.
#[tauri::command]
pub fn app_is_foreground(app: AppHandle) -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
        let fg = unsafe { GetForegroundWindow() };
        if fg.0.is_null() {
            return false;
        }
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(fg, Some(&mut pid)) };
        if pid != std::process::id() {
            return false;
        }
        let island = app
            .get_webview_window(ISLAND_LABEL)
            .and_then(|w| w.hwnd().ok())
            .map(|h| h.0 as usize);
        island != Some(fg.0 as usize)
    }
    #[cfg(not(windows))]
    {
        app.get_webview_window("main")
            .and_then(|w| w.is_focused().ok())
            .unwrap_or(true)
    }
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
    let h = height.clamp(MIN_LOGICAL_H, 280.0);
    if let Ok(mut guard) = LAST_LOGICAL_BOUNDS.lock() {
        *guard = (w, h);
    }
    reposition_island_window(&app, &window, w, h)?;
    Ok(())
}

/// Moves the visible island when the user's foreground window is now on a different monitor.
/// Uses the foreground window only; the cursor alone passing over another display does not move it.
#[tauri::command]
pub fn island_follow_active_monitor(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(ISLAND_LABEL) else {
        return Ok(());
    };
    if !window.is_visible().unwrap_or(false) {
        return Ok(());
    }
    let Some(active) = foreground_monitor(&app) else {
        return Ok(());
    };
    let active_pos = (active.position().x, active.position().y);
    let last = LAST_ISLAND_MONITOR_POS.lock().ok().and_then(|g| *g);
    if last == Some(active_pos) {
        return Ok(());
    }
    let (w, h) = last_logical_bounds();
    reposition_island_window(&app, &window, w, h)
}

/// Cursor position relative to the island's client area in logical px. The overlay polls this
/// because a window that ignores cursor events gets no mouse events to tell it the cursor came back.
#[tauri::command]
pub fn island_cursor_position(app: AppHandle) -> Option<(f64, f64)> {
    let window = app.get_webview_window(ISLAND_LABEL)?;
    let cursor = app.cursor_position().ok()?;
    let origin = window.inner_position().ok()?;
    let scale = window.scale_factor().ok()?;
    Some((
        (cursor.x - origin.x as f64) / scale,
        (cursor.y - origin.y as f64) / scale,
    ))
}

#[tauri::command]
pub fn set_island_click_through(app: AppHandle, ignore: bool) -> Result<(), String> {
    let Some(window) = app.get_webview_window(ISLAND_LABEL) else {
        return Ok(());
    };
    window.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())
}
