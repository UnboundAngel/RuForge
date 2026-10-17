//! yt-dlp reads `--cookies FILE` and writes the cookie jar back to it on exit, creating it when
//! missing. A path that is not an existing cookies file would let the caller create or overwrite
//! an arbitrary file with server-set cookie text, and a UNC path makes Windows contact that host.

use std::path::{Component, Path, PathBuf};

fn is_unc_or_device(raw: &str) -> bool {
    let b = raw.as_bytes();
    b.len() >= 2 && (b[0] == b'\\' || b[0] == b'/') && (b[1] == b'\\' || b[1] == b'/')
}

fn is_local_absolute(raw: &str) -> bool {
    #[cfg(windows)]
    {
        let b = raw.as_bytes();
        b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/')
    }
    #[cfg(not(windows))]
    {
        raw.starts_with('/') && !is_unc_or_device(raw)
    }
}

/// Lexical half of [`validate_cookie_file`]: absolute local path, no `..`, and a `.txt` name or
/// no extension at all (the Internal export is an extensionless temp file).
pub fn check_cookie_file_path(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.contains('\0') {
        return Err("Cookie file path is empty".into());
    }
    if is_unc_or_device(raw) {
        return Err("Cookie files on network shares are not supported".into());
    }
    if !is_local_absolute(raw) {
        return Err("Cookie file path must be absolute".into());
    }
    let path = PathBuf::from(raw);
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("Cookie file path must not contain '..'".into());
    }
    match path.extension().and_then(|e| e.to_str()) {
        None => {}
        Some(ext) if ext.eq_ignore_ascii_case("txt") => {}
        Some(_) => return Err("Cookie file must be a .txt file".into()),
    }
    Ok(path)
}

/// The cookie file must already exist as a regular file (not a folder, link or device).
pub fn validate_cookie_file(raw: &str) -> Result<PathBuf, String> {
    let path = check_cookie_file_path(raw)?;
    let meta = std::fs::symlink_metadata(Path::new(&path))
        .map_err(|_| format!("Cookie file not found: {}", path.display()))?;
    if !meta.file_type().is_file() {
        return Err(format!("Cookie file is not a regular file: {}", path.display()));
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_device_relative_and_parent_paths_are_rejected() {
        for raw in [
            "",
            "   ",
            r"\\192.0.2.10\share\cookies.txt",
            "//attacker/share/cookies.txt",
            r"\\?\C:\cookies.txt",
            r"\\.\pipe\x",
            "cookies.txt",
            "--exec=calc",
            "a\0b.txt",
        ] {
            assert!(check_cookie_file_path(raw).is_err(), "{raw:?}");
        }
        #[cfg(windows)]
        {
            assert!(check_cookie_file_path(r"C:relative\cookies.txt").is_err());
            assert!(check_cookie_file_path(r"C:\Users\x\..\..\Windows\cookies.txt").is_err());
        }
    }

    #[test]
    fn only_txt_or_extensionless_names_pass() {
        let base = if cfg!(windows) { r"C:\Users\x\" } else { "/home/x/" };
        assert!(check_cookie_file_path(&format!("{base}cookies.txt")).is_ok());
        assert!(check_cookie_file_path(&format!("{base}Cookies.TXT")).is_ok());
        assert!(check_cookie_file_path(&format!("{base}.tmpAb12Cd")).is_ok());
        for bad in ["evil.bat", "x.exe", "startup.lnk", "a.dll", "cookies.txt.ps1"] {
            assert!(check_cookie_file_path(&format!("{base}{bad}")).is_err(), "{bad}");
        }
    }

    #[test]
    fn file_must_exist_and_be_regular() {
        let dir = std::env::temp_dir().join(format!("rf-cookie-check-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let real = dir.join("cookies.txt");
        std::fs::write(&real, "# Netscape HTTP Cookie File\n").unwrap();
        assert!(validate_cookie_file(&real.to_string_lossy()).is_ok());
        assert!(validate_cookie_file(&dir.join("missing.txt").to_string_lossy()).is_err());
        let folder = dir.join("folder.txt");
        std::fs::create_dir_all(&folder).unwrap();
        assert!(validate_cookie_file(&folder.to_string_lossy()).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
