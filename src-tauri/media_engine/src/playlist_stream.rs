use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use crate::engine::MediaEngine;
use crate::error::{classify_ytdlp_stderr, EngineError, EngineErrorCode};
use crate::rate_limit::{register_rate_limit_from_stderr, subprocess_rate_gate_wait};
use crate::types::{AuthConfig, PlaylistItemPreview};
use crate::url::{is_youtube_playlist_url, validate_http_url};
use crate::ytdlp_args::build_flat_playlist_stream_args;
use crate::ytdlp_json::{playlist_preview_from_entry, ytdlp_entry_is_usable};

/// The first rows go out as soon as five exist so the list appears at once.
pub const FIRST_BATCH: usize = 5;
pub const NEXT_BATCH: usize = 10;
/// A half-filled batch is flushed when the next page is slow, so rows never sit buffered.
const IDLE_FLUSH: Duration = Duration::from_millis(250);

/// Playlist-level facts read off the first entry; only the first batch carries them.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistStreamMeta {
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub channel: Option<String>,
    pub count: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistStreamBatch {
    pub items: Vec<PlaylistItemPreview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<PlaylistStreamMeta>,
}

fn entry_is_short(entry: &Value) -> bool {
    ["url", "webpage_url"].iter().any(|k| {
        entry
            .get(*k)
            .and_then(|v| v.as_str())
            .is_some_and(|u| u.contains("/shorts/"))
    })
}

fn meta_from_entry(entry: &Value) -> PlaylistStreamMeta {
    let pick = |key: &str| {
        entry
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    PlaylistStreamMeta {
        title: pick("playlist_title").or_else(|| pick("playlist")),
        uploader: pick("playlist_uploader"),
        channel: pick("playlist_channel"),
        count: entry.get("playlist_count").and_then(|v| v.as_u64()),
    }
}

impl MediaEngine {
    /// Streams a flat playlist listing to `on_batch`: 5 rows first, then 10 at a time.
    /// Returns the number of rows sent. Setting `cancel` kills the listing and returns what was sent.
    pub async fn stream_flat_playlist<F>(
        &self,
        url: &str,
        auth: Option<&AuthConfig>,
        cancel: &AtomicBool,
        mut on_batch: F,
    ) -> Result<usize, EngineError>
    where
        F: FnMut(PlaylistStreamBatch) + Send,
    {
        let url = validate_http_url(url)?;
        if !is_youtube_playlist_url(&url) {
            return Err(EngineError::new(
                EngineErrorCode::UnsupportedUrl,
                "Not a playlist link",
            ));
        }
        let first = self
            .run_stream(&build_flat_playlist_stream_args(&url, None), cancel, &mut on_batch)
            .await;
        match first {
            Ok(n) => Ok(n),
            Err((err, sent)) => {
                let Some(auth_cfg) = auth.filter(|a| {
                    a.cookie_file.as_deref().is_some_and(|s| !s.is_empty())
                        || a.browser_label.as_deref().is_some_and(|s| !s.is_empty() && s != "chrome")
                }) else {
                    return Err(err);
                };
                if sent > 0 {
                    return Err(err);
                }
                self.run_stream(&build_flat_playlist_stream_args(&url, Some(auth_cfg)), cancel, &mut on_batch)
                    .await
                    .map_err(|(e, _)| e)
            }
        }
    }

    async fn run_stream<F>(
        &self,
        args: &[String],
        cancel: &AtomicBool,
        on_batch: &mut F,
    ) -> Result<usize, (EngineError, usize)>
    where
        F: FnMut(PlaylistStreamBatch) + Send,
    {
        let fail = |e: EngineError| (e, 0usize);
        let ytdlp = self.runtime.ytdlp_path().map_err(fail)?;
        subprocess_rate_gate_wait().await.map_err(fail)?;
        let mut proc = self.launcher.spawn(&ytdlp, args).await.map_err(fail)?;

        // An undrained stderr channel stalls the child after 64 lines.
        let mut stderr_rx = std::mem::replace(&mut proc.stderr_rx, tokio::sync::mpsc::channel(1).1);
        let stderr_task = tokio::spawn(async move {
            let mut tail = String::new();
            while let Some(line) = stderr_rx.recv().await {
                if tail.len() < 8_192 {
                    tail.push_str(&String::from_utf8_lossy(&line));
                    tail.push('\n');
                }
            }
            tail
        });

        let mut buf: Vec<PlaylistItemPreview> = Vec::new();
        let mut sent = 0usize;
        let mut meta: Option<PlaylistStreamMeta> = None;
        let mut meta_sent = false;

        let flush = |buf: &mut Vec<PlaylistItemPreview>,
                         meta: &mut Option<PlaylistStreamMeta>,
                         meta_sent: &mut bool,
                         sent: &mut usize,
                         on_batch: &mut F| {
            if buf.is_empty() {
                return;
            }
            let items = std::mem::take(buf);
            *sent += items.len();
            let batch_meta = if *meta_sent { None } else { meta.take() };
            *meta_sent = true;
            on_batch(PlaylistStreamBatch { items, meta: batch_meta });
        };

        let mut cancelled = false;
        loop {
            if cancel.load(Ordering::Relaxed) {
                cancelled = true;
                break;
            }
            match tokio::time::timeout(IDLE_FLUSH, proc.stdout_rx.recv()).await {
                Ok(Some(bytes)) => {
                    let line = String::from_utf8_lossy(&bytes);
                    let Ok(entry) = serde_json::from_str::<Value>(line.trim()) else {
                        continue;
                    };
                    if !ytdlp_entry_is_usable(&entry) || entry_is_short(&entry) {
                        continue;
                    }
                    if meta.is_none() && !meta_sent {
                        meta = Some(meta_from_entry(&entry));
                    }
                    buf.push(playlist_preview_from_entry(&entry, None));
                    let target = if sent == 0 { FIRST_BATCH } else { NEXT_BATCH };
                    if buf.len() >= target {
                        flush(&mut buf, &mut meta, &mut meta_sent, &mut sent, on_batch);
                    }
                }
                Ok(None) => break,
                Err(_) => flush(&mut buf, &mut meta, &mut meta_sent, &mut sent, on_batch),
            }
        }

        if cancelled {
            let _ = self.launcher.kill_tree(proc.pid).await;
            let _ = proc.wait.await;
            return Ok(sent);
        }
        flush(&mut buf, &mut meta, &mut meta_sent, &mut sent, on_batch);

        let exit = proc.wait.await.ok();
        let code = exit.as_ref().and_then(|e| e.code);
        let stderr = stderr_task.await.unwrap_or_default();
        if sent == 0 && code != Some(0) {
            register_rate_limit_from_stderr(&stderr).await;
            return Err((classify_ytdlp_stderr(&stderr, code), 0));
        }
        Ok(sent)
    }
}
