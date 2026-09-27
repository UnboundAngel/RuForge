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

/// udisks mounts user media under `/media/<user>` (Debian/Ubuntu) or `/run/media/<user>`
/// (Fedora/Arch); `/proc/mounts` is used instead of listing those dirs because stale
/// mount-point folders can outlive an unplugged drive.
#[cfg(target_os = "linux")]
fn enumerate_removable_roots() -> Vec<String> {
    let Ok(mounts) = std::fs::read_to_string("/proc/mounts") else {
        return Vec::new();
    };
    linux_removable_mount_points(&mounts)
}

#[cfg(target_os = "linux")]
fn linux_removable_mount_points(mounts: &str) -> Vec<String> {
    let mut roots: Vec<String> = mounts
        .lines()
        .filter_map(|line| line.split_whitespace().nth(1))
        .map(unescape_proc_mounts_field)
        .filter(|mp| mp.starts_with("/media/") || mp.starts_with("/run/media/"))
        .collect();
    roots.sort();
    roots.dedup();
    roots
}

/// `/proc/mounts` writes space, tab, newline and backslash as three-digit octal escapes.
#[cfg(target_os = "linux")]
fn unescape_proc_mounts_field(field: &str) -> String {
    let bytes = field.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' && i + 3 < bytes.len() {
            let digits = &bytes[i + 1..i + 4];
            let parsed = std::str::from_utf8(digits)
                .ok()
                .and_then(|d| u8::from_str_radix(d, 8).ok());
            if let Some(v) = parsed {
                out.push(v);
                i += 4;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Every mounted volume shows up in `/Volumes`; the boot volume is a symlink to `/`.
#[cfg(target_os = "macos")]
fn enumerate_removable_roots() -> Vec<String> {
    let Ok(entries) = std::fs::read_dir("/Volumes") else {
        return Vec::new();
    };
    let mut roots: Vec<String> = entries
        .flatten()
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .filter(|e| {
            e.file_type().map(|t| !t.is_symlink()).unwrap_or(false) && e.path().is_dir()
        })
        .map(|e| e.path().to_string_lossy().into_owned())
        .collect();
    roots.sort();
    roots
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
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

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_mounts_keep_only_user_media() {
        let mounts = "\
/dev/nvme0n1p2 / ext4 rw 0 0
/dev/sdb1 /media/angel/USB\\040STICK vfat rw 0 0
/dev/sdc1 /run/media/angel/Backup exfat rw 0 0
tmpfs /run/user/1000 tmpfs rw 0 0
";
        assert_eq!(
            linux_removable_mount_points(mounts),
            vec![
                "/media/angel/USB STICK".to_string(),
                "/run/media/angel/Backup".to_string(),
            ]
        );
    }
}
