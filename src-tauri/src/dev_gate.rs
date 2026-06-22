use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const DEV_GATE_PREF_FILE: &str = "dev-gate.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevGateDisk {
    #[serde(default)]
    pub show_debugging_settings: bool,
}

impl Default for DevGateDisk {
    fn default() -> Self {
        Self {
            show_debugging_settings: false,
        }
    }
}

impl DevGateDisk {
    pub fn load(identifier: &str) -> Self {
        std::fs::read_to_string(pref_path(identifier))
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default()
    }

    pub fn save_to_app_disk(&self, app: &AppHandle) -> Result<(), String> {
        let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(
            dir.join(DEV_GATE_PREF_FILE),
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
        .join(DEV_GATE_PREF_FILE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_when_file_missing() {
        let prefs = DevGateDisk::load("com.attic.ruforge.missing.devgate.test");
        assert_eq!(prefs, DevGateDisk::default());
    }
}
