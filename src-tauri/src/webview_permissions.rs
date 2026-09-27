use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

/// Chromium re-prompts for mic (speaker label unlock) and clipboard read on every
/// dev reload. Grant both silently, but only for RuForge's own origin so the
/// Explorer webview on third-party sites keeps the default prompt.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("webview-permissions")
        .on_webview_ready(|webview| {
            // Calling with_webview inline here runs on the main thread mid-creation and
            // hangs the app; queueing it from a task lets the event loop finish first.
            #[cfg(windows)]
            {
                let webview = webview.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = webview.with_webview(|platform| {
                        if let Err(e) = windows_impl::install(&platform.controller()) {
                            log::warn!("[webview-permissions] install failed: {e}");
                        }
                    }) {
                        log::warn!("[webview-permissions] with_webview failed: {e}");
                    }
                });
            }
            #[cfg(not(windows))]
            let _ = webview;
        })
        .build()
}

#[cfg(windows)]
mod windows_impl {
    use tauri::Url;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Controller, ICoreWebView2PermissionRequestedEventArgs,
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;
    use windows::core::PWSTR;
    use windows::Win32::System::Com::CoTaskMemFree;

    pub fn install(controller: &ICoreWebView2Controller) -> windows::core::Result<()> {
        unsafe {
            let core = controller.CoreWebView2()?;
            let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
                if let Some(args) = args {
                    maybe_allow(&args)?;
                }
                Ok(())
            }));
            let mut token = 0i64;
            core.add_PermissionRequested(&handler, &mut token)
        }
    }

    unsafe fn maybe_allow(
        args: &ICoreWebView2PermissionRequestedEventArgs,
    ) -> windows::core::Result<()> {
        let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
        args.PermissionKind(&mut kind)?;
        if kind != COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
            && kind != COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ
        {
            return Ok(());
        }

        let mut raw = PWSTR::null();
        args.Uri(&mut raw)?;
        let uri = raw.to_string().unwrap_or_default();
        CoTaskMemFree(Some(raw.0 as *const _));

        if is_app_origin(&uri) {
            args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
        }
        Ok(())
    }

    fn is_app_origin(uri: &str) -> bool {
        let Ok(url) = Url::parse(uri) else {
            return false;
        };
        match url.scheme() {
            "tauri" => true,
            "http" | "https" => matches!(url.host_str(), Some("localhost" | "tauri.localhost")),
            _ => false,
        }
    }
}
