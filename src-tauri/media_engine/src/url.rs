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
    use super::is_youtube_playlist_url;

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
