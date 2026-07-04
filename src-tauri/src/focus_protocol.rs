//! V1.1 focus-only custom protocol bridge (`ruforge://focus`).
//!
//! External trigger: another app, the OS, or the user opens `ruforge://focus` (for example
//! from a browser bookmark, Companion localhost page, or `start ruforge://focus` on Windows).
//! The handler only raises the existing main RuForge window. It does not read query params,
//! paths, media IDs, download URLs, or command names, so it cannot enqueue downloads or mutate
//! the library.

use tauri::{AppHandle, Emitter, EventTarget, Manager};

/// Emitted to the main webview for a second JS focus pass (tray menu, deep link).
pub const TRAY_SHOW_MAIN_EVENT: &str = "ruforge:tray-show-main";

const SCHEME_PREFIX: &str = "ruforge://";

/// Fail-closed allowlist: exact focus route only (`ruforge://focus`, optional trailing slash).
pub fn is_focus_only_url(raw: &str) -> bool {
    let s = raw.trim();
    if s.len() < SCHEME_PREFIX.len() + 5 {
        return false;
    }
    if !s[..SCHEME_PREFIX.len()].eq_ignore_ascii_case(SCHEME_PREFIX) {
        return false;
    }
    let rest = &s[SCHEME_PREFIX.len()..];
    if rest.contains('?') || rest.contains('#') {
        return false;
    }
    let rest = rest.trim_end_matches('/');
    if rest.contains('/') {
        return false;
    }
    rest.eq_ignore_ascii_case("focus")
}

pub fn try_focus_from_url_str(app: &AppHandle, raw: &str) {
    if is_focus_only_url(raw) {
        request_show_main(app);
    } else {
        crate::rf_log!(
            "core.focus-protocol",
            log::Level::Info,
            "ignored deep link (not ruforge://focus)"
        );
    }
}

pub fn request_show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit_to(
        EventTarget::webview_window("main"),
        TRAY_SHOW_MAIN_EVENT,
        (),
    );
}

pub fn setup_focus_protocol(app: &tauri::App) -> Result<(), String> {
    use tauri_plugin_deep_link::DeepLinkExt;

    #[cfg(any(windows, target_os = "linux"))]
    if let Err(e) = app.deep_link().register_all() {
        crate::rf_log!(
            "core.focus-protocol",
            log::Level::Warn,
            "register_all failed (installed builds register at setup; dev may need `start ruforge://focus`): {e}"
        );
    }

    let handle = app.handle().clone();
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        for url in urls {
            try_focus_from_url_str(&handle, url.as_str());
        }
    }

    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            try_focus_from_url_str(&handle, url.as_str());
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_focus_only_url;

    #[test]
    fn accepts_focus_route_only() {
        assert!(is_focus_only_url("ruforge://focus"));
        assert!(is_focus_only_url("  ruforge://focus  "));
        assert!(is_focus_only_url("RuForge://FOCUS"));
        assert!(is_focus_only_url("ruforge://focus/"));
    }

    #[test]
    fn rejects_non_focus_routes() {
        assert!(!is_focus_only_url("ruforge://focus/extra"));
        assert!(!is_focus_only_url("ruforge://focus?x=1"));
        assert!(!is_focus_only_url("ruforge://focus#x"));
        assert!(!is_focus_only_url("ruforge://download"));
        assert!(!is_focus_only_url("https://example.com"));
    }
}
