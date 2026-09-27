use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpace {
    pub dir: String,
    /// Stable key for the volume holding `dir`, so the queue can pool jobs that share a disk.
    pub volume: Option<String>,
    /// Bytes available to this process; `None` when the OS query failed.
    pub free_bytes: Option<u64>,
}

/// Download folders may not exist until the first job writes them.
fn nearest_existing_ancestor(path: &Path) -> Option<PathBuf> {
    let mut cur = Some(path);
    while let Some(p) = cur {
        if p.exists() {
            return Some(p.to_path_buf());
        }
        cur = p.parent();
    }
    None
}

#[cfg(unix)]
fn free_and_volume(path: &Path) -> Option<(u64, String)> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::MetadataExt;

    let c = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut st: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c.as_ptr(), &mut st) } != 0 {
        return None;
    }
    #[allow(clippy::unnecessary_cast)]
    let free = (st.f_bavail as u64).saturating_mul(st.f_frsize as u64);
    let dev = std::fs::metadata(path).ok()?.dev();
    Some((free, format!("dev:{dev}")))
}

#[cfg(windows)]
fn free_and_volume(path: &Path) -> Option<(u64, String)> {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Component;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut avail: u64 = 0;
    unsafe { GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&mut avail as *mut u64), None, None) }.ok()?;
    let volume = match path.components().next() {
        Some(Component::Prefix(p)) => p.as_os_str().to_string_lossy().to_uppercase(),
        _ => path.to_string_lossy().to_uppercase(),
    };
    Some((avail, volume))
}

#[cfg(not(any(unix, windows)))]
fn free_and_volume(_path: &Path) -> Option<(u64, String)> {
    None
}

fn disk_space_for(dir: &str) -> DiskSpace {
    let probe = nearest_existing_ancestor(Path::new(dir.trim()));
    let hit = probe.as_deref().and_then(free_and_volume);
    DiskSpace {
        dir: dir.to_string(),
        volume: hit.as_ref().map(|(_, v)| v.clone()),
        free_bytes: hit.map(|(f, _)| f),
    }
}

/// Free space for each download target, probed at the nearest existing ancestor.
#[tauri::command]
pub async fn get_disk_space(dirs: Vec<String>) -> Vec<DiskSpace> {
    tauri::async_runtime::spawn_blocking(move || dirs.iter().map(|d| disk_space_for(d)).collect())
        .await
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_child_dir_probes_existing_parent() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("not").join("yet");
        let space = disk_space_for(missing.to_str().unwrap());
        assert!(space.free_bytes.is_some());
        assert_eq!(space.volume, disk_space_for(tmp.path().to_str().unwrap()).volume);
    }
}
