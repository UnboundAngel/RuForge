pub use tauri_macros_stub::command;
pub use url::Url;
pub struct AppHandle;
pub struct PathResolver;
impl PathResolver {
    pub fn app_data_dir(&self) -> Result<std::path::PathBuf, String> {
        Err("stub".into())
    }
}
pub trait Manager {
    fn path(&self) -> PathResolver;
    fn get_webview_window(&self, _label: &str) -> Option<WebviewWindow> {
        None
    }
}
impl Manager for AppHandle {
    fn path(&self) -> PathResolver {
        PathResolver
    }
}

pub trait Emitter {
    fn emit<S: serde::Serialize>(&self, _event: &str, _payload: S) -> Result<(), String> {
        Ok(())
    }
}
impl Emitter for WebviewWindow {}

pub struct WebviewWindow {
    label: String,
}
impl WebviewWindow {
    pub fn label(&self) -> &str {
        &self.label
    }
}

pub mod async_runtime {
    pub async fn spawn_blocking<F, R>(f: F) -> Result<R, String>
    where
        F: FnOnce() -> R,
    {
        Ok(f())
    }
}
