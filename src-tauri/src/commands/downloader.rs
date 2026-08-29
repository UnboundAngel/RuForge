use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::download_job_manager::{kill_ytdlp_tree, DownloadJobManager};
use crate::media_engine_adapter::{auth_from_download_options, MediaEngineState};
use media_engine::{
    progress::ProgressTracker,
    ytdlp_args::{build_download_args, effective_filename_template, DownloadPaths},
    InspectRequest, MediaInspection, PlaylistItemPreview as EnginePlaylistItemPreview,
    validated_choices_from_options,
};
use crate::ytdlp_binary::{ytdlp_push_js_runtime_args, ytdlp_shell_command};
use crate::ytdlp_rate_limit::{
    ytdlp_push_politeness_args, ytdlp_register_rate_limit_from_stderr,
    ytdlp_subprocess_rate_gate_wait, ytdlp_stderr_is_rate_limited,
};

use crate::commands::explorer_cookies::{export_ruforge_cookies_for_ytdlp, RuforgeCookieExport};
use crate::commands::gallery::cleanup_orphan_downloads_under;
use crate::commands::media::extract_frames;
use crate::commands::musicmeta::find_recent_audio_files;
use crate::utils::is_media_ext;

/// yt-dlp `youtube:max_comments` parent-thread cap (`max-parents`).
const COMMENTS_MAX_PARENTS: u32 = 25;
/// yt-dlp `youtube:max_comments` per-thread reply cap (`max-replies-per-thread`).
const COMMENTS_MAX_REPLIES_PER_THREAD: u32 = 5;
/// yt-dlp `youtube:max_comments` reply depth cap (`max-depth`: top-level + direct replies).
const COMMENTS_MAX_DEPTH: u32 = 2;
/// yt-dlp `youtube:comment_sort` (YouTube-side sort).
const COMMENTS_SORT: &str = "top";

fn ytdlp_comments_extractor_args() -> String {
    format!(
        "youtube:max_comments=all,{COMMENTS_MAX_PARENTS},all,{COMMENTS_MAX_REPLIES_PER_THREAD},{COMMENTS_MAX_DEPTH};comment_sort={COMMENTS_SORT}"
    )
}

/// Where yt-dlp wrote files for this job: playlist subfolder if template has a fixed prefix, else output root.
fn post_download_diag_listing_root(output_dir: &Path, filename_template_eff: &str) -> std::path::PathBuf {
    if let Some((first, _)) = filename_template_eff.split_once('/') {
        if !first.is_empty() && !first.contains('%') {
            return output_dir.join(first);
        }
    }
    output_dir.to_path_buf()
}

/// Log paths (relative to `root`) for files under `root` modified on/after `since` (with slack for clock skew).
fn log_post_download_files_written(root: &Path, since: SystemTime) {
    const SLACK_SECS: u64 = 15;
    let cutoff = since
        .checked_sub(std::time::Duration::from_secs(SLACK_SECS))
        .unwrap_or(since);

    let mut rel_paths: Vec<String> = Vec::new();

    fn walk(
        dir: &Path,
        root: &Path,
        depth: u32,
        max_depth: u32,
        cutoff: SystemTime,
        out: &mut Vec<String>,
    ) {
        if depth > max_depth {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for ent in rd.flatten() {
            let p = ent.path();
            let rel = p
                .strip_prefix(root)
                .map(|x| x.display().to_string())
                .unwrap_or_else(|_| p.display().to_string());
            if p.is_dir() {
                walk(&p, root, depth + 1, max_depth, cutoff, out);
            } else if p.is_file() {
                let recent = std::fs::metadata(&p)
                    .and_then(|m| m.modified())
                    .map(|t| t >= cutoff)
                    .unwrap_or(true);
                if recent {
                    out.push(rel);
                }
            }
        }
    }

    if !root.is_dir() {
        crate::rf_log!(
            "download.post",
            log::Level::Info,
            "post-download file list skipped (not a directory): {}",
            root.display()
        );
        return;
    }

    walk(root, root, 0, 8, cutoff, &mut rel_paths);
    rel_paths.sort();
    crate::rf_log!(
        "download.post",
        log::Level::Info,
        "post-download files under {} (count={}, mtime cutoff ~{}s before job start): {:?}",
        root.display(),
        rel_paths.len(),
        SLACK_SECS,
        rel_paths
    );
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItemPreview {
    pub title: String,
    pub thumbnail: String,
    pub duration: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webpage_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes_audio: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes_video: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub title: String,
    pub thumbnail: String,
    pub duration: f64,
    pub formats: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes: Option<u64>,
    /// Best-effort audio-only estimate from one `-J` formats pass (`bestaudio/best`-class).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes_audio: Option<u64>,
    /// Best-effort muxed video estimate (`bestvideo+bestaudio`-class for the height cap).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes_video: Option<u64>,
    #[serde(default)]
    pub is_playlist: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist_items: Option<Vec<PlaylistItemPreview>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uploader: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
}

/// Reject page URLs yt-dlp sometimes puts in thumbnail fields (causes broken img tags in the UI).
fn is_probable_image_url(url: &str) -> bool {
    let u = url.trim().to_lowercase();
    if u.is_empty() {
        return false;
    }
    if u.contains("youtube.com/playlist")
        || u.contains("music.youtube.com/playlist")
        || u.contains("youtube.com/watch")
        || u.contains("music.youtube.com/watch")
        || u.contains("youtube.com/channel")
        || u.contains("music.youtube.com/channel")
        || u.contains("music.youtube.com/browse")
        || u.contains("youtu.be/")
    {
        return false;
    }
    if u.contains("ytimg.com")
        || u.contains("ggpht.com")
        || u.contains("googleusercontent.com")
        || u.contains("gstatic.com")
    {
        return true;
    }
    u.ends_with(".jpg")
        || u.ends_with(".jpeg")
        || u.ends_with(".png")
        || u.ends_with(".webp")
        || u.ends_with(".gif")
}

fn normalize_thumbnail_url(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    let normalized = if s.starts_with("//") {
        format!("https:{s}")
    } else {
        s.to_string()
    };
    if is_probable_image_url(&normalized) {
        Some(normalized)
    } else {
        None
    }
}

fn thumbnail_area(t: &serde_json::Value) -> u64 {
    let w = t.get("width").and_then(|v| v.as_u64()).unwrap_or(0);
    let h = t.get("height").and_then(|v| v.as_u64()).unwrap_or(0);
    w.saturating_mul(h)
}

fn thumbnail_from_thumbnails_array(arr: &[serde_json::Value]) -> Option<String> {
    // OLAK/s_p root art may list maxresdefault without CDN query params; that URL 200s with a
    // gray placeholder. Prefer signed (?...) entries by declared width*height.
    let mut best_signed: Option<(u64, String)> = None;
    let mut best_any: Option<(u64, String)> = None;
    for t in arr {
        let Some(raw) = t.get("url").and_then(|u| u.as_str()) else {
            continue;
        };
        let Some(norm) = normalize_thumbnail_url(raw) else {
            continue;
        };
        let area = thumbnail_area(t);
        if raw.contains('?') {
            if best_signed.as_ref().is_none_or(|(best, _)| area >= *best) {
                best_signed = Some((area, norm.clone()));
            }
        }
        if best_any.as_ref().is_none_or(|(best, _)| area >= *best) {
            best_any = Some((area, norm));
        }
    }
    best_signed.or(best_any).map(|(_, u)| u)
}

fn cookie_browser_label(browser: &str) -> &'static str {
    match browser {
        "ruforge" => "RuForge Internal browser (Explorer)",
        "firefox" => "Firefox",
        "edge" => "Microsoft Edge",
        "chrome" => "Google Chrome",
        "brave" => "Brave",
        "safari" => "Safari",
        _ => "browser",
    }
}

fn ytdlp_stderr_is_cookie_export_failure(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("cookie database")
        || lower.contains("export cookies")
        || lower.contains("failed to decrypt with dpapi")
        || lower.contains("could not copy chrome")
        || lower.contains("could not read cookies")
        || lower.contains("error reading cookies")
        || (lower.contains("permission denied") && lower.contains("cookie"))
}

/// Returns true when yt-dlp stderr indicates no JS runtime is available for YouTube's n-challenge.
pub(crate) fn ytdlp_stderr_is_missing_js_runtime(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("no supported javascript runtime")
        || lower.contains("javascript interpreter")
        || lower.contains("install node, deno")
}

/// Marker prefix on errors caused by a missing JS runtime so the frontend can distinguish them.
pub(crate) const JS_RUNTIME_MISSING_PREFIX: &str = "JS_RUNTIME_MISSING: ";

fn ytdlp_browser_cookie_arg(app: &AppHandle, browser: &str) -> Result<String, String> {
    if browser == "ruforge" {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("explorer-data");
        let profile_dir = data_dir.join("EBWebView").join("Default");
        Ok(format!("chrome:{}", profile_dir.to_string_lossy()))
    } else {
        Ok(browser.to_string())
    }
}

fn ytdlp_push_cookie_cli_args(
    app: &AppHandle,
    args: &mut Vec<String>,
    cookie_file: Option<&str>,
    browser_cookies: Option<&str>,
) -> Result<(), String> {
    if let Some(file) = cookie_file.filter(|s| !s.is_empty()) {
        crate::rf_log!(
            "download.ytdlp",
            log::Level::Warn,
            "yt-dlp cookie arg: --cookies {}",
            file
        );
        args.push("--cookies".into());
        args.push(file.to_string());
        return Ok(());
    }
    if let Some(browser) = browser_cookies.filter(|s| !s.is_empty() && *s != "chrome") {
        let browser_arg = ytdlp_browser_cookie_arg(app, browser)?;
        crate::rf_log!(
            "download.ytdlp",
            log::Level::Warn,
            "yt-dlp cookie arg: --cookies-from-browser {}",
            browser_arg
        );
        args.push("--cookies-from-browser".into());
        args.push(browser_arg);
    }
    Ok(())
}

fn humanize_ytdlp_cookie_error(err: &str, browser: Option<&str>) -> String {
    let source = browser.map(cookie_browser_label).unwrap_or("browser");
    let raw = err.trim();
    if raw.is_empty() {
        format!(
            "Could not read cookies from {}. For signed-in content try Firefox, export a cookies.txt file, or restart RuForge before using Internal.",
            source
        )
    } else {
        format!(
            "Could not read cookies from {}.\n\nyt-dlp: {}\n\nFor signed-in content try Firefox, export a cookies.txt file, or restart RuForge before using Internal.",
            source, raw
        )
    }
}

fn ytdlp_has_configured_cookie_source(
    browser_cookies: Option<&str>,
    cookie_file: Option<&str>,
) -> bool {
    cookie_file.filter(|s| !s.is_empty()).is_some()
        || browser_cookies
            .filter(|s| !s.is_empty() && *s != "chrome")
            .is_some()
}

fn download_options_without_cookies(options: &DownloadOptions) -> DownloadOptions {
    DownloadOptions {
        browser_cookies: None,
        cookie_file: None,
        ..options.clone()
    }
}

async fn ytdlp_download_options_with_ruforge_export(
    app: &AppHandle,
    fallback: &DownloadOptions,
) -> Result<(DownloadOptions, Option<RuforgeCookieExport>), String> {
    if fallback.browser_cookies.as_deref() != Some("ruforge") {
        return Ok((fallback.clone(), None));
    }
    let export = export_ruforge_cookies_for_ytdlp(app).await?;
    let path = export.path().display().to_string();
    crate::rf_log!(
        "download.ytdlp",
        log::Level::Warn,
        "Internal cookie export OK; yt-dlp will use --cookies (not --cookies-from-browser). {}",
        export.report.summary_line()
    );
    Ok((
        DownloadOptions {
            browser_cookies: None,
            cookie_file: Some(path),
            ..fallback.clone()
        },
        Some(export),
    ))
}

async fn ytdlp_music_cookie_retry_args(
    app: &AppHandle,
    browser_cookies: Option<&str>,
    cookie_file: Option<&str>,
) -> Result<(Option<String>, Option<String>, Option<RuforgeCookieExport>), String> {
    if browser_cookies != Some("ruforge") {
        return Ok((
            browser_cookies.map(str::to_string),
            cookie_file.map(str::to_string),
            None,
        ));
    }
    let export = export_ruforge_cookies_for_ytdlp(app).await?;
    let path = export.path().display().to_string();
    crate::rf_log!(
        "download.ytdlp",
        log::Level::Warn,
        "Internal cookie export OK; yt-dlp will use --cookies (not --cookies-from-browser). {}",
        export.report.summary_line()
    );
    Ok((None, Some(path), Some(export)))
}

fn format_music_ytdlp_cookie_fallback_failure(
    without_err: &str,
    with_err: &str,
    browser: Option<&str>,
) -> String {
    if ytdlp_stderr_is_cookie_export_failure(with_err) {
        format!(
            "{}\nWithout cookies: {}",
            humanize_ytdlp_cookie_error(with_err, browser),
            humanize_music_ytdlp_error(without_err)
        )
    } else {
        format!(
            "yt-dlp failed without cookies ({}); with cookies ({})",
            humanize_music_ytdlp_error(without_err),
            humanize_music_ytdlp_error(with_err)
        )
    }
}

fn format_download_job_failure(
    error_log: &str,
    code: Option<i32>,
    browser_cookies: Option<&str>,
) -> String {
    if ytdlp_stderr_is_missing_js_runtime(error_log) {
        return format!("{}Download failed: no JavaScript runtime installed. Open Settings > Downloads to install Deno automatically.", JS_RUNTIME_MISSING_PREFIX);
    }
    if ytdlp_stderr_is_cookie_export_failure(error_log) {
        let humanized = humanize_ytdlp_cookie_error(error_log, browser_cookies);
        let trimmed = error_log.trim();
        if trimmed.is_empty() || humanized.contains(trimmed) {
            return humanized;
        }
        return format!("{}\n\nFull yt-dlp log:\n{}", humanized, trimmed);
    }
    if error_log.contains("HTTP Error 403") || error_log.contains("403: Forbidden") {
        return format!(
            "Download failed (HTTP 403): signed stream URL may have expired. Retry the job to resume with fresh cookies, or refresh cookies in Settings then retry. Full log:\n{}",
            error_log.trim()
        );
    }
    let trimmed = error_log.trim();
    if trimmed.is_empty() {
        format!("Download failed (exit code {:?})", code)
    } else {
        format!("Download failed (code {:?}): {}", code, trimmed)
    }
}

fn get_video_info_simulate_failure_message(err: &str) -> String {
    let trimmed = err.trim();
    if trimmed.is_empty() {
        "yt-dlp metadata simulate failed".to_string()
    } else {
        trimmed.to_string()
    }
}

async fn yt_dlp_comments_json_fetch(
    app: &AppHandle,
    url: &str,
    cookie_opts: Option<&DownloadOptions>,
) -> Result<serde_json::Value, String> {
    let extractor_args = ytdlp_comments_extractor_args();
    let mut args: Vec<String> = vec![
        "-J".into(),
        "--skip-download".into(),
        "--write-comments".into(),
        "--extractor-args".into(),
        extractor_args,
    ];
    if let Some(opts) = cookie_opts {
        ytdlp_push_cookie_cli_args(
            app,
            &mut args,
            opts.cookie_file.as_deref(),
            opts.browser_cookies.as_deref(),
        )?;
    }
    args.push(url.to_string());
    ytdlp_push_politeness_args(&mut args);
    ytdlp_push_js_runtime_args(app, &mut args);

    ytdlp_subprocess_rate_gate_wait().await?;
    let output = ytdlp_shell_command(app)?
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp (comments): {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        ytdlp_register_rate_limit_from_stderr(&err_msg).await;
        crate::rf_log!(
            "download.comments",
            log::Level::Warn,
            "yt-dlp comments fetch failed: {}",
            err_msg.lines().next().unwrap_or(&err_msg)
        );
        if ytdlp_stderr_is_missing_js_runtime(&err_msg) {
            return Err(format!("{}{}", JS_RUNTIME_MISSING_PREFIX, err_msg));
        }
        return Err(err_msg);
    }
    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse yt-dlp comments JSON: {}", e))?;
    Ok(parsed)
}

pub(crate) async fn fetch_ytdlp_comments_json(
    app: &AppHandle,
    url: &str,
    cookie_fallback: Option<&DownloadOptions>,
) -> Result<serde_json::Value, String> {
    yt_dlp_comments_json_fetch_with_cookie_fallback(app, url, cookie_fallback).await
}

async fn yt_dlp_comments_json_fetch_with_cookie_fallback(
    app: &AppHandle,
    url: &str,
    cookie_fallback: Option<&DownloadOptions>,
) -> Result<serde_json::Value, String> {
    match yt_dlp_comments_json_fetch(app, url, None).await {
        Ok(json) => Ok(json),
        Err(without_err) => {
            let Some(fallback) = cookie_fallback else {
                return Err(without_err);
            };
            if !ytdlp_has_configured_cookie_source(
                fallback.browser_cookies.as_deref(),
                fallback.cookie_file.as_deref(),
            ) {
                return Err(without_err);
            }
            let (resolved, cookie_guard) =
                ytdlp_download_options_with_ruforge_export(app, fallback).await?;
            let _cookie_guard = cookie_guard;
            yt_dlp_comments_json_fetch(app, url, Some(&resolved)).await
        }
    }
}

fn spawn_comments_sidecar_for_single_video(
    app: AppHandle,
    url: String,
    cookie_fallback: Option<DownloadOptions>,
    listing_root: PathBuf,
    since: SystemTime,
) {
    tauri::async_runtime::spawn(async move {
        let json = match yt_dlp_comments_json_fetch_with_cookie_fallback(
            &app,
            &url,
            cookie_fallback.as_ref(),
        )
        .await
        {
            Ok(j) => j,
            Err(_e) => {
                return;
            }
        };

        let video_id = json
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if video_id.is_empty() {
            crate::rf_log!(
                "download.comments",
                log::Level::Warn,
                "comments fetch returned no video id"
            );
            return;
        }

        let raw_comments = json
            .get("comments")
            .and_then(|v| v.as_array())
            .map(|a| a.as_slice())
            .unwrap_or(&[]);
        let entries = crate::commands::comments_sidecar::map_ytdlp_comments(raw_comments);

        let listing_root_for_scan = listing_root.clone();
        let mut paths: Vec<PathBuf> = Vec::new();
        for attempt in 0..12_u32 {
            paths = tokio::task::spawn_blocking({
                let listing_root = listing_root_for_scan.clone();
                move || collect_recent_video_paths(&listing_root, since)
            })
            .await
            .unwrap_or_default();
            if !paths.is_empty() {
                break;
            }
            if attempt < 11 {
                tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            }
        }

        let Some(media_path) = paths.into_iter().max_by_key(|p| {
            let stem = p
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let has_stream_suffix = crate::commands::comments_sidecar::strip_ytdlp_stream_suffix(stem)
                != stem;
            (
                !has_stream_suffix,
                std::fs::metadata(p)
                    .and_then(|m| m.modified())
                    .ok(),
            )
        }) else {
            crate::rf_log!(
                "download.comments",
                log::Level::Warn,
                "comments write skipped: no recent video under {}",
                listing_root.display()
            );
            return;
        };

        let entry_count = entries.len();
        let write_result = tokio::task::spawn_blocking(move || {
            crate::commands::comments_sidecar::write_comments_sidecar(
                &media_path,
                &video_id,
                &entries,
            )
        })
        .await;

        match write_result {
            Ok(Ok(path)) => {
                crate::rf_log!(
                    "download.comments",
                    log::Level::Info,
                    "wrote {} ({} comments)",
                    path.display(),
                    entry_count
                );
            }
            Ok(Err(e)) => {
                crate::rf_log!(
                    "download.comments",
                    log::Level::Warn,
                    "comments sidecar write failed: {}",
                    e
                );
            }
            Err(e) => {
                crate::rf_log!(
                    "download.comments",
                    log::Level::Warn,
                    "comments sidecar write task failed: {:?}",
                    e
                );
            }
        }
    });
}

fn default_audio_format() -> String {
    "m4a".to_string()
}

fn default_auto_scrub_previews() -> bool {
    true
}

fn default_stamp_artist_tags() -> bool {
    true
}

fn default_download_comments() -> bool {
    false
}

/// Scrubber sprites are for video files only (not audio-only library entries).
fn is_video_scrub_ext(ext: &str) -> bool {
    matches!(ext, "mp4" | "mkv" | "webm")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadOptions {
    pub format: String,
    pub output_dir: String,
    pub filename_template: String,
    pub browser_cookies: Option<String>,
    pub cookie_file: Option<String>,
    /// yt-dlp `--sub-langs` (e.g. `en.*`). Empty skips subtitle download flags.
    #[serde(default)]
    pub sub_langs: String,
    /// When true, download audio only (`-x` / `--extract-audio`).
    #[serde(default)]
    pub audio_only: bool,
    /// yt-dlp `--audio-format` (e.g. m4a, mp3, opus).
    #[serde(default = "default_audio_format")]
    pub audio_format: String,
    /// When true, build ffmpeg scrubber sprite sheets after a successful video download.
    #[serde(default = "default_auto_scrub_previews")]
    pub auto_scrub_previews: bool,
    /// Sanitized subfolder under `output_dir` for per-video playlist batch jobs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlist_output_folder: Option<String>,
    /// 1-based index in the playlist for filename ordering (`01 - title.ext`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlist_index: Option<u32>,
    /// When true, post-download enrich copies artist MB genres onto the track sidecar.
    #[serde(default = "default_stamp_artist_tags")]
    pub stamp_artist_tags: bool,
    /// When true, fetch YouTube comments after a single-video download and write `{stem}.comments.json`.
    #[serde(default = "default_download_comments")]
    pub download_comments: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    job_id: String,
    percentage: f32,
    speed: String,
    eta: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    current_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_items: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    current_item_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    downloaded_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_bytes: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadJobFinishedPayload {
    job_id: String,
    url: String,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_path: Option<String>,
}

pub(crate) fn video_info_cookie_probe(
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Option<DownloadOptions> {
    let browser = browser_cookies
        .filter(|s| !s.is_empty() && s != "chrome");
    let file = cookie_file.filter(|s| !s.is_empty());
    if browser.is_none() && file.is_none() {
        return None;
    }
    Some(DownloadOptions {
        format: String::new(),
        output_dir: String::new(),
        filename_template: String::new(),
        browser_cookies: browser,
        cookie_file: file,
        sub_langs: String::new(),
        audio_only: false,
        audio_format: default_audio_format(),
        auto_scrub_previews: true,
        playlist_output_folder: None,
        playlist_index: None,
        stamp_artist_tags: true,
        download_comments: false,
    })
}

pub fn media_inspection_to_video_info(inspection: MediaInspection) -> VideoInfo {
    VideoInfo {
        title: inspection.title,
        thumbnail: inspection.thumbnail,
        duration: inspection.duration,
        formats: inspection.formats,
        file_size_bytes: inspection.file_size_bytes,
        file_size_bytes_audio: inspection.file_size_bytes_audio,
        file_size_bytes_video: inspection.file_size_bytes_video,
        is_playlist: inspection.is_playlist,
        playlist_items: inspection.playlist_items.map(|items| {
            items
                .into_iter()
                .map(|p: EnginePlaylistItemPreview| PlaylistItemPreview {
                    title: p.title,
                    thumbnail: p.thumbnail,
                    duration: p.duration,
                    id: p.id,
                    webpage_url: p.webpage_url,
                    file_size_bytes: p.file_size_bytes,
                    file_size_bytes_audio: p.file_size_bytes_audio,
                    file_size_bytes_video: p.file_size_bytes_video,
                })
                .collect()
        }),
        uploader: inspection.uploader,
        channel: inspection.channel,
    }
}

#[tauri::command]
pub async fn get_video_info(
    app: AppHandle,
    engine_state: State<'_, MediaEngineState>,
    url: String,
    format: Option<String>,
    audio_only: Option<bool>,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
    display_only: Option<bool>,
) -> Result<VideoInfo, String> {
    let cookie_probe = video_info_cookie_probe(browser_cookies.clone(), cookie_file.clone());
    let browser_arg = if browser_cookies.as_deref() == Some("ruforge") {
        ytdlp_browser_cookie_arg(&app, "ruforge").ok()
    } else {
        None
    };
    let auth = auth_from_download_options(
        browser_cookies.as_deref(),
        cookie_file.as_deref(),
        browser_arg,
    );
    if let Some(ref probe) = cookie_probe {
        if probe.browser_cookies.as_deref() == Some("ruforge") {
            let export = export_ruforge_cookies_for_ytdlp(&app).await?;
            let path = export.path().display().to_string();
            let _export_guard = export;
            let auth = auth_from_download_options(None, Some(&path), None);
            let request = InspectRequest {
                url: url.clone(),
                video_format: format.clone(),
                audio_only: audio_only.unwrap_or(false),
                display_only: display_only.unwrap_or(false),
                auth,
            };
            let result = engine_state
                .engine
                .inspect(request)
                .await
                .map_err(|e| e.message)?;
            return Ok(media_inspection_to_video_info(result.inspection));
        }
    }

    let request = InspectRequest {
        url,
        video_format: format,
        audio_only: audio_only.unwrap_or(false),
        display_only: display_only.unwrap_or(false),
        auth,
    };
    engine_state
        .engine
        .inspect(request)
        .await
        .map(|r| media_inspection_to_video_info(r.inspection))
        .map_err(|e| get_video_info_simulate_failure_message(&e.message))
}

fn collect_recent_video_paths(root: &Path, since: SystemTime) -> Vec<PathBuf> {
    const SLACK_SECS: u64 = 15;
    let cutoff = since
        .checked_sub(std::time::Duration::from_secs(SLACK_SECS))
        .unwrap_or(since);

    let mut out: Vec<PathBuf> = Vec::new();

    fn walk(
        dir: &Path,
        depth: u32,
        max_depth: u32,
        cutoff: SystemTime,
        out: &mut Vec<PathBuf>,
    ) {
        if depth > max_depth {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for ent in rd.flatten() {
            let p = ent.path();
            if p.is_dir() {
                walk(&p, depth + 1, max_depth, cutoff, out);
                continue;
            }
            if !p.is_file() {
                continue;
            }
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !is_media_ext(&ext) || !is_video_scrub_ext(&ext) {
                continue;
            }
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if crate::commands::gallery::is_ytdlp_stream_intermediate_stem(stem) {
                continue;
            }
            let recent = std::fs::metadata(&p)
                .and_then(|m| m.modified())
                .map(|t| t >= cutoff)
                .unwrap_or(true);
            if recent {
                out.push(p);
            }
        }
    }

    if root.is_dir() {
        walk(root, 0, 8, cutoff, &mut out);
    }
    out.sort();
    out
}

fn is_ytdlp_temp_merge_path(path: &Path) -> bool {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|stem| stem.ends_with(".temp"))
        .unwrap_or(false)
}

fn pick_best_recent_video_output(paths: Vec<PathBuf>) -> Option<PathBuf> {
    paths
        .into_iter()
        .filter(|p| !is_ytdlp_temp_merge_path(p))
        .max_by_key(|p| {
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let has_stream_suffix =
                crate::commands::comments_sidecar::strip_ytdlp_stream_suffix(stem) != stem;
            (
                !has_stream_suffix,
                std::fs::metadata(p).and_then(|m| m.modified()).ok(),
            )
        })
}

fn pick_best_recent_audio_output(paths: Vec<PathBuf>) -> Option<PathBuf> {
    paths.into_iter().max_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok())
}

fn resolve_finished_download_output_path(
    listing_root: &Path,
    since: SystemTime,
    audio_only: bool,
) -> Option<PathBuf> {
    if audio_only {
        let paths = find_recent_audio_files(listing_root, since);
        return pick_best_recent_audio_output(paths);
    }
    let paths = collect_recent_video_paths(listing_root, since);
    pick_best_recent_video_output(paths)
}

const SCRUB_PREVIEW_CONCURRENCY: usize = 3;

fn spawn_scrub_previews_for_recent_videos(
    app: AppHandle,
    listing_root: PathBuf,
    since: SystemTime,
) {
    tokio::spawn(async move {
        let paths = tokio::task::spawn_blocking(move || {
            collect_recent_video_paths(&listing_root, since)
        })
        .await
        .unwrap_or_default();
        use futures_util::stream::{self, StreamExt};
        stream::iter(paths)
            .map(|path| {
                let app = app.clone();
                async move {
                    let path_str = path.to_string_lossy().to_string();
                    let _ = extract_frames(app, path_str, Some(true)).await;
                }
            })
            .buffer_unordered(SCRUB_PREVIEW_CONCURRENCY)
            .collect::<Vec<_>>()
            .await;
    });
}

#[tauri::command]
pub async fn start_download_job(
    app: AppHandle,
    engine_state: State<'_, MediaEngineState>,
    manager: State<'_, DownloadJobManager>,
    job_id: String,
    url: String,
    mut options: DownloadOptions,
    resume: bool,
) -> Result<(), String> {
    manager.try_claim_active_job(&job_id)?;

    let browser_arg = if options.browser_cookies.as_deref() == Some("ruforge") {
        ytdlp_browser_cookie_arg(&app, "ruforge").ok()
    } else {
        None
    };

    let inspect_auth = auth_from_download_options(
        options.browser_cookies.as_deref(),
        options.cookie_file.as_deref(),
        browser_arg.clone(),
    );

    let inspect_result = match engine_state
        .engine
        .inspect(InspectRequest {
            url: url.clone(),
            video_format: if options.audio_only {
                None
            } else {
                Some(options.format.clone())
            },
            audio_only: options.audio_only,
            display_only: false,
            auth: inspect_auth.clone(),
        })
        .await
    {
        Ok(r) => r,
        Err(e) => {
            manager.release_claim_if_pending(&job_id)?;
            return Err(e.message);
        }
    };

    let cookie_fallback = if ytdlp_has_configured_cookie_source(
        options.browser_cookies.as_deref(),
        options.cookie_file.as_deref(),
    ) {
        Some(options.clone())
    } else {
        None
    };

    let (download_options, cookie_export_guard) = if inspect_auth.is_some() {
        if options.browser_cookies.as_deref() == Some("ruforge") {
            match ytdlp_download_options_with_ruforge_export(&app, &options).await {
                Ok(pair) => pair,
                Err(e) => {
                    manager.release_claim_if_pending(&job_id)?;
                    return Err(e);
                }
            }
        } else {
            (options.clone(), None)
        }
    } else {
        (download_options_without_cookies(&options), None)
    };

    let choices = validated_choices_from_options(
        &download_options.format,
        download_options.audio_only,
        &download_options.audio_format,
        &download_options.sub_langs,
    )
    .map_err(|e| {
        let _ = manager.release_claim_if_pending(&job_id);
        e.message
    })?;

    let paths = DownloadPaths {
        output_dir: options.output_dir.clone(),
        filename_template: options.filename_template.clone(),
        playlist_output_folder: options.playlist_output_folder.clone(),
        playlist_index: options.playlist_index,
    };

    let probe_json = inspect_result
        .metadata_probe
        .unwrap_or(serde_json::Value::Null);
    let filename_template_eff = effective_filename_template(
        &probe_json,
        &options.filename_template,
        &choices,
        &paths,
    );

    let output_dir = options.output_dir.trim().to_string();
    if output_dir.is_empty() {
        manager.release_claim_if_pending(&job_id)?;
        return Err("Failed to create output directory: path is empty".into());
    }
    options.output_dir = output_dir.clone();
    if let Err(e) = std::fs::create_dir_all(&output_dir) {
        manager.release_claim_if_pending(&job_id)?;
        return Err(format!(
            "Failed to create output directory \"{}\": {}",
            output_dir, e
        ));
    }

    let download_auth = if download_options.browser_cookies.is_some()
        || download_options.cookie_file.is_some()
    {
        if let Some(ref export) = cookie_export_guard {
            auth_from_download_options(None, Some(&export.path().display().to_string()), None)
        } else {
            auth_from_download_options(
                download_options.browser_cookies.as_deref(),
                download_options.cookie_file.as_deref(),
                browser_arg,
            )
        }
    } else {
        None
    };

    let args = match build_download_args(
        &url,
        &choices,
        &output_dir,
        &filename_template_eff,
        resume,
        download_auth.as_ref(),
        crate::deno_binary::resolved_deno_path_if_present(&app).as_deref(),
    ) {
        Ok(a) => a,
        Err(e) => {
            manager.release_claim_if_pending(&job_id)?;
            return Err(e.message);
        }
    };
    let _ = inspect_result.inspection_id;

    let shell = match ytdlp_shell_command(&app) {
        Ok(c) => c,
        Err(e) => {
            manager.release_claim_if_pending(&job_id)?;
            return Err(e);
        }
    };

    let (mut rx, child) = match shell.args(args).spawn() {
        Ok(pair) => pair,
        Err(e) => {
            manager.release_claim_if_pending(&job_id)?;
            return Err(format!("Failed to start yt-dlp download: {}", e));
        }
    };

    match manager.place_running_child(&job_id, child) {
        Ok(Ok(())) => {}
        Ok(Err(child)) => {
            kill_ytdlp_tree(child);
            return Err("Download job was cancelled before yt-dlp could start.".into());
        }
        Err(lock_err) => return Err(lock_err),
    }

    let cookie_export_summary = cookie_export_guard
        .as_ref()
        .map(|g| g.report.summary_line());

    let manager_bg = manager.inner().clone();
    let comments_cookie_fallback = cookie_fallback.clone();
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        let _cookie_export_guard = cookie_export_guard;

        let download_started_at = SystemTime::now();
        let diag_root = post_download_diag_listing_root(
            Path::new(&options.output_dir),
            &filename_template_eff,
        );
        let auto_scrub = options.auto_scrub_previews && !options.audio_only;
        let browser_cookies_for_errors = options.browser_cookies.clone();
        let scrub_spawned = Arc::new(AtomicBool::new(false));
        let mut tracker = ProgressTracker::default();
        let mut error_log = String::new();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    if let Some(mut progress) = tracker.handle_stdout_line(&line) {
                        progress.job_id = job_id.clone();
                        let status = match progress.status {
                            media_engine::DownloadStatus::PostProcessing => "processing",
                            _ => "downloading",
                        };
                        let _ = app.emit(
                            "download-progress",
                            ProgressPayload {
                                job_id: job_id.clone(),
                                percentage: progress.percentage,
                                speed: progress.speed,
                                eta: progress.eta,
                                status: status.to_string(),
                                current_index: progress.current_index,
                                total_items: progress.total_items,
                                current_item_title: progress.current_item_title,
                                downloaded_bytes: progress.downloaded_bytes,
                                total_bytes: progress.total_bytes,
                            },
                        );
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    media_engine::progress::append_stderr_bounded(
                        &mut error_log,
                        &line_bytes,
                        ProgressTracker::STDERR_MAX_BYTES,
                    );
                }
                CommandEvent::Terminated(payload) => {
                    if let Err(e) = manager_bg.remove_active(&job_id) {
                        crate::rf_log!("download.jobs", log::Level::Error, "job {} remove_active: {}", job_id, e);
                    }

                    let paused = match manager_bg.take_paused(&job_id) {
                        Ok(b) => b,
                        Err(e) => {
                            crate::rf_log!("download.jobs", log::Level::Error, "job {} take_paused: {}", job_id, e);
                            false
                        }
                    };
                    if paused {
                        let _ = app.emit("download-job-paused", job_id.clone());
                        return;
                    }

                    if payload.code == Some(0) {
                        let diag_root_log = diag_root.clone();
                        let started_log = download_started_at;
                        let cleanup_root = diag_root.clone();
                        let _ = tokio::task::spawn_blocking(move || {
                            log_post_download_files_written(&diag_root_log, started_log);
                            cleanup_orphan_downloads_under(&cleanup_root, started_log);
                        });
                        if auto_scrub && !scrub_spawned.swap(true, Ordering::SeqCst) {
                            spawn_scrub_previews_for_recent_videos(
                                app.clone(),
                                diag_root.clone(),
                                download_started_at,
                            );
                        }
                        if options.audio_only {
                            let enrich_root = diag_root.clone();
                            let enrich_since = download_started_at;
                            let stamp_artist_tags = options.stamp_artist_tags;
                            let enrich_app = app.clone();
                            tauri::async_runtime::spawn(async move {
                                let opts = crate::commands::musicmeta::EnrichOpts {
                                    artist_tags: stamp_artist_tags,
                                };
                                for audio_path in find_recent_audio_files(&enrich_root, enrich_since) {
                                    let _ = crate::commands::musicmeta::enrich_music_meta_path(
                                        &enrich_app,
                                        &audio_path,
                                        crate::commands::musicmeta::EnrichMode::Full { force: false },
                                        opts,
                                    )
                                    .await;
                                    crate::commands::lyrics::ensure_lyrics_after_download(&audio_path)
                                        .await;
                                }
                            });
                        }
                        if options.download_comments
                            && crate::commands::comments_sidecar::is_single_video_download(
                                &options,
                                &filename_template_eff,
                            )
                        {
                            spawn_comments_sidecar_for_single_video(
                                app.clone(),
                                url.clone(),
                                comments_cookie_fallback.clone(),
                                diag_root.clone(),
                                download_started_at,
                            );
                        }
                        let output_path = resolve_finished_download_output_path(
                            &diag_root,
                            download_started_at,
                            options.audio_only,
                        )
                        .map(|p| p.to_string_lossy().into_owned());
                        if let Some(ref path) = output_path {
                            crate::rf_log!(
                                "download.jobs",
                                log::Level::Info,
                                "job {} finish output_path: {}",
                                job_id,
                                path
                            );
                        } else {
                            crate::rf_log!(
                                "download.jobs",
                                log::Level::Info,
                                "job {} finish output_path: (omitted)",
                                job_id
                            );
                        }
                        let app_reindex = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(lib) = app_reindex.try_state::<crate::library::LibraryState>() {
                                let _ = lib.reindex(&app_reindex).await;
                            }
                        });
                        let _ = app.emit(
                            "download-job-finished",
                            DownloadJobFinishedPayload {
                                job_id: job_id.clone(),
                                url: url.clone(),
                                success: true,
                                error: None,
                                output_path,
                            },
                        );
                        return;
                    }

                    let mut err = format_download_job_failure(
                        &error_log,
                        payload.code,
                        browser_cookies_for_errors.as_deref(),
                    );
                    if let Some(summary) = &cookie_export_summary {
                        err = format!("{summary}\n{err}");
                    }
                    crate::rf_log!("download.jobs", log::Level::Error, "job {} failed: {}", job_id, err);
                    let _ = app.emit(
                        "download-job-finished",
                        DownloadJobFinishedPayload {
                            job_id: job_id.clone(),
                            url: url.clone(),
                            success: false,
                            error: Some(err),
                            output_path: None,
                        },
                    );
                    return;
                }
                _ => {}
            }
        }

        if let Err(e) = manager_bg.remove_active(&job_id) {
            crate::rf_log!("download.jobs", log::Level::Error, "job {} remove_active (channel end): {}", job_id, e);
        }
        let paused = match manager_bg.take_paused(&job_id) {
            Ok(b) => b,
            Err(e) => {
                crate::rf_log!("download.jobs", log::Level::Error, "job {} take_paused (channel end): {}", job_id, e);
                false
            }
        };
        if !paused {
            let err = "Download process ended unexpectedly".to_string();
            crate::rf_log!("download.jobs", log::Level::Error, "job {}: {}", job_id, err);
            let _ = app.emit(
                "download-job-finished",
                DownloadJobFinishedPayload {
                    job_id,
                    url,
                    success: false,
                    error: Some(err),
                    output_path: None,
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn pause_download_job(
    manager: State<'_, DownloadJobManager>,
    job_id: String,
) -> Result<(), String> {
    manager.mark_paused(&job_id)?;
    if let Some(child) = manager.remove_active(&job_id)? {
        kill_ytdlp_tree(child);
        return Ok(());
    }
    Ok(())
}

/// After a webview reload the UI may show "paused" while yt-dlp still runs in-process.
#[tauri::command]
pub async fn stop_all_active_download_jobs(
    manager: State<'_, DownloadJobManager>,
) -> Result<u32, String> {
    manager.stop_all_active_downloads()
}

// ---------- Music browse API ----------

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicPlaylistInfo {
    pub id: String,
    pub title: String,
    pub url: String,
    pub thumbnail: Option<String>,
    pub track_count: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrowseResult {
    pub title: String,
    pub thumbnail: Option<String>,
    pub playlists: Vec<MusicPlaylistInfo>,
    /// When set to `channel_tabs_only`, yt-dlp only returned Videos/Shorts/Live-style tabs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub browse_kind: Option<String>,
}

/// Serialize concurrent music browse / playlist yt-dlp calls (panel + bottom bar).
fn music_ytdlp_mutex() -> &'static tokio::sync::Mutex<()> {
    static MUTEX: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    MUTEX.get_or_init(|| tokio::sync::Mutex::new(()))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicTrackInfo {
    pub id: String,
    pub title: String,
    pub url: String,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicPlaylistPage {
    pub items: Vec<MusicTrackInfo>,
    pub has_more: bool,
    pub total: Option<u32>,
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub declared_track_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub curator_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub curator_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub curator_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub browse_entity_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_year: Option<u32>,
}

fn best_thumbnail_url(entry: &serde_json::Value) -> Option<String> {
    if let Some(s) = entry.get("thumbnail").and_then(|v| v.as_str()) {
        if let Some(u) = normalize_thumbnail_url(s) {
            return Some(u);
        }
    }
    if let Some(arr) = entry.get("thumbnails").and_then(|v| v.as_array()) {
        if let Some(u) = thumbnail_from_thumbnails_array(arr) {
            return Some(u);
        }
    }
    if let Some(s) = entry.get("playlist_thumbnail").and_then(|v| v.as_str()) {
        if let Some(u) = normalize_thumbnail_url(s) {
            return Some(u);
        }
    }
    for key in ["channel_thumbnail", "uploader_thumbnail", "avatar"] {
        if let Some(s) = entry.get(key).and_then(|v| v.as_str()) {
            if let Some(u) = normalize_thumbnail_url(s) {
                return Some(u);
            }
        }
    }
    for key in ["channel_thumbnails", "avatar_thumbnails"] {
        if let Some(arr) = entry.get(key).and_then(|v| v.as_array()) {
            if let Some(u) = thumbnail_from_thumbnails_array(arr) {
                return Some(u);
            }
        }
    }
    None
}

fn is_youtube_channel_id(id: &str) -> bool {
    let id = id.trim();
    id.len() == 24 && id.starts_with("UC")
}

fn is_youtube_playlist_list_id(id: &str) -> bool {
    let id = id.trim();
    id.starts_with("PL")
        || id.starts_with("OL")
        || id.starts_with("VL")
        || id.starts_with("RD")
        || id.starts_with("UU")
        || id.starts_with("LL")
        || id.starts_with("FL")
        || id.starts_with("LP")
}

/// YouTube Music browse entity ids (albums, artists, shelves) — not valid as `watch?v=` ids.
fn is_youtube_music_browse_id(id: &str) -> bool {
    let id = id.trim();
    if id.len() < 8 {
        return false;
    }
    id.starts_with("MPAD")
        || id.starts_with("MPRE")
        || id.starts_with("MPLY")
        || id.starts_with("MPLA")
        || id.starts_with("MPED")
        || (id.starts_with("MP")
            && id.len() >= 10
            && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
}

fn is_music_album_browse_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    if !lower.contains("music.youtube.com/browse/") {
        return false;
    }
    lower
        .split("/browse/")
        .nth(1)
        .and_then(|rest| rest.split(&['?', '#'][..]).next())
        .map(is_youtube_music_browse_id)
        .unwrap_or(false)
}

fn is_channel_tab_title(title: &str) -> bool {
    let t = title.trim().to_ascii_lowercase();
    t == "videos"
        || t == "uploads"
        || t == "shorts"
        || t == "live"
        || t == "streams"
        || t == "popular videos"
        || t.ends_with(" - videos")
}

fn entry_url_looks_like_channel_tab(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    u.contains("/shorts")
        || u.contains("/streams")
        || (u.contains("/live") && !u.contains("music.youtube.com/browse/"))
}

fn humanize_music_ytdlp_error(stderr: &str) -> String {
    if ytdlp_stderr_is_rate_limited(stderr) {
        return "YouTube rate-limited this session. Wait a few minutes, turn off Auto-save in Explore, \
                lower concurrent downloads, and add a batch start delay in Settings."
            .to_string();
    }
    if stderr.contains("Failed to resolve album to playlist") {
        return "This album page could not be resolved to a track list. Open the album in Explore, \
                wait for it to finish loading, then try Pick tracks again — or update yt-dlp in Settings."
            .to_string();
    }
    if stderr.contains("timed out") || stderr.contains("Timeout") {
        return "yt-dlp timed out. Try again, or open the Albums/Browse tab before Pick tracks."
            .to_string();
    }
    format!("yt-dlp error: {}", stderr.trim())
}

/// Channel tab suffix when yt-dlp only provides a UC id (Videos / Shorts / Live / Streams).
fn channel_tab_path_from_title(title: &str) -> &'static str {
    let t = title.to_ascii_lowercase();
    if t.contains("short") {
        "shorts"
    } else if t.contains("live") {
        "live"
    } else if t.contains("stream") {
        "streams"
    } else {
        "videos"
    }
}

/// Never synthesize `playlist?list=UC…` — channel ids are not playlist list ids.
fn resolve_music_entry_url(entry: &serde_json::Value, id: &str) -> String {
    if let Some(u) = entry["url"]
        .as_str()
        .or_else(|| entry["webpage_url"].as_str())
    {
        let trimmed = u.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    let id = id.trim();
    if is_youtube_playlist_list_id(id) {
        return format!("https://music.youtube.com/playlist?list={}", id);
    }
    if is_youtube_channel_id(id) {
        let title = entry["title"].as_str().unwrap_or("");
        let tab = channel_tab_path_from_title(title);
        return format!("https://www.youtube.com/channel/{}/{}", id, tab);
    }
    if is_youtube_music_browse_id(id) {
        return format!("https://music.youtube.com/browse/{}", id);
    }
    if !id.is_empty() && entry["duration"].is_number() {
        return format!("https://www.youtube.com/watch?v={}", id);
    }
    if !id.is_empty() && id.len() == 11 {
        return format!("https://www.youtube.com/watch?v={}", id);
    }
    if !id.is_empty() {
        return format!("https://music.youtube.com/browse/{}", id);
    }
    String::new()
}

fn should_include_music_browse_entry(entry: &serde_json::Value, entry_url: &str) -> bool {
    let raw_id = entry["id"].as_str().unwrap_or("").trim();
    let title = entry["title"].as_str().unwrap_or("").trim();

    if title.is_empty() && raw_id.is_empty() && entry_url.is_empty() {
        return false;
    }

    if is_channel_tab_title(title) {
        return false;
    }
    if raw_id.starts_with("UU") {
        return false;
    }
    if entry_url_looks_like_channel_tab(entry_url) {
        return false;
    }

    if let Some(count) = entry["playlist_count"].as_u64() {
        if count > 80
            && !is_youtube_music_browse_id(raw_id)
            && !(is_youtube_playlist_list_id(raw_id) && raw_id.starts_with("OLAK"))
        {
            return false;
        }
    }

    if is_youtube_music_browse_id(raw_id) {
        return true;
    }
    if is_youtube_playlist_list_id(raw_id) && !raw_id.starts_with("UU") {
        return true;
    }

    let entry_type = entry["_type"].as_str().unwrap_or("");
    if entry_type == "video" || entry_type == "url" {
        return false;
    }
    if entry_type == "channel" && is_youtube_channel_id(raw_id) {
        return false;
    }
    entry_type == "playlist" || entry_type == "url_transparent"
}

fn music_browse_entry_to_playlist(
    entry: &serde_json::Value,
    parent_thumb: &Option<String>,
) -> Option<MusicPlaylistInfo> {
    let raw_id = entry["id"].as_str().unwrap_or("").to_string();
    let playlist_title = entry["title"].as_str().unwrap_or("").to_string();
    let entry_url = resolve_music_entry_url(entry, &raw_id);
    if entry_url.is_empty() && playlist_title.is_empty() {
        return None;
    }
    if !should_include_music_browse_entry(entry, &entry_url) {
        return None;
    }
    let stable_id = stable_music_entry_id(entry, &raw_id, &entry_url);
    let track_count = entry["playlist_count"].as_u64().map(|n| n as u32);
    let thumb = best_thumbnail_url(entry).or_else(|| parent_thumb.clone());
    Some(MusicPlaylistInfo {
        id: stable_id,
        title: playlist_title,
        url: entry_url,
        thumbnail: thumb,
        track_count,
    })
}

fn push_music_browse_entry(
    entry: &serde_json::Value,
    parent_thumb: &Option<String>,
    seen: &mut HashSet<String>,
    playlists: &mut Vec<MusicPlaylistInfo>,
) {
    if let Some(pl) = music_browse_entry_to_playlist(entry, parent_thumb) {
        if seen.insert(pl.id.clone()) {
            playlists.push(pl);
        }
    }
}

fn walk_music_browse_entries(
    value: &serde_json::Value,
    depth: u32,
    parent_thumb: &Option<String>,
    seen: &mut HashSet<String>,
    playlists: &mut Vec<MusicPlaylistInfo>,
) {
    if depth > 6 {
        return;
    }
    if let Some(arr) = value.get("entries").and_then(|v| v.as_array()) {
        for entry in arr {
            push_music_browse_entry(entry, parent_thumb, seen, playlists);
            walk_music_browse_entries(entry, depth + 1, parent_thumb, seen, playlists);
        }
    }
}

fn collect_music_browse_playlists(
    root: &serde_json::Value,
    parent_thumb: &Option<String>,
) -> Vec<MusicPlaylistInfo> {
    let mut seen = HashSet::new();
    let mut playlists = Vec::new();

    if let Some(entries) = root["entries"].as_array() {
        for entry in entries {
            push_music_browse_entry(entry, parent_thumb, &mut seen, &mut playlists);
        }
    }

    if playlists.is_empty() {
        walk_music_browse_entries(root, 0, parent_thumb, &mut seen, &mut playlists);
    }

    playlists
}

fn entry_looks_like_track(entry: &serde_json::Value) -> bool {
    let entry_type = entry["_type"].as_str().unwrap_or("");
    entry_type == "video" || entry_type == "url" || entry["duration"].is_number()
}

fn push_album_track_entry(
    entry: &serde_json::Value,
    seen: &mut HashSet<String>,
    out: &mut Vec<serde_json::Value>,
) {
    if !entry_looks_like_track(entry) {
        return;
    }
    let raw_id = entry["id"].as_str().unwrap_or("");
    let url = resolve_music_entry_url(entry, raw_id);
    let key = if url.is_empty() {
        raw_id.to_string()
    } else {
        url
    };
    if key.is_empty() || !seen.insert(key) {
        return;
    }
    out.push(entry.clone());
}

fn walk_album_track_entries(
    value: &serde_json::Value,
    depth: u32,
    seen: &mut HashSet<String>,
    out: &mut Vec<serde_json::Value>,
) {
    if depth > 6 {
        return;
    }
    if let Some(arr) = value.get("entries").and_then(|v| v.as_array()) {
        for entry in arr {
            push_album_track_entry(entry, seen, out);
            walk_album_track_entries(entry, depth + 1, seen, out);
        }
    }
}

fn collect_album_track_entries(root: &serde_json::Value) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    if let Some(entries) = root["entries"].as_array() {
        for entry in entries {
            push_album_track_entry(entry, &mut seen, &mut out);
        }
    }
    if out.is_empty() {
        walk_album_track_entries(root, 0, &mut seen, &mut out);
    }
    out
}

/// Stable id for the UI: prefer unique url; channel ids repeat across artist tabs.
fn stable_music_entry_id(entry: &serde_json::Value, id: &str, entry_url: &str) -> String {
    let url = entry_url.trim();
    if !url.is_empty() {
        return url.to_string();
    }
    if !id.is_empty() && !is_youtube_channel_id(id) {
        return id.to_string();
    }
    let title = entry["title"].as_str().unwrap_or("").trim();
    if !title.is_empty() {
        return format!("{}::{}", id, title);
    }
    id.to_string()
}

/// Fetch artist/channel page and return child playlists/albums.
/// Uses `--flat-playlist -J` for speed; parent thumbnail fills missing shelf art.
#[tauri::command]
pub async fn get_music_browse_info(
    app: AppHandle,
    url: String,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<MusicBrowseResult, String> {
    let _guard = music_ytdlp_mutex()
        .lock()
        .await;

    let mut args: Vec<String> = vec![
        "--flat-playlist".into(),
        "-J".into(),
        "--no-warnings".into(),
    ];
    ytdlp_push_politeness_args(&mut args);
    run_ytdlp_json_with_cookie_fallback(
        &app,
        args,
        url,
        browser_cookies.as_deref(),
        cookie_file.as_deref(),
        "browse",
    )
    .await
    .and_then(|root| {
        let title = root["title"].as_str().unwrap_or("").to_string();
        let thumbnail = best_thumbnail_url(&root);
        let playlists = collect_music_browse_playlists(&root, &thumbnail);

        let browse_kind = if playlists.is_empty() {
            let had_channel_tabs = root["entries"].as_array().is_some_and(|entries| {
                entries.iter().any(|entry| {
                    let raw_id = entry["id"].as_str().unwrap_or("");
                    let entry_title = entry["title"].as_str().unwrap_or("");
                    let entry_url = resolve_music_entry_url(entry, raw_id);
                    is_channel_tab_title(entry_title)
                        || raw_id.starts_with("UU")
                        || entry_url_looks_like_channel_tab(&entry_url)
                        || (entry["_type"].as_str() == Some("channel")
                            && is_youtube_channel_id(raw_id))
                })
            });
            if had_channel_tabs {
                Some("channel_tabs_only".to_string())
            } else {
                None
            }
        } else {
            None
        };

        Ok(MusicBrowseResult {
            title,
            thumbnail,
            playlists,
            browse_kind,
        })
    })
}

async fn run_ytdlp_json(
    app: &AppHandle,
    mut args: Vec<String>,
    timeout_label: &str,
) -> Result<serde_json::Value, String> {
    ytdlp_push_politeness_args(&mut args);
    ytdlp_push_js_runtime_args(app, &mut args);
    ytdlp_subprocess_rate_gate_wait().await?;

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(90),
        ytdlp_shell_command(app)?.args(&args).output(),
    )
    .await
    .map_err(|_| format!("yt-dlp {} timed out after 90s", timeout_label))?
    .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        ytdlp_register_rate_limit_from_stderr(&err).await;
        if ytdlp_stderr_is_missing_js_runtime(&err) {
            return Err(format!("{}{}", JS_RUNTIME_MISSING_PREFIX, err));
        }
        return Err(humanize_music_ytdlp_error(&err));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse yt-dlp JSON: {}", e))
}

async fn run_ytdlp_json_with_cookie_fallback(
    app: &AppHandle,
    prefix_args: Vec<String>,
    url: String,
    browser_cookies: Option<&str>,
    cookie_file: Option<&str>,
    timeout_label: &str,
) -> Result<serde_json::Value, String> {
    let mut args = prefix_args.clone();
    args.push(url.clone());
    match run_ytdlp_json(app, args, timeout_label).await {
        Ok(root) => Ok(root),
        Err(without_err) if ytdlp_has_configured_cookie_source(browser_cookies, cookie_file) => {
            let label = browser_cookies
                .map(cookie_browser_label)
                .unwrap_or("cookie file");
            crate::rf_log!(
                "download.ytdlp",
                log::Level::Warn,
                "yt-dlp {} failed without cookies; retrying with {}: {}",
                timeout_label,
                label,
                without_err.lines().next().unwrap_or(&without_err)
            );
            let (browser, file, cookie_guard) =
                match ytdlp_music_cookie_retry_args(app, browser_cookies, cookie_file).await {
                    Ok(args) => args,
                    Err(export_err) => {
                        return Err(format!(
                            "{export_err}\n\nWithout cookies: {}",
                            humanize_music_ytdlp_error(&without_err)
                        ));
                    }
                };
            let export_summary = cookie_guard.as_ref().map(|g| g.report.summary_line());
            let mut retry_args = prefix_args;
            ytdlp_push_cookie_cli_args(
                app,
                &mut retry_args,
                file.as_deref(),
                browser.as_deref(),
            )?;
            retry_args.push(url);
            match run_ytdlp_json(app, retry_args, timeout_label).await {
                Ok(root) => Ok(root),
                Err(with_err) => {
                    let mut msg = format_music_ytdlp_cookie_fallback_failure(
                        &without_err,
                        &with_err,
                        browser_cookies,
                    );
                    if let Some(summary) = export_summary {
                        msg = format!("{summary}\n{msg}");
                    }
                    Err(msg)
                }
            }
        }
        Err(err) => Err(err),
    }
}

async fn fetch_album_tracks_page(
    app: &AppHandle,
    url: &str,
    offset: u32,
    limit: u32,
    browser_cookies: Option<&str>,
    cookie_file: Option<&str>,
) -> Result<MusicPlaylistPage, String> {
    let limit = limit.max(1).min(100);
    let start = offset + 1;
    let end = offset + limit;

    let flat_prefix: Vec<String> = vec![
        "--flat-playlist".into(),
        "-J".into(),
        "--no-warnings".into(),
        "--playlist-start".into(),
        start.to_string(),
        "--playlist-end".into(),
        end.to_string(),
    ];

    match run_ytdlp_json_with_cookie_fallback(
        app,
        flat_prefix,
        url.to_string(),
        browser_cookies,
        cookie_file,
        "playlist page",
    )
    .await
    {
        Ok(root) => Ok(playlist_page_from_root(&root, offset, limit, url)),
        Err(flat_err)
            if flat_err.contains("Failed to resolve album to playlist")
                || flat_err.contains("resolve album") =>
        {
            let browse_prefix: Vec<String> = vec!["-J".into(), "--no-warnings".into()];
            let root = run_ytdlp_json_with_cookie_fallback(
                app,
                browse_prefix,
                url.to_string(),
                browser_cookies,
                cookie_file,
                "album browse",
            )
            .await?;
            let track_entries = collect_album_track_entries(&root);
            let total = track_entries.len() as u32;
            let slice: Vec<_> = track_entries
                .into_iter()
                .skip(offset as usize)
                .take(limit as usize)
                .collect();
            let playlist_thumb = best_thumbnail_url(&root);
            let mut items = Vec::new();
            for entry in slice {
                let raw_id = entry["id"].as_str().unwrap_or("").to_string();
                let item_title = entry["title"].as_str().unwrap_or("").to_string();
                let entry_url = resolve_music_entry_url(&entry, &raw_id);
                if entry_url.is_empty() {
                    continue;
                }
                let stable_id = stable_music_entry_id(&entry, &raw_id, &entry_url);
                items.push(MusicTrackInfo {
                    id: stable_id,
                    title: item_title,
                    url: entry_url,
                    duration: entry["duration"].as_f64(),
                    thumbnail: best_thumbnail_url(&entry).or_else(|| playlist_thumb.clone()),
                    artist: entry["artist"]
                        .as_str()
                        .or_else(|| entry["uploader"].as_str())
                        .map(String::from),
                    album: entry["album"].as_str().map(String::from),
                });
            }
            let fetched = offset + items.len() as u32;
            let mut page = playlist_root_meta_from_ytdlp(&root, url);
            page.items = items;
            page.has_more = fetched < total;
            page.total = Some(total);
            Ok(page)
        }
        Err(other) => Err(other),
    }
}

fn extract_playlist_list_id(url: &str) -> Option<String> {
    let lower = url.to_ascii_lowercase();
    let marker = "list=";
    let idx = lower.find(marker)?;
    let tail = &url[idx + marker.len()..];
    let end = tail
        .find(['&', '#', '?'])
        .map(|i| &tail[..i])
        .unwrap_or(tail)
        .trim();
    if end.is_empty() {
        None
    } else {
        Some(end.to_string())
    }
}

fn infer_playlist_kind_ytdlp(root: &serde_json::Value, list_url: &str) -> String {
    if is_music_album_browse_url(list_url) {
        return "album".to_string();
    }
    if let Some(id) = extract_playlist_list_id(list_url) {
        if id.starts_with("OLAK") || id.starts_with("OL") {
            return "album".to_string();
        }
        if id.starts_with("RD") {
            return "mix".to_string();
        }
        if id.starts_with("PL") {
            return "userPlaylist".to_string();
        }
    }
    if root["id"]
        .as_str()
        .map(|id| id.starts_with("MPAD"))
        .unwrap_or(false)
    {
        return "album".to_string();
    }
    "unknown".to_string()
}

fn browse_entity_url_from_ytdlp(root: &serde_json::Value, list_url: &str) -> Option<String> {
    if is_music_album_browse_url(list_url) {
        return Some(list_url.trim().to_string());
    }
    if let Some(id) = root["id"].as_str() {
        if is_youtube_music_browse_id(id) {
            return Some(format!("https://music.youtube.com/browse/{}", id));
        }
    }
    None
}

fn curator_fields_from_ytdlp_root(
    root: &serde_json::Value,
) -> (Option<String>, Option<String>, Option<String>) {
    let name = root["uploader"]
        .as_str()
        .or_else(|| root["channel"].as_str())
        .or_else(|| root["artist"].as_str())
        .map(String::from);
    let id = root["channel_id"]
        .as_str()
        .or_else(|| root["uploader_id"].as_str())
        .map(String::from);
    let url = root["channel_url"]
        .as_str()
        .or_else(|| root["uploader_url"].as_str())
        .map(String::from);
    (name, id, url)
}

fn playlist_root_meta_from_ytdlp(root: &serde_json::Value, list_url: &str) -> MusicPlaylistPage {
    let declared_track_count = root["playlist_count"].as_u64().map(|n| n as u32);
    let (curator_name, curator_id, curator_url) = curator_fields_from_ytdlp_root(root);
    MusicPlaylistPage {
        items: Vec::new(),
        has_more: false,
        total: declared_track_count,
        title: root["title"].as_str().map(String::from),
        cover_url: best_thumbnail_url(root),
        playlist_kind: Some(infer_playlist_kind_ytdlp(root, list_url)),
        declared_track_count,
        curator_name,
        curator_id,
        curator_url,
        browse_entity_url: browse_entity_url_from_ytdlp(root, list_url),
        release_year: root["release_year"].as_u64().map(|n| n as u32),
    }
}

fn playlist_page_from_root(
    root: &serde_json::Value,
    offset: u32,
    limit: u32,
    list_url: &str,
) -> MusicPlaylistPage {
    let total = root["playlist_count"].as_u64().map(|n| n as u32);
    let mut items = Vec::new();
    let entries = root["entries"].as_array().map(|v| v.as_slice()).unwrap_or_default();
    let playlist_thumb = best_thumbnail_url(root);
    for entry in entries {
        let raw_id = entry["id"].as_str().unwrap_or("").to_string();
        let item_title = entry["title"].as_str().unwrap_or("").to_string();
        let entry_url = resolve_music_entry_url(entry, &raw_id);
        if entry_url.is_empty() {
            continue;
        }
        let stable_id = stable_music_entry_id(entry, &raw_id, &entry_url);
        let duration = entry["duration"].as_f64();
        let thumb = best_thumbnail_url(entry).or_else(|| playlist_thumb.clone());
        let artist = entry["artist"]
            .as_str()
            .or_else(|| entry["uploader"].as_str())
            .map(String::from);
        let album = entry["album"].as_str().map(String::from);
        items.push(MusicTrackInfo {
            id: stable_id,
            title: item_title,
            url: entry_url,
            duration,
            thumbnail: thumb,
            artist,
            album,
        });
    }
    let has_more = match total {
        Some(t) => (offset + items.len() as u32) < t,
        None => items.len() as u32 == limit,
    };
    let mut page = playlist_root_meta_from_ytdlp(root, list_url);
    page.items = items;
    page.has_more = has_more;
    page
}

/// Fetch a page of tracks from a playlist URL.
/// `offset` is 0-based; `limit` is the page size (default 10).
#[tauri::command]
pub async fn get_playlist_items_page(
    app: AppHandle,
    url: String,
    offset: u32,
    limit: u32,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<MusicPlaylistPage, String> {
    let _guard = music_ytdlp_mutex()
        .lock()
        .await;

    let cookie_file_ref = cookie_file.as_deref();
    let browser_ref = browser_cookies.as_deref();

    if is_music_album_browse_url(&url) {
        return fetch_album_tracks_page(
            &app,
            &url,
            offset,
            limit,
            browser_ref,
            cookie_file_ref,
        )
        .await;
    }

    let limit = limit.max(1).min(100);
    let start = offset + 1;
    let end = offset + limit;

    let prefix_args: Vec<String> = vec![
        "--flat-playlist".into(),
        "-J".into(),
        "--no-warnings".into(),
        "--playlist-start".into(),
        start.to_string(),
        "--playlist-end".into(),
        end.to_string(),
    ];
    let list_url = url.clone();
    let root = run_ytdlp_json_with_cookie_fallback(
        &app,
        prefix_args,
        url,
        browser_ref,
        cookie_file_ref,
        "playlist page",
    )
    .await?;
    Ok(playlist_page_from_root(&root, offset, limit, &list_url))
}

#[cfg(test)]
mod music_browse_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalize_thumbnail_url_protocol_relative() {
        assert_eq!(
            normalize_thumbnail_url("//i.ytimg.com/vi/abc/hqdefault.jpg").as_deref(),
            Some("https://i.ytimg.com/vi/abc/hqdefault.jpg")
        );
    }

    #[test]
    fn best_thumbnail_url_uses_thumbnails_array_and_normalizes() {
        let entry = json!({
            "thumbnails": [{ "url": "//i.ytimg.com/vi/abc/hqdefault.jpg" }]
        });
        assert_eq!(
            best_thumbnail_url(&entry).as_deref(),
            Some("https://i.ytimg.com/vi/abc/hqdefault.jpg")
        );
    }

    #[test]
    fn thumbnail_from_thumbnails_array_prefers_signed_s_p_art_over_bare_maxres() {
        let arr = vec![
            json!({
                "url": "https://i9.ytimg.com/s_p/OLAK5uy_test/mqdefault.jpg?sqp=x&rs=y",
                "width": 180,
                "height": 180,
            }),
            json!({
                "url": "https://i9.ytimg.com/s_p/OLAK5uy_test/sddefault.jpg?sqp=x&rs=y",
                "width": 640,
                "height": 640,
            }),
            json!({
                "url": "https://i9.ytimg.com/s_p/OLAK5uy_test/maxresdefault.jpg",
                "width": 1200,
                "height": 1200,
            }),
        ];
        let picked = thumbnail_from_thumbnails_array(&arr).expect("pick");
        assert!(picked.contains("sddefault"));
        assert!(picked.contains('?'));
    }

    #[test]
    fn resolve_music_entry_url_channel_tab_from_title() {
        let shorts = json!({ "title": "Shorts" });
        assert_eq!(
            resolve_music_entry_url(&shorts, "UCfM3zsQsOnfWNUppiycmBuw"),
            "https://www.youtube.com/channel/UCfM3zsQsOnfWNUppiycmBuw/shorts"
        );
        let live = json!({ "title": "Live" });
        assert_eq!(
            resolve_music_entry_url(&live, "UCfM3zsQsOnfWNUppiycmBuw"),
            "https://www.youtube.com/channel/UCfM3zsQsOnfWNUppiycmBuw/live"
        );
    }

    #[test]
    fn resolve_music_entry_url_uu_playlist() {
        let entry = json!({ "title": "Uploads" });
        assert_eq!(
            resolve_music_entry_url(&entry, "UUfM3zsQsOnfWNUppiycmBuw"),
            "https://music.youtube.com/playlist?list=UUfM3zsQsOnfWNUppiycmBuw"
        );
    }

    #[test]
    fn normalize_thumbnail_url_rejects_playlist_page_urls() {
        assert!(normalize_thumbnail_url(
            "https://www.youtube.com/playlist?list=UCfM3zsQsOnfWNUppiycmBuw"
        )
        .is_none());
        assert!(normalize_thumbnail_url("https://i.ytimg.com/vi/abc/hqdefault.jpg").is_some());
    }

    #[test]
    fn resolve_music_entry_url_mpad_browse() {
        let entry = json!({ "title": "The Eminem Show" });
        assert_eq!(
            resolve_music_entry_url(&entry, "MPADUCedvOgsKFzcK3hA5taf3KoQ"),
            "https://music.youtube.com/browse/MPADUCedvOgsKFzcK3hA5taf3KoQ"
        );
    }

    #[test]
    fn should_exclude_channel_tab_entries() {
        let videos = json!({
            "_type": "playlist",
            "id": "UUabc123",
            "title": "Videos",
            "playlist_count": 320
        });
        assert!(!should_include_music_browse_entry(
            &videos,
            "https://music.youtube.com/playlist?list=UUabc123"
        ));

        let shorts = json!({
            "_type": "playlist",
            "id": "UCabc123",
            "title": "Shorts",
            "playlist_count": 40
        });
        assert!(!should_include_music_browse_entry(
            &shorts,
            "https://www.youtube.com/channel/UCabc123/shorts"
        ));

        let album = json!({
            "_type": "url_transparent",
            "id": "MPADUCedvOgsKFzcK3hA5taf3KoQ",
            "title": "The Eminem Show",
            "playlist_count": 20
        });
        assert!(should_include_music_browse_entry(
            &album,
            "https://music.youtube.com/browse/MPADUCedvOgsKFzcK3hA5taf3KoQ"
        ));
    }

    #[test]
    fn is_music_album_browse_url_detects_mpad() {
        assert!(is_music_album_browse_url(
            "https://music.youtube.com/browse/MPADUCedvOgsKFzcK3hA5taf3KoQ"
        ));
        assert!(!is_music_album_browse_url(
            "https://music.youtube.com/@Eminem"
        ));
    }
}

#[cfg(test)]
mod cookie_error_tests {
    use super::*;

    #[test]
    fn detects_chrome_cookie_database_errors() {
        assert!(ytdlp_stderr_is_cookie_export_failure(
            "ERROR: Could not copy Chrome cookie database."
        ));
        assert!(ytdlp_stderr_is_cookie_export_failure(
            "ERROR: Failed to decrypt with DPAPI. See https://github.com/yt-dlp/yt-dlp/issues/10927"
        ));
        assert!(ytdlp_stderr_is_cookie_export_failure(
            "ERROR: Could not read cookies from chrome profile"
        ));
        assert!(!ytdlp_stderr_is_cookie_export_failure(
            "ERROR: Video unavailable"
        ));
    }

    #[test]
    fn humanizes_ruforge_cookie_source() {
        let msg = humanize_ytdlp_cookie_error("cookie database", Some("ruforge"));
        assert!(msg.contains("RuForge Internal browser"));
        assert!(msg.contains("Firefox"));
    }

    #[test]
    fn humanized_cookie_error_includes_raw_stderr() {
        let raw = "ERROR: Could not copy Chrome cookie database.";
        let msg = humanize_ytdlp_cookie_error(raw, Some("ruforge"));
        assert!(msg.contains(raw));
    }

}

#[cfg(test)]
mod finish_output_path_tests {
    use super::*;
    use std::fs;
    use std::thread;
    use std::time::{Duration, SystemTime};

    #[test]
    fn pick_video_output_skips_temp_when_final_exists() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path();
        let since = SystemTime::now();
        thread::sleep(Duration::from_millis(20));
        let final_path = root.join("clip.mp4");
        fs::write(&final_path, b"x").expect("write final");
        let temp_path = root.join("clip.temp.mp4");
        fs::write(&temp_path, b"x").expect("write temp");

        let picked = resolve_finished_download_output_path(root, since, false)
            .expect("expected final video path");
        assert_eq!(picked, final_path);
    }

    #[test]
    fn pick_audio_output_prefers_newest() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path();
        let since = SystemTime::now();
        thread::sleep(Duration::from_millis(20));
        let older = root.join("a.m4a");
        fs::write(&older, b"x").expect("write older");
        thread::sleep(Duration::from_millis(20));
        let newer = root.join("b.m4a");
        fs::write(&newer, b"x").expect("write newer");

        let picked = resolve_finished_download_output_path(root, since, true)
            .expect("expected audio path");
        assert_eq!(picked, newer);
    }
}
