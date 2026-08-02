//! Bottom-right overlay window for background notifications (replaces OS toasts).

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, EventTarget, Manager, PhysicalPosition, PhysicalSize, WebviewUrl};
use tauri::WebviewWindowBuilder;

use crate::hardware_acceleration::HardwareAccelerationDisk;
use crate::window_classname::OBS_COMPAT_WINDOW_CLASSNAME;

const NOTIFY_LABEL: &str = "notify";
const PUSH_EVENT: &str = "ruforge-background-notify";

static NOTIFY_CREATE_LOCK: Mutex<()> = Mutex::new(());
static PENDING: Mutex<VecDeque<BackgroundNotifyPayload>> = Mutex::new(VecDeque::new());
static OVERLAY_READY: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundNotifyPayload {
    pub id: String,
    pub title: String,
    pub body: String,
    pub kind: String,
}

fn fresh_notify_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let us = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_micros())
        .unwrap_or(0);
    format!("n-{us}-{:?}", std::thread::current().id())
}

fn work_area_bottom_right(
    work: &tauri::PhysicalRect<i32, u32>,
    win_w: u32,
    win_h: u32,
    edge_margin: i32,
    tray_reserve: i32,
) -> PhysicalPosition<i32> {
    let wx = work.position.x;
    let wy = work.position.y;
    let ww = work.size.width as i32;
    let wh = work.size.height as i32;
    let x = wx + ww - win_w as i32 - edge_margin;
    let y = wy + wh - win_h as i32 - edge_margin - tray_reserve;
    PhysicalPosition::new(x, y)
}

fn physical_size_for_notify_window(
    monitor: &tauri::Monitor,
    logical_w: f64,
    logical_h: f64,
) -> (PhysicalSize<u32>, PhysicalPosition<i32>) {
    let scale = monitor.scale_factor();
    let win_w = ((logical_w * scale).round() as u32).max(1);
    let win_h = ((logical_h * scale).round() as u32).max(1);
    let work = monitor.work_area();
    let pos = work_area_bottom_right(work, win_w, win_h, 12, 120);
    (PhysicalSize::new(win_w, win_h), pos)
}

fn reposition_notify_window(window: &tauri::WebviewWindow, logical_w: f64, logical_h: f64) -> Result<(), String> {
    let monitor = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no primary monitor".to_string())?;
    let (size, pos) = physical_size_for_notify_window(&monitor, logical_w, logical_h);
    window
        .set_size(tauri::Size::Physical(size))
        .map_err(|e| e.to_string())?;
    window
        .set_position(tauri::Position::Physical(pos))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn flush_pending_notify(app: &AppHandle) -> Result<(), String> {
    if !OVERLAY_READY.load(Ordering::Acquire) {
        return Ok(());
    }
    let batch: Vec<BackgroundNotifyPayload> = {
        let mut q = PENDING
            .lock()
            .map_err(|_| "notify queue lock poisoned".to_string())?;
        q.drain(..).collect()
    };
    for p in batch {
        app.emit_to(
            EventTarget::webview_window(NOTIFY_LABEL),
            PUSH_EVENT,
            p,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn ensure_notify_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(NOTIFY_LABEL) {
        return Ok(w);
    }

    let _guard = NOTIFY_CREATE_LOCK
        .lock()
        .map_err(|_| "notify window lock poisoned".to_string())?;
    if let Some(w) = app.get_webview_window(NOTIFY_LABEL) {
        return Ok(w);
    }

    let prefs = HardwareAccelerationDisk::load(&app.config().identifier);

    let mut builder = WebviewWindowBuilder::new(app, NOTIFY_LABEL, WebviewUrl::App("index.html?rfWindow=notify".into()))
        .title("RuForge")
        .inner_size(380.0, 120.0)
        .min_inner_size(380.0, 80.0)
        .max_inner_size(380.0, 900.0)
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

    reposition_notify_window(&window, 380.0, 120.0)?;

    Ok(window)
}

/// Called from the overlay webview once React listeners are mounted (avoids losing the first emit).
#[tauri::command]
pub async fn notify_overlay_ready(app: AppHandle) -> Result<(), String> {
    OVERLAY_READY.store(true, Ordering::Release);
    flush_pending_notify(&app)?;
    Ok(())
}

/// Push a notification card to the overlay window (creates the window on first use).
#[tauri::command]
pub async fn push_background_notify(
    app: AppHandle,
    title: String,
    body: String,
    kind: Option<String>,
) -> Result<(), String> {
    let window = ensure_notify_window(&app)?;
    let payload = BackgroundNotifyPayload {
        id: fresh_notify_id(),
        title,
        body,
        kind: kind.unwrap_or_else(|| "info".into()),
    };

    {
        let mut q = PENDING
            .lock()
            .map_err(|_| "notify queue lock poisoned".to_string())?;
        q.push_back(payload);
    }

    window.show().map_err(|e| e.to_string())?;
    flush_pending_notify(&app)?;
    // Do not focus — user may be typing elsewhere.
    Ok(())
}

/// Resize/reposition the overlay from measured stack height (logical pixels).
#[tauri::command]
pub async fn sync_notify_overlay_bounds(app: AppHandle, height: f64) -> Result<(), String> {
    let Some(window) = app.get_webview_window(NOTIFY_LABEL) else {
        return Ok(());
    };
    let h = height.clamp(72.0, 720.0);
    reposition_notify_window(&window, 380.0, h)?;
    Ok(())
}

#[tauri::command]
pub async fn hide_notify_overlay_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(NOTIFY_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
