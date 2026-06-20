use tauri::AppHandle;

use crate::telemetry_prefs::{TelemetryPrefsDisk, write_telemetry_prefs};
use crate::telemetry_scrub;

pub fn apply_sentry_enabled(_enabled: bool) {}

#[tauri::command]
pub fn sync_telemetry_prefs(
    app: AppHandle,
    usage: bool,
    crash: bool,
    install_id: Option<String>,
    path_roots: Vec<String>,
) -> Result<(), String> {
    let identifier = app.config().identifier.clone();
    let prefs = TelemetryPrefsDisk {
        telemetry_usage_enabled: usage,
        telemetry_crash_enabled: crash,
        install_id,
    };
    write_telemetry_prefs(&identifier, &prefs)?;
    telemetry_scrub::set_path_roots(path_roots);
    apply_sentry_enabled(crash);
    Ok(())
}
