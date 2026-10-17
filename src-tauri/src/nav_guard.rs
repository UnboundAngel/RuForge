use std::collections::HashSet;
use std::sync::Mutex;

use serde_json::json;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Emitter, Manager, Runtime, Url, Webview};

use crate::commands::private_mailbox::PrivateMailbox;
use crate::webview_trust::{
    blocked_target_label, is_allowed_glance_navigation, is_allowed_remote_navigation, is_glance_webview,
    is_remote_webview, remote_surface_name,
};

pub const SECURITY_TRIP_EVENT: &str = "security-trip";

static REPORTED_TARGETS: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn first_report(target: &str) -> bool {
    let Ok(mut guard) = REPORTED_TARGETS.lock() else {
        return false;
    };
    guard.get_or_insert_with(HashSet::new).insert(target.to_string())
}

fn report_blocked<R: Runtime>(webview: &Webview<R>, url: &Url) {
    let target = blocked_target_label(url);
    let surface = remote_surface_name(webview.label());
    log::warn!("[nav-guard] blocked {surface} webview navigation to {target}");
    if !first_report(&target) {
        return;
    }
    let app = webview.app_handle().clone();
    // NavigationStarting runs on the UI thread mid-navigation; emitting from there re-enters WebView2.
    tauri::async_runtime::spawn(async move {
        let payload = json!({ "kind": "navigation", "surface": surface, "target": target });
        if let Some(mailbox) = app.try_state::<PrivateMailbox>() {
            if mailbox.push(SECURITY_TRIP_EVENT, payload).is_ok() {
                let _ = app.emit_to("main", SECURITY_TRIP_EVENT, ());
            }
        }
    });
}

/// Keeps the YouTube webviews on YouTube and Google sign-in. A page that sends its webview to
/// the app origin would get the app's custom commands, so every other top-level navigation is
/// cancelled. Subframes get the same treatment in `windows_impl::guard_frames`. Also injects the
/// decoy API that trips the bell when a page goes looking for it.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("nav-guard")
        .js_init_script(include_str!("explorer_decoy.js"))
        .on_navigation(|webview, url| {
            if is_glance_webview(webview.label()) {
                return is_allowed_glance_navigation(url);
            }
            if !is_remote_webview(webview.label()) || is_allowed_remote_navigation(url) {
                return true;
            }
            report_blocked(webview, url);
            false
        })
        .on_webview_ready(|webview| {
            // Glance installs its guard itself, before its first page loads.
            if !is_remote_webview(webview.label()) {
                return;
            }
            #[cfg(windows)]
            {
                let webview = webview.clone();
                // Calling with_webview inline here runs on the main thread mid-creation and hangs the app.
                tauri::async_runtime::spawn(async move {
                    let label = webview.label().to_string();
                    let result = webview.with_webview(move |platform| {
                        if let Ok(core) = unsafe { platform.controller().CoreWebView2() } {
                            windows_impl::guard_frames(&core);
                        }
                    });
                    if let Err(e) = result {
                        log::warn!("[nav-guard] frame guard for {label} not installed: {e}");
                    }
                });
            }
            #[cfg(not(windows))]
            let _ = webview;
        })
        .build()
}

#[cfg(windows)]
pub mod windows_impl {
    use tauri::Url;
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2, ICoreWebView2_18};
    use webview2_com::{LaunchingExternalUriSchemeEventHandler, NavigationStartingEventHandler};
    use windows::core::{Interface, PWSTR};
    use windows::Win32::System::Com::CoTaskMemFree;

    use crate::webview_trust::is_allowed_frame_navigation;

    /// Cancels subframe navigations off public https (the app origin, `ipc`/`asset` hosts, local
    /// addresses, other schemes) and every hand-off to an external app (`steam:`, `ms-settings:`).
    pub fn guard_frames(core: &ICoreWebView2) {
        unsafe {
            let frames = NavigationStartingEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let mut raw = PWSTR::null();
                args.Uri(&mut raw)?;
                let uri = raw.to_string().unwrap_or_default();
                CoTaskMemFree(Some(raw.0 as *const _));
                if !Url::parse(&uri).is_ok_and(|u| is_allowed_frame_navigation(&u)) {
                    log::warn!("[nav-guard] blocked a subframe navigation");
                    args.SetCancel(true)?;
                }
                Ok(())
            }));
            let mut token = 0i64;
            if let Err(e) = core.add_FrameNavigationStarting(&frames, &mut token) {
                log::warn!("[nav-guard] frame guard failed: {e}");
            }
            let Ok(core18) = core.cast::<ICoreWebView2_18>() else {
                return;
            };
            let external = LaunchingExternalUriSchemeEventHandler::create(Box::new(|_, args| {
                if let Some(args) = args {
                    args.SetCancel(true)?;
                }
                Ok(())
            }));
            let mut token = 0i64;
            let _ = core18.add_LaunchingExternalUriScheme(&external, &mut token);
        }
    }
}
