use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineErrorCode {
    UnsupportedUrl,
    InspectionExpired,
    FormatUnavailable,
    AuthenticationRequired,
    RuntimeMissing,
    RuntimeIncompatible,
    RuntimeExecutionFailed,
    NetworkFailure,
    DiskFull,
    PermissionDenied,
    Cancelled,
    PostProcessingFailure,
    OutputCollision,
    ProcessLaunchFailure,
    RateLimited,
    InvalidRequest,
    JobNotFound,
    QueueFull,
    Interrupted,
}

#[derive(Debug, Error, Clone)]
pub struct EngineError {
    pub code: EngineErrorCode,
    pub message: String,
    pub detail: Option<String>,
}

impl EngineError {
    pub fn new(code: EngineErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(d) = &self.detail {
            write!(f, "{} ({})", self.message, d)
        } else {
            write!(f, "{}", self.message)
        }
    }
}

impl From<EngineError> for String {
    fn from(e: EngineError) -> Self {
        e.message
    }
}

pub fn classify_ytdlp_stderr(stderr: &str, exit_code: Option<i32>) -> EngineError {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("no supported javascript runtime") || lower.contains("install node, deno") {
        return EngineError::new(
            EngineErrorCode::RuntimeMissing,
            "No JavaScript runtime available for YouTube n-challenge",
        )
        .with_detail("install Deno or Node");
    }
    if lower.contains("rate-limited") || lower.contains("rate limited") {
        return EngineError::new(
            EngineErrorCode::RateLimited,
            "Extractor rate-limited this session",
        );
    }
    if lower.contains("sign in") || lower.contains("login") && lower.contains("required") {
        return EngineError::new(
            EngineErrorCode::AuthenticationRequired,
            "Authentication required for this URL",
        );
    }
    if lower.contains("no space left") || lower.contains("disk full") {
        return EngineError::new(EngineErrorCode::DiskFull, "Insufficient disk space");
    }
    if lower.contains("permission denied") {
        return EngineError::new(EngineErrorCode::PermissionDenied, "Permission denied");
    }
    if lower.contains("http error 403") || lower.contains("403: forbidden") {
        return EngineError::new(
            EngineErrorCode::NetworkFailure,
            "HTTP 403: signed stream URL may have expired",
        );
    }
    if stderr.trim().is_empty() {
        return EngineError::new(
            EngineErrorCode::RuntimeExecutionFailed,
            format!("yt-dlp failed (exit code {:?})", exit_code),
        );
    }
    EngineError::new(
        EngineErrorCode::RuntimeExecutionFailed,
        stderr.trim().to_string(),
    )
}
