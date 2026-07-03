const CATEGORY: &str = "companion.server";

pub fn instrumentation_enabled() -> bool {
    crate::debug_log::is_category_enabled(CATEGORY)
}

fn emit(level: &str, msg: impl AsRef<str>) {
    if !instrumentation_enabled() {
        return;
    }
    eprintln!("[companion][{level}] {}", msg.as_ref());
}

pub fn info(msg: impl AsRef<str>) {
    emit("info", msg);
}

pub fn warn(msg: impl AsRef<str>) {
    emit("warn", msg);
}

pub fn error(msg: impl AsRef<str>) {
    emit("error", msg);
}

pub fn redact_secret(value: &str) -> String {
    let len = value.len();
    if len <= 6 {
        return "***".to_string();
    }
    if len <= 12 {
        return format!("{}***", &value[..2]);
    }
    format!("{}...{}", &value[..4], &value[len - 4..])
}

pub fn shorten_user_agent(ua: &str) -> String {
    let trimmed = ua.trim();
    if trimmed.is_empty() {
        return "(none)".to_string();
    }
    let max = 80;
    if trimmed.len() <= max {
        return trimmed.to_string();
    }
    format!("{}…", &trimmed[..max])
}

pub fn status_class(code: u16) -> &'static str {
    match code {
        100..=199 => "1xx",
        200..=299 => "2xx",
        300..=399 => "3xx",
        400..=499 => "4xx",
        _ => "5xx",
    }
}
