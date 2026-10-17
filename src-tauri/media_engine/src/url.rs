use crate::error::{EngineError, EngineErrorCode};

pub fn validate_http_url(raw: &str) -> Result<String, EngineError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(EngineError::new(
            EngineErrorCode::UnsupportedUrl,
            "URL is empty",
        ));
    }
    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err(EngineError::new(
            EngineErrorCode::UnsupportedUrl,
            "Only HTTP and HTTPS URLs are supported",
        ));
    }
    Ok(trimmed.to_string())
}

/// yt-dlp's own YouTube search, `ytsearchN:query`. Only the bare `ytsearch` prefix with a count
/// and a printable query passes, so this cannot name another extractor or a local file.
pub fn validate_ytdlp_search(raw: &str) -> Result<String, EngineError> {
    let invalid = || EngineError::new(EngineErrorCode::UnsupportedUrl, "Not a YouTube search");
    let trimmed = raw.trim();
    let rest = trimmed.strip_prefix("ytsearch").ok_or_else(invalid)?;
    let (count, query) = rest.split_once(':').ok_or_else(invalid)?;
    let count_ok = (1..=3).contains(&count.len())
        && count.bytes().all(|b| b.is_ascii_digit())
        && count.parse::<u32>().is_ok_and(|n| (1..=100).contains(&n));
    let query_ok = !query.trim().is_empty() && query.len() <= 500 && !query.chars().any(char::is_control);
    if !count_ok || !query_ok {
        return Err(invalid());
    }
    Ok(trimmed.to_string())
}

pub fn is_youtube_playlist_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let Some((before_query, query)) = lower.split_once('?') else {
        return false;
    };
    if !before_query.contains("youtube.com/") {
        return false;
    }
    query
        .split(['&', '#'])
        .any(|pair| pair.strip_prefix("list=").is_some_and(|v| !v.is_empty()))
}

pub fn validate_format_selector(raw: &str) -> Result<String, EngineError> {
    let s = raw.trim();
    if s.is_empty() {
        return Err(EngineError::new(
            EngineErrorCode::InvalidRequest,
            "Format selector is empty",
        ));
    }
    if s.len() > 512 {
        return Err(EngineError::new(
            EngineErrorCode::InvalidRequest,
            "Format selector is too long",
        ));
    }
    if s.chars().any(|c| c.is_control() || matches!(c, ';' | '&' | '|' | '`' | '$' | '\n' | '\r')) {
        return Err(EngineError::new(
            EngineErrorCode::InvalidRequest,
            "Format selector contains disallowed characters",
        ));
    }
    Ok(s.to_string())
}

pub fn validate_audio_format(raw: &str) -> Result<String, EngineError> {
    match raw.trim().to_lowercase().as_str() {
        "m4a" | "mp3" | "opus" => Ok(raw.trim().to_lowercase()),
        _ => Err(EngineError::new(
            EngineErrorCode::InvalidRequest,
            "Audio format must be m4a, mp3, or opus",
        )),
    }
}

pub fn validate_output_dir(path: &str) -> Result<String, EngineError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(EngineError::new(
            EngineErrorCode::InvalidRequest,
            "Output directory is empty",
        ));
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::{is_youtube_playlist_url, validate_ytdlp_search};

    #[test]
    fn youtube_search_accepts_only_counted_ytsearch() {
        assert!(validate_ytdlp_search("ytsearch8:Daft Punk One More Time").is_ok());
        assert!(validate_ytdlp_search("ytsearch100:-leading dash is fine after --").is_ok());
        for bad in [
            "ytsearch:no count",
            "ytsearch0:zero",
            "ytsearch101:too many",
            "ytsearchall:x",
            "ytsearch8:",
            "ytsearch8:   ",
            "ytsearch8:line\nbreak",
            "scsearch8:other extractor",
            "file:///C:/x",
            "--exec=calc",
        ] {
            assert!(validate_ytdlp_search(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn detects_youtube_playlist_links() {
        assert!(is_youtube_playlist_url("https://www.youtube.com/playlist?list=PLuvRKGApO-zp4nimhPQ4M8nytdjxqy8-R"));
        assert!(is_youtube_playlist_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123"));
        assert!(is_youtube_playlist_url("https://music.youtube.com/playlist?list=OLAK5uy_x"));
        assert!(!is_youtube_playlist_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
        assert!(!is_youtube_playlist_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list="));
        assert!(!is_youtube_playlist_url("https://youtu.be/dQw4w9WgXcQ?list=PL123"));
        assert!(!is_youtube_playlist_url("https://example.com/page?list=PL123"));
    }
}
