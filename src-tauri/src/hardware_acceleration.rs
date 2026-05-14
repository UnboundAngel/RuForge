use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const HW_ACCEL_PREF_FILE: &str = "hardware-acceleration.json";

#[cfg(target_os = "windows")]
const WRY_WIN_DEFAULT_FEATURES: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareAccelerationDisk {
    #[serde(default = "default_hardware_acceleration_enabled")]
    pub hardware_acceleration: bool,
}

fn default_hardware_acceleration_enabled() -> bool {
    true
}

impl Default for HardwareAccelerationDisk {
    fn default() -> Self {
        Self {
            hardware_acceleration: true,
        }
    }
}

impl HardwareAccelerationDisk {
    pub fn load(identifier: &str) -> Self {
        std::fs::read_to_string(pref_path(identifier))
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default()
    }

    #[cfg(target_os = "windows")]
    fn disable_gpu_browser_args() -> Option<String> {
        Some(format!(
            "{} --disable-gpu --disable-gpu-compositing",
            WRY_WIN_DEFAULT_FEATURES,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    fn disable_gpu_browser_args() -> Option<String> {
        None
    }

    pub fn webview_additional_browser_args(&self) -> Option<String> {
        if self.hardware_acceleration {
            None
        } else {
            Self::disable_gpu_browser_args()
        }
    }

    pub fn save_to_app_disk(&self, app: &AppHandle) -> Result<(), String> {
        let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(
            dir.join(HW_ACCEL_PREF_FILE),
            serde_json::to_string(self).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub fn pref_path(identifier: &str) -> std::path::PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(identifier)
        .join(HW_ACCEL_PREF_FILE)
}

pub fn apply_hardware_acceleration_prefs_to_context<R>(ctx: &mut tauri::Context<R>)
where
    R: tauri::Runtime,
{
    let prefs = HardwareAccelerationDisk::load(&ctx.config().identifier);
    if let Some(args) = prefs.webview_additional_browser_args() {
        for w in &mut ctx.config_mut().app.windows {
            w.additional_browser_args = Some(args.clone());
        }
    }
}
