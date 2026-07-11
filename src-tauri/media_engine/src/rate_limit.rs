use std::sync::OnceLock;
use std::time::{Duration, Instant};

use tokio::sync::Mutex;

use crate::error::{EngineError, EngineErrorCode};

const MIN_SUBPROCESS_INTERVAL_MS: u64 = 2_500;
const RATE_LIMIT_COOLDOWN_MS: u64 = 5 * 60 * 1_000;

struct RateState {
    last_subprocess_at: Instant,
    blocked_until: Option<Instant>,
}

impl Default for RateState {
    fn default() -> Self {
        Self {
            last_subprocess_at: Instant::now() - Duration::from_secs(120),
            blocked_until: None,
        }
    }
}

fn rate_state() -> &'static Mutex<RateState> {
    static STATE: OnceLock<Mutex<RateState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(RateState::default()))
}

pub fn stderr_is_rate_limited(stderr: &str) -> bool {
    let lower = stderr.to_ascii_lowercase();
    lower.contains("rate-limited")
        || lower.contains("rate limited")
        || (lower.contains("try again later") && lower.contains("isn't available"))
}

pub async fn register_rate_limit_from_stderr(stderr: &str) {
    if !stderr_is_rate_limited(stderr) {
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
}

pub async fn subprocess_rate_gate_wait() -> Result<(), EngineError> {
    let mut state = rate_state().lock().await;
    if let Some(until) = state.blocked_until {
        if Instant::now() < until {
            let secs = until.saturating_duration_since(Instant::now()).as_secs().max(1);
            return Err(EngineError::new(
                EngineErrorCode::RateLimited,
                format!("Extractor rate-limited; wait about {secs}s before retrying"),
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

pub fn stderr_is_missing_js_runtime(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("no supported javascript runtime")
        || lower.contains("javascript interpreter")
        || lower.contains("install node, deno")
}

pub const JS_RUNTIME_MISSING_PREFIX: &str = "JS_RUNTIME_MISSING: ";
