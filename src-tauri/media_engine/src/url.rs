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
