use tauri::menu::{Menu, MenuEvent, MenuItem, Submenu};
use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub fn setup_tray(app: &tauri::App) -> Result<(), tauri::Error> {
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;

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
        .on_menu_event(|app: &AppHandle, event: MenuEvent| match event.id.as_ref() {
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
                app.exit(0);
            }
            "reset_data" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval("localStorage.clear(); location.reload();");
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray: &TrayIcon, event: TrayIconEvent| {
            if let TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    let _tray = tray_builder.build(app)?;
    Ok(())
}
