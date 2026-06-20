use std::path::Path;
use std::sync::{Arc, OnceLock, RwLock};

use regex::{Captures, Regex};

static PATH_ROOT_STATE: OnceLock<Arc<RwLock<PathRootState>>> = OnceLock::new();

struct PathRootState {
    root_patterns: Vec<Regex>,
}

impl Default for PathRootState {
    fn default() -> Self {
        Self {
            root_patterns: Vec::new(),
        }
    }
}

fn path_root_state() -> Arc<RwLock<PathRootState>> {
    PATH_ROOT_STATE
        .get_or_init(|| Arc::new(RwLock::new(PathRootState::default())))
        .clone()
}

fn normalize_root(raw: &str) -> String {
    raw.trim().replace('/', "\\").trim_end_matches('\\').to_string()
}

fn compile_root_pattern(root: &str) -> Option<Regex> {
    if root.is_empty() {
        return None;
    }
    Regex::new(&format!("(?i){}", regex::escape(root))).ok()
}

static RE_HTTP_URL: OnceLock<Regex> = OnceLock::new();
static RE_WWW_URL: OnceLock<Regex> = OnceLock::new();
static RE_WIN_PATH: OnceLock<Regex> = OnceLock::new();
static RE_UNC_PATH: OnceLock<Regex> = OnceLock::new();
static RE_UNIX_PATH: OnceLock<Regex> = OnceLock::new();
static RE_COOKIE_CLI: OnceLock<Regex> = OnceLock::new();
static RE_COOKIE_FILE: OnceLock<Regex> = OnceLock::new();
static RE_WATCH_VIDEO_ID: OnceLock<Regex> = OnceLock::new();
static RE_YTDLP_LINE: OnceLock<Regex> = OnceLock::new();

fn re_http_url() -> &'static Regex {
    RE_HTTP_URL.get_or_init(|| {
        Regex::new(r#"(?i)https?://[^\s"']+"#).expect("http url regex")
    })
}

fn re_www_url() -> &'static Regex {
    RE_WWW_URL.get_or_init(|| Regex::new(r#"www\.[^\s"']+"#).expect("www url regex"))
}

fn re_win_path() -> &'static Regex {
    RE_WIN_PATH.get_or_init(|| {
        Regex::new(r#"[A-Za-z]:[\\/][^\s"']*"#).expect("win path regex")
    })
}

fn re_unc_path() -> &'static Regex {
    RE_UNC_PATH.get_or_init(|| Regex::new(r#"\\\\[^\s"']+"#).expect("unc path regex"))
}

static RE_SENSITIVE_KEYWORD: OnceLock<Regex> = OnceLock::new();

fn re_sensitive_keyword() -> &'static Regex {
    RE_SENSITIVE_KEYWORD.get_or_init(|| {
        Regex::new(r"(?i)youtube|youtu\.be|watch\?v=|music\.youtube")
            .expect("sensitive keyword regex")
    })
}

fn re_unix_path() -> &'static Regex {
    RE_UNIX_PATH.get_or_init(|| {
        Regex::new(r#"(?:/home|/Users|/media|/mnt|/tmp)/[^\s"']*"#).expect("unix path regex")
    })
}

fn re_cookie_cli() -> &'static Regex {
    RE_COOKIE_CLI
        .get_or_init(|| Regex::new(r#"--cookies(?:-from-browser)?\s+\S+"#).expect("cookie cli regex"))
}

fn re_cookie_file() -> &'static Regex {
    RE_COOKIE_FILE
        .get_or_init(|| Regex::new(r#"\S*(?:cookies\.txt|\.cookies)\S*"#).expect("cookie file regex"))
}

fn re_watch_video_id() -> &'static Regex {
    RE_WATCH_VIDEO_ID.get_or_init(|| {
        Regex::new(r"watch\?v=[A-Za-z0-9_-]{11}").expect("watch video id regex")
    })
}

fn re_ytdlp_line() -> &'static Regex {
    RE_YTDLP_LINE.get_or_init(|| {
        Regex::new(r"(?m)^.*(?:Downloading|Extracting|Deleting original file).*$")
            .expect("ytdlp line regex")
    })
}

static RE_CONTEXT_VIDEO_ID: OnceLock<Regex> = OnceLock::new();
static RE_SENSITIVE_URL: OnceLock<Regex> = OnceLock::new();
static RE_SENSITIVE_WIN: OnceLock<Regex> = OnceLock::new();
static RE_SENSITIVE_UNC: OnceLock<Regex> = OnceLock::new();
static RE_SENSITIVE_UNIX: OnceLock<Regex> = OnceLock::new();

fn re_context_video_id() -> &'static Regex {
    RE_CONTEXT_VIDEO_ID.get_or_init(|| {
        Regex::new(r"(?i)(?:youtube|youtu\.be|watch\?v=).{0,30}?([A-Za-z0-9_-]{11})")
            .expect("context video id regex")
    })
}

fn re_sensitive_url() -> &'static Regex {
    RE_SENSITIVE_URL.get_or_init(|| {
        Regex::new(r#"(?i)https?://[^\s"']+|www\.[^\s"']+"#).expect("sensitive url regex")
    })
}

fn re_sensitive_win() -> &'static Regex {
    RE_SENSITIVE_WIN.get_or_init(|| {
        Regex::new(r#"[A-Za-z]:[\\/][^\s"']*"#).expect("sensitive win regex")
    })
}

fn re_sensitive_unc() -> &'static Regex {
    RE_SENSITIVE_UNC
        .get_or_init(|| Regex::new(r#"\\\\[^\s"']+"#).expect("sensitive unc regex"))
}

fn re_sensitive_unix() -> &'static Regex {
    RE_SENSITIVE_UNIX.get_or_init(|| {
        Regex::new(r#"(?:/home|/Users|/media|/mnt|/tmp)/[^\s"']*"#).expect("sensitive unix regex")
    })
}

pub fn set_path_roots(roots: Vec<String>) {
    let mut normalized: Vec<String> = roots
        .into_iter()
        .map(|r| normalize_root(&r))
        .filter(|r| !r.is_empty())
        .collect();
    normalized.sort_by_key(|r| r.len());
    normalized.reverse();
    normalized.dedup();

    let root_patterns = normalized
        .iter()
        .filter_map(|root| compile_root_pattern(root))
        .collect();

    if let Ok(mut guard) = path_root_state().write() {
        guard.root_patterns = root_patterns;
    }
}

fn apply_dynamic_roots(text: &str) -> String {
    let state = path_root_state();
    let Ok(guard) = state.read() else {
        return text.to_string();
    };
    let mut out = text.to_string();
    for pattern in &guard.root_patterns {
        out = pattern.replace_all(&out, "[library-path]").into_owned();
    }
    out
}

fn scrub_context_video_ids(text: &str) -> String {
    re_context_video_id()
        .replace_all(text, |caps: &Captures| {
            let prefix = caps.get(0).map(|m| m.as_str()).unwrap_or("");
            prefix.replace(caps.get(1).map(|m| m.as_str()).unwrap_or(""), "[video-id]")
        })
        .into_owned()
}

pub fn scrub_text(text: &str) -> String {
    let mut out = apply_dynamic_roots(text);
    out = re_ytdlp_line().replace_all(&out, "[yt-dlp-output]").into_owned();
    out = re_http_url().replace_all(&out, "[url]").into_owned();
    out = re_www_url().replace_all(&out, "[url]").into_owned();
    out = re_unc_path().replace_all(&out, "[path]").into_owned();
    out = re_win_path().replace_all(&out, "[path]").into_owned();
    out = re_unix_path().replace_all(&out, "[path]").into_owned();
    out = re_cookie_cli()
        .replace_all(&out, "--cookies [redacted]")
        .into_owned();
    out = re_cookie_file().replace_all(&out, "[cookie-file]").into_owned();
    out = re_watch_video_id()
        .replace_all(&out, "watch?v=[video-id]")
        .into_owned();
    scrub_context_video_ids(&out)
}

pub fn remains_sensitive(text: &str) -> bool {
    re_sensitive_url().is_match(text)
        || re_sensitive_win().is_match(text)
        || re_sensitive_unc().is_match(text)
        || re_sensitive_unix().is_match(text)
        || re_sensitive_keyword().is_match(text)
}

pub fn scrub_text_or_drop(text: &str) -> Option<String> {
    let scrubbed = scrub_text(text);
    if remains_sensitive(&scrubbed) {
        None
    } else {
        Some(scrubbed)
    }
}

fn is_path_like(filename: &str) -> bool {
    filename.contains('\\') || filename.contains('/') || filename.contains(':')
}

fn is_safe_basename(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

pub fn sanitize_frame_filename(filename: &str, in_app: bool) -> String {
    if !in_app {
        return "[redacted]".to_string();
    }
    if is_path_like(filename) {
        let base = Path::new(filename)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if is_safe_basename(base) {
            return base.to_string();
        }
        return "[redacted]".to_string();
    }
    if is_safe_basename(filename) {
        filename.to_string()
    } else {
        "[redacted]".to_string()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScrubException {
    pub ty: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScrubFrame {
    pub filename: String,
    pub function: String,
    pub lineno: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScrubEvent {
    pub message: Option<String>,
    pub exception: Option<ScrubException>,
    pub frames: Vec<ScrubFrame>,
}

pub fn scrub_breadcrumb_message(message: &str) -> Option<String> {
    scrub_text_or_drop(message)
}

pub fn scrub_exception(ty: &str, value: &str) -> Option<ScrubException> {
    let scrubbed_ty = scrub_text(ty);
    let scrubbed_value = scrub_text_or_drop(value)?;
    if remains_sensitive(&scrubbed_ty) {
        return None;
    }
    Some(ScrubException {
        ty: scrubbed_ty,
        value: scrubbed_value,
    })
}

pub fn scrub_event(
    message: Option<&str>,
    exception: Option<(&str, &str)>,
    frames: &[(String, String, u32, bool)],
) -> Option<ScrubEvent> {
    let scrubbed_message = match message {
        Some(msg) => scrub_text_or_drop(msg)?,
        None => String::new(),
    };

    let scrubbed_exception = match exception {
        Some((ty, value)) => Some(scrub_exception(ty, value)?),
        None => None,
    };

    let mut scrubbed_frames = Vec::with_capacity(frames.len());
    for (filename, function, lineno, in_app) in frames {
        let sanitized_name = sanitize_frame_filename(filename, *in_app);
        let sanitized_fn = scrub_text(function);
        if remains_sensitive(&sanitized_fn) {
            return None;
        }
        scrubbed_frames.push(ScrubFrame {
            filename: sanitized_name,
            function: sanitized_fn,
            lineno: *lineno,
        });
    }

    if scrubbed_message.is_empty() && scrubbed_exception.is_none() && scrubbed_frames.is_empty() {
        return None;
    }

    Some(ScrubEvent {
        message: if scrubbed_message.is_empty() {
            None
        } else {
            Some(scrubbed_message)
        },
        exception: scrubbed_exception,
        frames: scrubbed_frames,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_in_exception_message_is_scrubbed() {
        set_path_roots(vec![]);
        let exc = scrub_exception(
            "DownloadError",
            "failed for https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        );
        assert!(exc.is_some());
        let exc = exc.unwrap();
        assert!(!exc.value.contains("youtube.com"));
        assert!(exc.value.contains("[url]"));
    }

    #[test]
    fn windows_path_in_breadcrumb_is_scrubbed() {
        set_path_roots(vec![]);
        let msg = scrub_breadcrumb_message(r"delete failed C:\Users\Angel\Videos\song.mp4");
        assert!(msg.is_some());
        let msg = msg.unwrap();
        assert!(!msg.contains(r"C:\Users"));
        assert!(msg.contains("[path]"));
    }

    #[test]
    fn ytdlp_stderr_blob_scrubs_output_lines() {
        set_path_roots(vec![]);
        let stderr = "ERROR: Downloading webpage\nERROR: Extracting URL\nfile saved\n";
        let scrubbed = scrub_text(stderr);
        assert!(!scrubbed.contains("Downloading webpage"));
        assert!(scrubbed.contains("[yt-dlp-output]"));
    }

    #[test]
    fn clean_event_passes_through() {
        set_path_roots(vec![]);
        let event = scrub_event(
            Some("startup complete"),
            Some(("RuntimeError", "channel closed")),
            &[(
                "lib.rs".to_string(),
                "ruforge_lib::run".to_string(),
                42,
                true,
            )],
        );
        assert!(event.is_some());
        let event = event.unwrap();
        assert_eq!(event.message.as_deref(), Some("startup complete"));
        assert_eq!(event.exception.as_ref().unwrap().value, "channel closed");
        assert_eq!(event.frames[0].filename, "lib.rs");
    }

    #[test]
    fn dirty_event_drops_when_path_survives() {
        set_path_roots(vec![]);
        let dirty = scrub_event(
            Some("youtube cache flush failed"),
            None,
            &[],
        );
        assert!(dirty.is_none());
    }

    #[test]
    fn scrubbed_win_path_passes_drop_gate() {
        set_path_roots(vec![]);
        let event = scrub_event(
            Some(r"failed at C:\secret\keep.mp4"),
            None,
            &[],
        );
        assert!(event.is_some());
        let msg = event.unwrap().message.unwrap();
        assert!(msg.contains("[path]"));
        assert!(!msg.contains("secret"));
    }

    #[test]
    fn cookie_cli_args_are_scrubbed() {
        set_path_roots(vec![]);
        let scrubbed = scrub_text("yt-dlp --cookies-from-browser C:\\tmp\\cookies.txt run");
        assert!(scrubbed.contains("--cookies [redacted]"));
        assert!(!scrubbed.contains("cookies.txt"));
    }

    #[test]
    fn unc_path_is_scrubbed() {
        set_path_roots(vec![]);
        let msg = scrub_breadcrumb_message(r"share \\nas\media\video.mp4 missing");
        assert!(msg.is_some());
        assert!(msg.unwrap().contains("[path]"));
    }

    #[test]
    fn dynamic_path_roots_replace_library_paths() {
        set_path_roots(vec![r"C:\RuForge\Media".to_string()]);
        let scrubbed = scrub_text(r"scan failed under C:\RuForge\Media\Artist\track.mp4");
        assert!(!scrubbed.contains("RuForge"));
        assert!(scrubbed.contains("[library-path]"));
        assert!(!remains_sensitive(&scrubbed));
    }

    #[test]
    fn external_frame_filename_is_redacted() {
        assert_eq!(
            sanitize_frame_filename(r"C:\src\other\lib.rs", false),
            "[redacted]"
        );
    }

    #[test]
    fn in_app_frame_uses_basename_only() {
        assert_eq!(
            sanitize_frame_filename(r"C:\Projects\RuForge\src-tauri\src\lib.rs", true),
            "lib.rs"
        );
    }
}
