//! Path checks for commands that touch the filesystem on the frontend's behalf.
//!
//! Merely opening a UNC path (`\\host\share`) makes Windows contact that host and offer the user's
//! NTLM credentials, so these checks are lexical and run before any filesystem call. UNC paths are
//! only accepted when they sit under a UNC library root the user configured.

use std::path::{Component, Path, PathBuf};

/// Win32 device and NT namespace prefixes: `\\?\`, `\\.\`, `\??\`, in either slash direction.
pub fn is_device_path(raw: &str) -> bool {
    let b = raw.as_bytes();
    let sep = |c: u8| c == b'\\' || c == b'/';
    if b.len() >= 4 && sep(b[0]) && sep(b[1]) && (b[2] == b'?' || b[2] == b'.') && sep(b[3]) {
        return true;
    }
    b.len() >= 4 && sep(b[0]) && b[1] == b'?' && b[2] == b'?' && sep(b[3])
}

/// `\\server\share` or `//server/share` (device paths count too).
pub fn is_unc_path(raw: &str) -> bool {
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
        raw.starts_with('/') && !is_unc_path(raw)
    }
}

fn unc_key(raw: &str) -> String {
    let mut s = raw.replace('/', "\\").to_ascii_lowercase();
    while s.ends_with('\\') && s.len() > 2 {
        s.pop();
    }
    s
}

/// Lexical: `path` is `root` or below it, both UNC.
fn unc_under_root(path: &str, root: &str) -> bool {
    if !is_unc_path(root) || is_device_path(root) {
        return false;
    }
    let p = unc_key(path);
    let r = unc_key(root);
    p == r || p.strip_prefix(&r).is_some_and(|rest| rest.starts_with('\\'))
}

/// Accepts an absolute local path, or a UNC path under one of `roots`. Rejects device paths,
/// relative paths, `..` components and NUL bytes. Touches no filesystem.
pub fn check_path(raw: &str, roots: &[String]) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.len() > 32_767 || raw.contains('\0') {
        return Err("Invalid path".into());
    }
    if is_device_path(raw) {
        return Err("Device paths are not allowed".into());
    }
    if is_unc_path(raw) {
        if !roots.iter().any(|r| unc_under_root(raw, r.trim())) {
            return Err("Network paths outside the library are not allowed".into());
        }
    } else if !is_local_absolute(raw) {
        return Err("Path must be absolute".into());
    }
    let path = PathBuf::from(raw);
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("Path must not contain '..'".into());
    }
    Ok(path)
}

/// Canonical form of `path`, resolving the deepest existing ancestor when the leaf is already gone
/// (deleting a file that vanished still has to prove where it was).
fn canonicalize_lenient(path: &Path) -> Option<PathBuf> {
    let mut suffix: Vec<&std::ffi::OsStr> = Vec::new();
    let mut cur = path;
    loop {
        if let Ok(c) = cur.canonicalize() {
            let mut out = c;
            for part in suffix.iter().rev() {
                out.push(part);
            }
            return Some(out);
        }
        suffix.push(cur.file_name()?);
        cur = cur.parent()?;
    }
}

/// [`check_path`] plus containment: the canonical path (junctions resolved) must be inside one of
/// `roots`. Roots that fail [`check_path`] themselves are ignored.
pub fn check_path_within_roots(raw: &str, roots: &[String]) -> Result<PathBuf, String> {
    let path = check_path(raw, roots)?;
    let canonical = canonicalize_lenient(&path).ok_or_else(|| "Path is not reachable".to_string())?;
    let inside = roots.iter().map(|r| r.trim()).filter(|r| !r.is_empty()).any(|r| {
        check_path(r, roots).is_ok()
            && Path::new(r).canonicalize().is_ok_and(|root| canonical.starts_with(root))
    });
    if !inside {
        return Err("Path is outside the library folders".into());
    }
    Ok(path)
}

pub fn truncate_on_char_boundary(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// `CON`, `NUL`, `COM1` and friends open a device on Windows, with or without an extension.
pub fn is_windows_reserved_name(name: &str) -> bool {
    let base = name.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
    let b = base.as_bytes();
    matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (b.len() == 4
            && (base.starts_with("COM") || base.starts_with("LPT"))
            && (b'1'..=b'9').contains(&b[3]))
}

/// One path segment from untrusted text (playlist or video titles): no separators, never `.` or
/// `..`, never a device name, at most `max_bytes` long without splitting a character.
pub fn sanitize_folder_name(raw: &str, max_bytes: usize, fallback: &str) -> String {
    let s: String = raw
        .trim()
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut s = truncate_on_char_boundary(&s, max_bytes).trim_end().to_string();
    // Windows drops trailing dots and spaces, so "." and ".." would name the parent folder.
    while s.ends_with('.') || s.ends_with(' ') {
        s.pop();
    }
    if s.is_empty() {
        return fallback.to_string();
    }
    if is_windows_reserved_name(&s) {
        s.insert(0, '_');
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn none() -> Vec<String> {
        Vec::new()
    }

    fn folder(raw: &str) -> String {
        sanitize_folder_name(raw, 120, "playlist")
    }

    #[test]
    fn folder_names_cannot_name_the_parent_or_a_device() {
        assert_eq!(folder(".."), "playlist");
        assert_eq!(folder("."), "playlist");
        assert_eq!(folder(" . . "), "playlist");
        assert_eq!(folder("../../Windows"), ".._.._Windows");
        assert_eq!(folder(r"a\b/c"), "a_b_c");
        assert_eq!(folder("Mix..."), "Mix");
        assert_eq!(folder("CON"), "_CON");
        assert_eq!(folder("nul.txt"), "_nul.txt");
        assert_eq!(folder("COM1"), "_COM1");
        assert_eq!(folder("COM0"), "COM0");
        assert_eq!(folder("Console"), "Console");
        assert_eq!(folder("   "), "playlist");
        assert_eq!(folder("tab\there"), "tab here");
    }

    #[test]
    fn folder_names_truncate_on_a_char_boundary() {
        let title = format!("a{}", "é".repeat(60));
        assert_eq!(title.len(), 121);
        let out = folder(&title);
        assert!(out.len() <= 120);
        assert!(out.starts_with('a') && out.ends_with('é'));
        assert_eq!(folder(&"🎵".repeat(40)).chars().count(), 30);
        assert_eq!(truncate_on_char_boundary("abc", 10), "abc");
        assert_eq!(truncate_on_char_boundary("aé", 2), "a");
        assert_eq!(truncate_on_char_boundary("é", 1), "");
    }

    #[test]
    fn device_prefixes_are_rejected_in_both_slash_directions() {
        for raw in [r"\\?\C:\x.mp4", r"\\.\PhysicalDrive0", r"\??\C:\x", "//?/C:/x", "//./pipe/x", r"\\?\UNC\h\s\x"] {
            assert!(is_device_path(raw), "{raw}");
            assert!(check_path(raw, &none()).is_err(), "{raw}");
        }
        assert!(!is_device_path(r"C:\x"));
        assert!(!is_device_path(r"\\server\share\x"));
    }

    #[test]
    fn unc_is_rejected_unless_under_a_unc_root() {
        let roots = vec![r"\\nas\media\RuForge".to_string()];
        assert!(check_path(r"\\192.0.2.10\s\Videos\x\x.mp4", &none()).is_err());
        assert!(check_path("//attacker/share/x.mp4", &none()).is_err());
        assert!(check_path(r"\\192.0.2.10\s\x.mp4", &roots).is_err());
        assert!(check_path(r"\\NAS\Media\RuForge\Videos\a.mp4", &roots).is_ok());
        assert!(check_path("//nas/media/RuForge/Videos/a.mp4", &roots).is_ok());
        assert!(check_path(r"\\nas\media\RuForgeEvil\a.mp4", &roots).is_err());
        assert!(check_path(r"\\nas\media\RuForge\..\other\a.mp4", &roots).is_err());
    }

    #[test]
    fn device_roots_never_authorize_anything() {
        let roots = vec![r"\\?\UNC\nas\media".to_string()];
        assert!(check_path(r"\\?\UNC\nas\media\a.mp4", &roots).is_err());
    }

    #[test]
    fn relative_parent_and_nul_paths_are_rejected() {
        assert!(check_path("", &none()).is_err());
        assert!(check_path("Videos\\a.mp4", &none()).is_err());
        assert!(check_path("--exec=calc", &none()).is_err());
        assert!(check_path("a\0b", &none()).is_err());
        #[cfg(windows)]
        {
            assert!(check_path(r"C:relative\a.mp4", &none()).is_err());
            assert!(check_path(r"\rooted\a.mp4", &none()).is_err());
            assert!(check_path(r"C:\Media\..\Windows\a.mp4", &none()).is_err());
            assert!(check_path(r"C:\Media\Videos\a.mp4", &none()).is_ok());
            assert!(check_path("D:/Media/a.mp4", &none()).is_ok());
        }
    }

    #[test]
    fn containment_resolves_missing_leaves_and_rejects_siblings() {
        let base = std::env::temp_dir().join(format!("rf-path-guard-{}", std::process::id()));
        let root = base.join("Library");
        let sibling = base.join("LibraryEvil");
        std::fs::create_dir_all(root.join("Videos")).unwrap();
        std::fs::create_dir_all(&sibling).unwrap();
        let roots = vec![root.to_string_lossy().into_owned()];

        let inside = root.join("Videos").join("gone.mp4");
        assert!(check_path_within_roots(&inside.to_string_lossy(), &roots).is_ok());
        assert!(check_path_within_roots(&root.to_string_lossy(), &roots).is_ok());
        let outside = sibling.join("a.mp4");
        assert!(check_path_within_roots(&outside.to_string_lossy(), &roots).is_err());
        assert!(check_path_within_roots(&base.join("a.mp4").to_string_lossy(), &none()).is_err());

        let _ = std::fs::remove_dir_all(&base);
    }
}
