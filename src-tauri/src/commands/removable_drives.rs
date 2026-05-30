use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

pub struct RemovableDrivesState {
    previous: Mutex<HashSet<String>>,
    last_newly_plugged: Mutex<Option<String>>,
}

impl Default for RemovableDrivesState {
    fn default() -> Self {
        Self {
            previous: Mutex::new(HashSet::new()),
            last_newly_plugged: Mutex::new(None),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovableDrivesPollResult {
    pub drives: Vec<String>,
    /// Best default export parent: last newly-plugged root still present, else None.
    pub default_dest: Option<String>,
}

#[tauri::command]
pub fn poll_removable_drives(
    state: State<'_, RemovableDrivesState>,
) -> Result<RemovableDrivesPollResult, String> {
    let current = enumerate_removable_roots();
    let mut previous = state
        .previous
        .lock()
        .map_err(|e| format!("removable drives lock: {e}"))?;
    let mut last_new = state
        .last_newly_plugged
        .lock()
        .map_err(|e| format!("removable drives lock: {e}"))?;

    let newly: Vec<String> = current
        .iter()
        .filter(|d| !previous.contains(*d))
        .cloned()
        .collect();

    if let Some(root) = newly.last() {
        *last_new = Some(root.clone());
    }

    let current_set: HashSet<String> = current.iter().cloned().collect();
    *previous = current_set;

    if let Some(ref root) = *last_new {
        if !current.contains(root) {
            *last_new = None;
        }
    }

    let default_dest = last_new
        .as_ref()
        .filter(|root| export_dest_dir_available_path(Path::new(root.as_str())))
        .cloned();

    Ok(RemovableDrivesPollResult {
        drives: current,
        default_dest,
    })
}

#[tauri::command]
pub fn export_dest_dir_available(path: String) -> bool {
    export_dest_dir_available_path(Path::new(path.trim()))
}

fn export_dest_dir_available_path(path: &Path) -> bool {
    path.exists() && path.is_dir()
}

#[cfg(windows)]
fn enumerate_removable_roots() -> Vec<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives};
    use windows::Win32::System::WindowsProgramming::DRIVE_REMOVABLE;

    let mask = unsafe { GetLogicalDrives() };
    let mut roots = Vec::new();

    for i in 0..26u32 {
        if mask & (1 << i) == 0 {
            continue;
        }
        let letter = (b'A' + i as u8) as char;
        let root = format!("{letter}:\\");
        let wide: Vec<u16> = root
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let ty = unsafe { GetDriveTypeW(PCWSTR(wide.as_ptr())) };
        if ty == DRIVE_REMOVABLE {
            roots.push(root);
        }
    }

    roots
}

#[cfg(not(windows))]
fn enumerate_removable_roots() -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_dest_dir_available_rejects_missing() {
        assert!(!export_dest_dir_available_path(Path::new(
            "Z:\\ruforge-nonexistent-export-dest-test"
        )));
    }
}
