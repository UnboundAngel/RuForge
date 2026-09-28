use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

/// The embedded YouTube webviews hold keyboard focus, so the main window never sees Alt.
/// A plugin init script reruns on every page load, unlike `eval_in_webview` injections.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("radial-nav-bridge")
        .js_init_script(include_str!("radial_nav_bridge.js"))
        .build()
}
