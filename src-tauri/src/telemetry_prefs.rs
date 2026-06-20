use serde::{Deserialize, Serialize};

const TELEMETRY_PREF_FILE: &str = "telemetry-prefs.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryPrefsDisk {
    #[serde(default)]
    pub telemetry_usage_enabled: bool,
    #[serde(default)]
    pub telemetry_crash_enabled: bool,
    #[serde(default)]
    pub install_id: Option<String>,
}

impl Default for TelemetryPrefsDisk {
    fn default() -> Self {
        Self {
            telemetry_usage_enabled: false,
            telemetry_crash_enabled: false,
            install_id: None,
        }
    }
}

pub fn pref_path(identifier: &str) -> std::path::PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(identifier)
        .join(TELEMETRY_PREF_FILE)
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn read_telemetry_prefs(identifier: &str) -> TelemetryPrefsDisk {
    std::fs::read_to_string(pref_path(identifier))
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

pub fn write_telemetry_prefs(identifier: &str, prefs: &TelemetryPrefsDisk) -> Result<(), String> {
    let path = pref_path(identifier);
    let Some(parent) = path.parent() else {
        return Err("telemetry prefs path has no parent".into());
    };
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    std::fs::write(
        path,
        serde_json::to_string(prefs).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_when_file_missing() {
        let prefs = read_telemetry_prefs("com.attic.ruforge.missing.test");
        assert_eq!(prefs, TelemetryPrefsDisk::default());
    }
}
