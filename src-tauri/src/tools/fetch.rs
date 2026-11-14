use std::path::Path;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

use super::{hash, ERR_OFFLINE};

pub const PROGRESS_EVENT: &str = "tools-install-progress";
const EMIT_INTERVAL: Duration = Duration::from_millis(100);
const STALL_TIMEOUT: Duration = Duration::from_secs(30);

/// No file paths here: the Explorer webview hears default-target emits.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsInstallProgress {
    pub phase: &'static str,
    pub tool: Option<&'static str>,
    pub received: u64,
    pub total: u64,
    pub fraction: f64,
    pub error: Option<String>,
}

/// Emits overall progress across all tools, weighted by bytes, at about 10 per second.
pub struct Reporter {
    app: AppHandle,
    total: u64,
    base: u64,
    last: Option<Instant>,
}

impl Reporter {
    pub fn new(app: &AppHandle, total: u64) -> Self {
        Self { app: app.clone(), total: total.max(1), base: 0, last: None }
    }

    pub fn emit(
        &mut self,
        phase: &'static str,
        tool: Option<&'static str>,
        received: u64,
        tool_total: u64,
        force: bool,
    ) {
        if !force && self.last.is_some_and(|t| t.elapsed() < EMIT_INTERVAL) {
            return;
        }
        self.last = Some(Instant::now());
        let fraction = ((self.base + received) as f64 / self.total as f64).clamp(0.0, 1.0);
        let _ = self.app.emit(
            PROGRESS_EVENT,
            ToolsInstallProgress { phase, tool, received, total: tool_total, fraction, error: None },
        );
    }

    /// Counts a finished step's bytes toward the overall fraction.
    pub fn step_done(&mut self, bytes: u64) {
        self.base += bytes;
    }
}

pub fn emit_done(app: &AppHandle) {
    let _ = app.emit(
        PROGRESS_EVENT,
        ToolsInstallProgress { phase: "done", tool: None, received: 0, total: 0, fraction: 1.0, error: None },
    );
}

pub fn emit_error(app: &AppHandle, message: String) {
    let _ = app.emit(
        PROGRESS_EVENT,
        ToolsInstallProgress { phase: "error", tool: None, received: 0, total: 0, fraction: 0.0, error: Some(message) },
    );
}

pub fn client(app: &AppHandle) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!(
            "{}/{} (RuForge tools install)",
            app.package_info().name,
            app.package_info().version,
        ))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

fn offline<E: std::fmt::Display>(e: E) -> String {
    crate::rf_log!("tools.install", log::Level::Warn, "tools download failed: {}", e);
    ERR_OFFLINE.to_string()
}

async fn get(client: &reqwest::Client, url: &str) -> Result<reqwest::Response, String> {
    let resp = client.get(url).send().await.map_err(offline)?;
    if !resp.status().is_success() {
        return Err(format!("The download server answered HTTP {}.", resp.status()));
    }
    Ok(resp)
}

pub async fn get_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    get(client, url).await?.text().await.map_err(offline)
}

pub async fn get_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    url: &str,
) -> Result<T, String> {
    get(client, url).await?.json().await.map_err(offline)
}

/// Streams `url` into `part`, hashing as it goes. Returns the SHA-256 hex and byte count.
/// The caller removes `part` on error.
pub async fn download(
    client: &reqwest::Client,
    url: &str,
    part: &Path,
    reporter: &mut Reporter,
    tool: &'static str,
    expected_total: u64,
) -> Result<(String, u64), String> {
    let resp = get(client, url).await?;
    let total = resp.content_length().filter(|n| *n > 0).unwrap_or(expected_total);
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(part).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    reporter.emit("downloading", Some(tool), 0, total, true);
    loop {
        let next = tokio::time::timeout(STALL_TIMEOUT, stream.next())
            .await
            .map_err(|_| offline("stalled"))?;
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(offline)?;
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        reporter.emit("downloading", Some(tool), received, total, false);
    }
    file.flush().await.map_err(|e| e.to_string())?;
    reporter.emit("downloading", Some(tool), received, total, true);
    Ok((hash::finish_hex(hasher), received))
}
