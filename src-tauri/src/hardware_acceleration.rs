use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const HW_ACCEL_PREF_FILE: &str = "hardware-acceleration.json";

/// wry's Windows defaults, plus native-occlusion off so a fully visible window
/// on a non-foreground monitor is not treated as a background tab.
#[cfg(target_os = "windows")]
const WRY_WIN_DEFAULT_FEATURES: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion";

#[cfg(target_os = "windows")]
const WIN_VISIBLE_PLAYBACK_ARGS: &str = "--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding";

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
            "{} {} --disable-gpu --disable-gpu-compositing",
            WRY_WIN_DEFAULT_FEATURES, WIN_VISIBLE_PLAYBACK_ARGS,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    fn disable_gpu_browser_args() -> Option<String> {
        None
    }

    pub fn webview_additional_browser_args(&self) -> Option<String> {
        if self.hardware_acceleration {
            #[cfg(target_os = "windows")]
            {
                return Some(format!(
                    "{} {}",
                    WRY_WIN_DEFAULT_FEATURES, WIN_VISIBLE_PLAYBACK_ARGS
                ));
            }
            #[cfg(not(target_os = "windows"))]
            {
                return None;
            }
        }
        Self::disable_gpu_browser_args()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_playback_args_disable_occlusion_throttling() {
        let on = HardwareAccelerationDisk {
            hardware_acceleration: true,
        };
        let off = HardwareAccelerationDisk {
            hardware_acceleration: false,
        };
        #[cfg(target_os = "windows")]
        {
            let a = on.webview_additional_browser_args().expect("hw-on args");
            assert!(a.contains("CalculateNativeWinOcclusion"));
            assert!(a.contains("--disable-backgrounding-occluded-windows"));
            assert!(a.contains("--disable-renderer-backgrounding"));
            assert!(!a.contains("--disable-gpu"));
            let b = off.webview_additional_browser_args().expect("hw-off args");
            assert!(b.contains("--disable-gpu"));
            assert!(b.contains("CalculateNativeWinOcclusion"));
        }
        #[cfg(not(target_os = "windows"))]
        {
            assert!(on.webview_additional_browser_args().is_none());
            assert!(off.webview_additional_browser_args().is_none());
        }
    }
}
