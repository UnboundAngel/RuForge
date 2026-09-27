use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Fired with a [`RemovableDrivesSnapshot`] whenever the set of removable drives changes.
pub const REMOVABLE_DRIVES_CHANGED_EVENT: &str = "removable-drives-changed";

/// Drive enumeration is a couple of cheap syscalls, so a native loop is fine; what it
/// replaces is the webview polling over IPC every 1.5s, which re-rendered the app root.
const WATCH_INTERVAL: Duration = Duration::from_millis(1500);

#[derive(Default)]
struct Tracker {
    previous: HashSet<String>,
    last_newly_plugged: Option<String>,
    latest: RemovableDrivesSnapshot,
}

#[derive(Default)]
pub struct RemovableDrivesState {
    tracker: Mutex<Tracker>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovableDrivesSnapshot {
    pub drives: Vec<String>,
    /// Best default export parent: last newly-plugged root still present, else None.
    pub default_dest: Option<String>,
}

impl RemovableDrivesState {
    /// Re-enumerates drives and returns the new snapshot only when it differs from the last one.
    fn refresh(&self) -> Option<RemovableDrivesSnapshot> {
        let current = enumerate_removable_roots();
        let mut t = self.tracker.lock().ok()?;

        if let Some(root) = current.iter().filter(|d| !t.previous.contains(*d)).last() {
            t.last_newly_plugged = Some(root.clone());
        }
        t.previous = current.iter().cloned().collect();
        if t
            .last_newly_plugged
            .as_ref()
            .is_some_and(|root| !current.contains(root))
        {
            t.last_newly_plugged = None;
        }

        let default_dest = t
            .last_newly_plugged
            .as_ref()
            .filter(|root| export_dest_dir_available_path(Path::new(root.as_str())))
            .cloned();
        let next = RemovableDrivesSnapshot {
            drives: current,
            default_dest,
        };
        if next == t.latest {
            return None;
        }
        t.latest = next.clone();
        Some(next)
    }

    fn latest(&self) -> RemovableDrivesSnapshot {
        self.tracker
            .lock()
            .map(|t| t.latest.clone())
            .unwrap_or_default()
    }
}

/// Starts the background watcher. Takes the first reading synchronously so
/// `get_removable_drives` is already current when the webview asks.
pub fn spawn_removable_drives_watcher(app: &AppHandle) {
    app.state::<RemovableDrivesState>().refresh();
    let app = app.clone();
    std::thread::Builder::new()
        .name("removable-drives-watch".into())
        .spawn(move || loop {
            std::thread::sleep(WATCH_INTERVAL);
            if let Some(snapshot) = app.state::<RemovableDrivesState>().refresh() {
                let _ = app.emit(REMOVABLE_DRIVES_CHANGED_EVENT, snapshot);
            }
        })
        .ok();
}

#[tauri::command]
pub fn get_removable_drives(state: State<'_, RemovableDrivesState>) -> RemovableDrivesSnapshot {
    state.latest()
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
