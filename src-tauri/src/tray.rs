use tauri::menu::{Menu, MenuEvent, MenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, EventTarget, Manager};

/// Emitted to the **main** webview only. Handled in `App.tsx` using `@tauri-apps/api/webviewWindow`
/// (`unminimize`, `show`, `setFocus`) — the same public API documented for the JS window layer.
pub const TRAY_SHOW_MAIN_EVENT: &str = "ruforge:tray-show-main";

/// Prints one line to **stderr** (visible in `tauri dev` / terminal). Used from the main webview
/// so tray debugging does not rely on the browser console.
#[tauri::command]
pub fn tray_front_debug(line: String) {
    eprintln!("[ruforge-tray] {line}");
}

fn request_show_main_from_tray(app: &AppHandle) {
    eprintln!("[ruforge-tray] Rust: Show menu item matched, emitting `{TRAY_SHOW_MAIN_EVENT}` → main webview");
    match app.emit_to(
        EventTarget::webview_window("main"),
        TRAY_SHOW_MAIN_EVENT,
        (),
    ) {
        Ok(()) => eprintln!("[ruforge-tray] Rust: emit_to returned Ok"),
        Err(e) => eprintln!("[ruforge-tray] Rust: emit_to FAILED: {e}"),
    }
}

pub fn setup_tray(app: &tauri::App) -> Result<(), tauri::Error> {
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let show_menu_id = show_i.id().clone();

    let reload_i = MenuItem::with_id(app, "reload", "Reload Interface", true, None::<&str>)?;
    let toggle_gpu_i = MenuItem::with_id(
        app,
        "toggle_gpu",
        "Toggle GPU Acceleration & Restart",
        true,
        None::<&str>,
    )?;
    let reset_i = MenuItem::with_id(
        app,
        "reset_data",
        "Reset App Data & Restart",
        true,
        None::<&str>,
    )?;

    let troubleshooting_m = Submenu::with_items(
        app,
        "Troubleshooting",
        true,
        &[&reload_i, &toggle_gpu_i, &reset_i],
    )?;

    let menu = Menu::with_items(app, &[&show_i, &troubleshooting_m, &quit_i])?;

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(move |app: &AppHandle, event: MenuEvent| {
            if event.id == show_menu_id {
                request_show_main_from_tray(app);
                return;
            }
            match event.id.as_ref() {
                "quit" => {
                    app.exit(0);
                }
                "reload" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.eval("location.reload()");
                    }
                }
                "toggle_gpu" => {
                    app.exit(0);
                }
                "reset_data" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.eval("localStorage.clear(); location.reload();");
                    }
                    app.exit(0);
                }
                _ => {}
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    let _tray = tray_builder.build(app)?;
    Ok(())
}
