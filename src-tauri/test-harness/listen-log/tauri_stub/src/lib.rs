pub use tauri_macros_stub::command;
pub struct AppHandle;
pub struct PathResolver;
impl PathResolver {
    pub fn app_data_dir(&self) -> Result<std::path::PathBuf, String> { Err("stub".into()) }
}
pub trait Manager { fn path(&self) -> PathResolver; }
impl Manager for AppHandle { fn path(&self) -> PathResolver { PathResolver } }
pub mod async_runtime {
    pub async fn spawn_blocking<F, R>(f: F) -> Result<R, String>
    where
        F: FnOnce() -> R,
    {
        Ok(f())
    }
}
