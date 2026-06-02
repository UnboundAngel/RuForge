//! Global spacing between yt-dlp subprocess spawns to reduce YouTube session rate limits.

use std::sync::OnceLock;
use std::time::{Duration, Instant};

use tokio::sync::Mutex;

/// Minimum gap between any two yt-dlp `.output()` invocations (browse, metadata, etc.).
const MIN_SUBPROCESS_INTERVAL_MS: u64 = 2_500;

/// After a rate-limit error, block new subprocesses for this long.
const RATE_LIMIT_COOLDOWN_MS: u64 = 5 * 60 * 1_000;

struct YtdlpRateState {
    last_subprocess_at: Instant,
    blocked_until: Option<Instant>,
}

impl Default for YtdlpRateState {
    fn default() -> Self {
        Self {
            last_subprocess_at: Instant::now() - Duration::from_secs(120),
            blocked_until: None,
        }
    }
}

fn rate_state() -> &'static Mutex<YtdlpRateState> {
    static STATE: OnceLock<Mutex<YtdlpRateState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(YtdlpRateState::default()))
}

pub fn ytdlp_stderr_is_rate_limited(stderr: &str) -> bool {
    let lower = stderr.to_ascii_lowercase();
    lower.contains("rate-limited")
        || lower.contains("rate limited")
        || lower.contains("try again later")
            && lower.contains("isn't available")
}

/// Call when yt-dlp stderr indicates a session rate limit.
pub async fn ytdlp_register_rate_limit_from_stderr(stderr: &str) {
    if !ytdlp_stderr_is_rate_limited(stderr) {
        return;
    }
    let mut state = rate_state().lock().await;
    let until = Instant::now() + Duration::from_millis(RATE_LIMIT_COOLDOWN_MS);
    state.blocked_until = Some(
        state
            .blocked_until
            .map(|prev| prev.max(until))
            .unwrap_or(until),
    );
    crate::rf_log!(
        "download.rate",
        log::Level::Warn,
        "yt-dlp: YouTube rate limit detected; pausing new yt-dlp requests for {}s",
        RATE_LIMIT_COOLDOWN_MS / 1000
    );
}

/// Wait until allowed to spawn another yt-dlp subprocess. Returns Err if still in cooldown.
pub async fn ytdlp_subprocess_rate_gate_wait() -> Result<(), String> {
    let mut state = rate_state().lock().await;
    if let Some(until) = state.blocked_until {
        if Instant::now() < until {
            let secs = until.saturating_duration_since(Instant::now()).as_secs().max(1);
            return Err(format!(
                "YouTube rate-limited this session. Wait about {}s before trying again, or use a different cookie source in Settings.",
                secs
            ));
        }
        state.blocked_until = None;
    }

    let min_gap = Duration::from_millis(MIN_SUBPROCESS_INTERVAL_MS);
    let elapsed = state.last_subprocess_at.elapsed();
    if elapsed < min_gap {
        drop(state);
        tokio::time::sleep(min_gap - elapsed).await;
        state = rate_state().lock().await;
    }
    state.last_subprocess_at = Instant::now();
    Ok(())
}

/// Spacing between playlist/metadata requests (yt-dlp `--sleep-interval`).
pub fn ytdlp_push_politeness_args(args: &mut Vec<String>) {
    if args.iter().any(|a| a == "--sleep-interval") {
        return;
    }
    args.push("--sleep-interval".into());
    args.push("1".into());
    args.push("--max-sleep-interval".into());
    args.push("3".into());
}
