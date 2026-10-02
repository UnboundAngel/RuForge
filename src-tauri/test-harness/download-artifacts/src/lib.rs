#[macro_export]
macro_rules! rf_log {
    ($cat:expr, $lvl:expr, $($arg:tt)*) => {{ let _ = ($cat, $lvl); let _ = format!($($arg)*); }};
}

pub mod commands {
    pub mod gallery {
        fn strip_ytdlp_temp_suffix(stem: &str) -> &str {
            const TEMP: &str = ".temp";
            if stem.ends_with(TEMP) && stem.len() > TEMP.len() {
                return &stem[..stem.len() - TEMP.len()];
            }
            stem
        }
        pub(crate) fn strip_ytdlp_stream_suffix(stem: &str) -> &str {
            let stem = strip_ytdlp_temp_suffix(stem);
            let Some(dot_f) = stem.rfind(".f") else { return stem; };
            let tail = &stem[dot_f + 2..];
            if tail.is_empty() { return stem; }
            if tail.chars().all(|c| c.is_ascii_digit() || c == '-' || c == '.') {
                return &stem[..dot_f];
            }
            stem
        }
    }
}

#[path = "../../../src/download_artifacts.rs"]
pub mod download_artifacts;
