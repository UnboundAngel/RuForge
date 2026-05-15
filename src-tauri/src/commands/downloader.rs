use std::path::Path;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::download_job_manager::{kill_ytdlp_tree, DownloadJobManager};
use tauri_plugin_shell::ShellExt;

use crate::commands::media::extract_frames;

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
        log::info!(
            "[RuForge] post-download file list skipped (not a directory): {}",
            root.display()
        );
        return;
    }

    walk(root, root, 0, 8, cutoff, &mut rel_paths);
    rel_paths.sort();
    log::info!(
        "[RuForge] post-download files under {} (count={}, mtime cutoff ~{}s before job start): {:?}",
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
    #[serde(default)]
    pub is_playlist: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist_items: Option<Vec<PlaylistItemPreview>>,
}

fn video_file_size_from_ytdlp_json(json: &serde_json::Value) -> Option<u64> {
    fn u64_from_field(v: &serde_json::Value) -> Option<u64> {
        v.as_u64().or_else(|| v.as_i64().filter(|&i| i >= 0).map(|i| i as u64))
    }

    fn size_from_format_entry(fmt: &serde_json::Value) -> Option<u64> {
        fmt.get("filesize")
            .and_then(u64_from_field)
            .filter(|&n| n > 0)
            .or_else(|| {
                fmt.get("filesize_approx")
                    .and_then(u64_from_field)
                    .filter(|&n| n > 0)
            })
    }

    if let Some(n) = json.get("filesize").and_then(u64_from_field).filter(|&n| n > 0) {
        return Some(n);
    }
    if let Some(n) = json.get("filesize_approx").and_then(u64_from_field).filter(|&n| n > 0) {
        return Some(n);
    }

    if let Some(arr) = json.get("requested_formats").and_then(|v| v.as_array()) {
        if !arr.is_empty() && arr.iter().all(|f| size_from_format_entry(f).is_some()) {
            let sum: u64 = arr.iter().map(|f| size_from_format_entry(f).unwrap_or(0)).sum();
            if sum > 0 {
                return Some(sum);
            }
        }
    }

    if let Some(fid) = json.get("format_id").and_then(|v| v.as_str()) {
        if !fid.contains('+') {
            if let Some(arr) = json.get("formats").and_then(|v| v.as_array()) {
                for f in arr {
                    if f.get("format_id").and_then(|v| v.as_str()) == Some(fid) {
                        return size_from_format_entry(f);
                    }
                }
            }
        }
    }

    None
}

fn sanitize_playlist_folder_name(raw: &str) -> String {
    let trimmed = raw.trim();
    let mut out: String = trimmed
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    while out.ends_with('.') || out.ends_with(char::is_whitespace) {
        if out.is_empty() {
            break;
        }
        out.pop();
    }
    let out = out.trim().to_string();
    if out.is_empty() {
        "playlist".to_string()
    } else {
        out.chars().take(200).collect()
    }
}

fn ytdlp_duration_secs(v: &serde_json::Value) -> Option<f64> {
    v.get("duration")
        .and_then(|d| {
            d.as_f64()
                .or_else(|| d.as_u64().map(|u| u as f64))
                .or_else(|| d.as_i64().map(|i| i as f64))
        })
        .filter(|x| x.is_finite() && *x >= 0.0)
}

fn ytdlp_entry_thumbnail(entry: &serde_json::Value) -> String {
    if let Some(s) = entry.get("thumbnail").and_then(|v| v.as_str()) {
        let s = s.trim();
        if !s.is_empty() {
            return s.to_string();
        }
    }
    entry
        .get("thumbnails")
        .and_then(|arr| arr.as_array())
        .and_then(|a| a.last()?.get("url").and_then(|u| u.as_str()).map(str::trim))
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_default()
}

fn ytdlp_entry_is_usable(entry: &serde_json::Value) -> bool {
    !(entry.is_null() || entry.as_object().is_some_and(|m| m.is_empty()))
}

fn ytdlp_usable_playlist_entries(json: &serde_json::Value) -> Option<Vec<&serde_json::Value>> {
    let entries = json.get("entries").and_then(|e| e.as_array())?;
    let usable: Vec<&serde_json::Value> = entries.iter().filter(|e| ytdlp_entry_is_usable(e)).collect();
    if usable.is_empty() {
        None
    } else {
        Some(usable)
    }
}

fn playlist_preview_from_entry(entry: &serde_json::Value) -> PlaylistItemPreview {
    PlaylistItemPreview {
        title: entry
            .get("title")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Unknown")
            .to_string(),
        thumbnail: ytdlp_entry_thumbnail(entry),
        duration: ytdlp_duration_secs(entry).unwrap_or(0.0),
        id: entry
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        webpage_url: entry
            .get("webpage_url")
            .or_else(|| entry.get("url"))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
    }
}

fn playlist_aggregate_file_size(entries: &[&serde_json::Value]) -> Option<u64> {
    let mut sum = 0u64;
    let mut any = false;
    for e in entries {
        if let Some(n) = video_file_size_from_ytdlp_json(e) {
            sum = sum.saturating_add(n);
            any = true;
        }
    }
    any.then_some(sum).filter(|&s| s > 0)
}

fn video_info_from_ytdlp_single_json(json: serde_json::Value) -> VideoInfo {
    match ytdlp_usable_playlist_entries(&json) {
        Some(entries) => {
            let previews: Vec<PlaylistItemPreview> =
                entries.iter().copied().map(playlist_preview_from_entry).collect();
            let title = json
                .get("playlist_title")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    json.get("title")
                        .and_then(|v| v.as_str())
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                })
                .unwrap_or("Playlist")
                .to_string();
            let thumbnail = json
                .get("playlist_thumbnail")
                .or_else(|| json.get("thumbnail"))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| {
                    entries
                        .iter()
                        .map(|e| ytdlp_entry_thumbnail(e))
                        .find(|s| !s.is_empty())
                })
                .unwrap_or_default();

            let duration: f64 = entries.iter().filter_map(|e| ytdlp_duration_secs(e)).sum();

            VideoInfo {
                title,
                thumbnail,
                duration,
                formats: vec![],
                file_size_bytes: playlist_aggregate_file_size(&entries),
                is_playlist: true,
                playlist_items: Some(previews),
            }
        }
        None => VideoInfo {
            title: json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            thumbnail: json["thumbnail"].as_str().unwrap_or("").to_string(),
            duration: json["duration"].as_f64().unwrap_or(0.0),
            formats: vec![],
            file_size_bytes: video_file_size_from_ytdlp_json(&json),
            is_playlist: false,
            playlist_items: None,
        },
    }
}

async fn yt_dlp_single_json_simulate(
    app: &AppHandle,
    url: &str,
    cookie_opts: Option<&DownloadOptions>,
) -> Result<serde_json::Value, String> {
    let mut args: Vec<String> = vec!["-J".into(), "-s".into()];
    if let Some(opts) = cookie_opts {
        if let Some(cookie_file) = opts.cookie_file.as_ref() {
            if !cookie_file.is_empty() {
                args.push("--cookies".into());
                args.push(cookie_file.clone());
            }
        } else if let Some(browser) = opts.browser_cookies.as_ref() {
            if !browser.is_empty() {
                let browser_arg = if browser == "ruforge" {
                    let data_dir = app
                        .path()
                        .app_data_dir()
                        .map_err(|e| e.to_string())?
                        .join("explorer-data");
                    let profile_dir = data_dir.join("EBWebView").join("Default");
                    format!("chrome:{}", profile_dir.to_string_lossy())
                } else {
                    browser.clone()
                };
                args.push("--cookies-from-browser".into());
                args.push(browser_arg);
            }
        }
    }
    args.push(url.to_string());

    let output = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp sidecar (-J simulate): {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        log::error!("[RuForge] yt-dlp failed: {}", err_msg);
        return Err(err_msg);
    }
    serde_json::from_slice(&output.stdout).map_err(|e| format!("Failed to parse yt-dlp JSON: {}", e))
}

#[derive(Default, Clone)]
struct PlaylistDownloadProgressExtras {
    current_index: Option<u32>,
    total_items: Option<u32>,
    current_item_title: Option<String>,
}

fn parse_ytdlp_playlist_download_line(line: &str) -> Option<(u32, u32, Option<String>)> {
    if !line.contains("[download]") {
        return None;
    }
    let after = line
        .find("Downloading ")
        .map(|k| line[k + "Downloading ".len()..].trim_start())?;
    let (head, tail_raw) = match after.split_once(" - ") {
        Some((h, t)) => (h.trim(), Some(t.trim())),
        None => (after.trim(), None),
    };

    let head = ["video ", "item ", "entries ", "videos "]
        .into_iter()
        .find_map(|p| head.strip_prefix(p))?;

    let sep = head.split_once(" of ")?;
    let current: u32 = sep.0.trim().parse().ok()?;
    let total: u32 = sep.1.split_whitespace().next()?.trim().parse().ok()?;
    if total == 0 || current == 0 || current > total {
        return None;
    }
    let idx0 = current - 1;
    let tail_title = tail_raw.filter(|t| !t.is_empty()).map(|t| t.to_string());
    Some((idx0, total, tail_title))
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
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadJobFinishedPayload {
    job_id: String,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
pub async fn get_video_info(app: AppHandle, url: String) -> Result<VideoInfo, String> {
    let json = yt_dlp_single_json_simulate(&app, &url, None).await?;
    Ok(video_info_from_ytdlp_single_json(json))
}

fn push_ytdlp_download_cookie_args(
    app: &AppHandle,
    args: &mut Vec<String>,
    options: &DownloadOptions,
) -> Result<(), String> {
    if let Some(cookie_file) = options.cookie_file.as_ref() {
        if !cookie_file.is_empty() {
            args.push("--cookies".into());
            args.push(cookie_file.clone());
        }
    } else if let Some(browser) = options.browser_cookies.as_ref() {
        if !browser.is_empty() {
            if browser == "ruforge" {
                let data_dir = app
                    .path()
                    .app_data_dir()
                    .map_err(|e| e.to_string())?
                    .join("explorer-data");
                let profile_dir = data_dir.join("EBWebView").join("Default");
                args.push("--cookies-from-browser".into());
                args.push(format!("chrome:{}", profile_dir.to_string_lossy()));
            } else {
                args.push("--cookies-from-browser".into());
                args.push(browser.clone());
            }
        }
    }
    Ok(())
}

fn yt_dlp_effective_filename_template(metadata_probe: &serde_json::Value, user_template: &str) -> String {
    match ytdlp_usable_playlist_entries(metadata_probe) {
        Some(_) => {
            let raw = metadata_probe
                .get("playlist_title")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    metadata_probe
                        .get("title")
                        .and_then(|v| v.as_str())
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                })
                .unwrap_or("playlist");
            let folder = sanitize_playlist_folder_name(raw);
            let trimmed = user_template.trim_start_matches(|c| c == '/' || c == '\\');
            if trimmed.is_empty() {
                format!("{}/%(title)s.%(ext)s", folder)
            } else {
                format!("{}/{}", folder, trimmed)
            }
        }
        None => user_template.to_string(),
    }
}

fn build_ytdlp_download_args(
    app: &AppHandle,
    url: &str,
    options: &DownloadOptions,
    filename_template_eff: &str,
    resume: bool,
) -> Result<Vec<String>, String> {
    let mut args = vec![
        "-f".to_string(),
        options.format.clone(),
        "-P".to_string(),
        options.output_dir.clone(),
        "-o".to_string(),
        filename_template_eff.to_string(),
        "--windows-filenames".to_string(),
        "--no-restrict-filenames".to_string(),
        "--trim-filenames".to_string(),
        "200".to_string(),
        "--newline".to_string(),
        "--write-info-json".to_string(),
        "--write-thumbnail".to_string(),
        "--convert-thumbnails".to_string(),
        "jpg".to_string(),
    ];

    if resume {
        args.push("--continue".to_string());
    }

    let sub_langs = options.sub_langs.trim();
    log::info!("[RuForge] download sub_langs={:?} resume={}", sub_langs, resume);
    if !sub_langs.is_empty() {
        args.push("--write-subs".to_string());
        args.push("--write-auto-subs".to_string());
        args.push("--sub-langs".to_string());
        args.push(sub_langs.to_string());
        args.push("--convert-subs".to_string());
        args.push("vtt".to_string());
    }

    push_ytdlp_download_cookie_args(app, &mut args, options)?;
    args.push(url.to_string());
    Ok(args)
}

fn spawn_post_download_frame_extract(
    app: AppHandle,
    video_url: String,
    options: DownloadOptions,
    filename_template_eff: String,
) {
    tokio::spawn(async move {
        let mut get_name_args = vec![
            "-P".to_string(),
            options.output_dir.clone(),
            "-o".to_string(),
            filename_template_eff,
            "--windows-filenames".to_string(),
            "--trim-filenames".to_string(),
            "200".to_string(),
            "--get-filename".to_string(),
        ];
        let _ = push_ytdlp_download_cookie_args(&app, &mut get_name_args, &options);
        get_name_args.push(video_url);

        let Ok(sidecar) = app.shell().sidecar("yt-dlp") else {
            return;
        };
        if let Ok(output) = sidecar.args(get_name_args).output().await {
            for raw in output.stdout.split(|&b| b == b'\n') {
                let path_str = match std::str::from_utf8(raw) {
                    Ok(s) => s.trim(),
                    Err(_) => continue,
                };
                if path_str.is_empty() {
                    continue;
                }
                if std::path::Path::new(path_str).is_file() {
                    let _ = extract_frames(app.clone(), path_str.to_string()).await;
                }
            }
        }
    });
}

#[tauri::command]
pub async fn start_download_job(
    app: AppHandle,
    manager: State<'_, DownloadJobManager>,
    job_id: String,
    url: String,
    options: DownloadOptions,
    resume: bool,
) -> Result<(), String> {
    if manager.active.lock().unwrap().contains_key(&job_id) {
        return Err(format!("Job {} is already running", job_id));
    }

    let probe = yt_dlp_single_json_simulate(&app, &url, Some(&options)).await?;
    let filename_template_eff = yt_dlp_effective_filename_template(&probe, &options.filename_template);

    if let Err(e) = std::fs::create_dir_all(&options.output_dir) {
        return Err(format!("Failed to create output directory: {}", e));
    }

    let args = build_ytdlp_download_args(&app, &url, &options, &filename_template_eff, resume)?;

    let (mut rx, child) = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| format!("Failed to start download sidecar: {}", e))?;

    manager.insert_active(job_id.clone(), child);

    let manager_bg = manager.inner().clone();
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        let download_started_at = SystemTime::now();
        let diag_root = post_download_diag_listing_root(
            Path::new(&options.output_dir),
            &filename_template_eff,
        );
        let mut progress_extras = PlaylistDownloadProgressExtras::default();
        let mut error_log = String::new();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    if line.contains("[download]") {
                        if let Some((idx, total, tit)) =
                            parse_ytdlp_playlist_download_line(&line)
                        {
                            progress_extras.current_index = Some(idx);
                            progress_extras.total_items = Some(total);
                            if tit.is_some() {
                                progress_extras.current_item_title = tit;
                            }
                        }
                    }

                    if line.contains("[download]") && line.contains('%') {
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        if parts.len() >= 2 {
                            let percent_str = parts[1].trim_end_matches('%');
                            if let Ok(percentage) = percent_str.parse::<f32>() {
                                let mut speed = "";
                                let mut eta = "";

                                for (i, part) in parts.iter().enumerate() {
                                    if part.contains("/s") || part.contains("B/s") {
                                        speed = part;
                                    }
                                    if part.contains(':') && i > 4 {
                                        eta = part;
                                    }
                                }

                                let _ = app.emit(
                                    "download-progress",
                                    ProgressPayload {
                                        job_id: job_id.clone(),
                                        percentage,
                                        speed: speed.to_string(),
                                        eta: eta.to_string(),
                                        status: "downloading".to_string(),
                                        current_index: progress_extras.current_index,
                                        total_items: progress_extras.total_items,
                                        current_item_title: progress_extras
                                            .current_item_title
                                            .clone(),
                                    },
                                );
                            }
                        }
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    error_log.push_str(&String::from_utf8_lossy(&line_bytes));
                    error_log.push('\n');
                }
                CommandEvent::Terminated(payload) => {
                    manager_bg.remove_active(&job_id);

                    if manager_bg.take_paused(&job_id) {
                        let _ = app.emit("download-job-paused", job_id.clone());
                        return;
                    }

                    if payload.code == Some(0) {
                        log_post_download_files_written(&diag_root, download_started_at);
                        spawn_post_download_frame_extract(
                            app.clone(),
                            url.clone(),
                            options.clone(),
                            filename_template_eff.clone(),
                        );
                        let _ = app.emit(
                            "download-job-finished",
                            DownloadJobFinishedPayload {
                                job_id: job_id.clone(),
                                success: true,
                                error: None,
                            },
                        );
                        return;
                    }

                    let err =
                        format!("Download failed (code {:?}): {}", payload.code, error_log);
                    log::error!("[RuForge] job {} failed: {}", job_id, err);
                    let _ = app.emit(
                        "download-job-finished",
                        DownloadJobFinishedPayload {
                            job_id: job_id.clone(),
                            success: false,
                            error: Some(err),
                        },
                    );
                    return;
                }
                _ => {}
            }
        }

        manager_bg.remove_active(&job_id);
        if !manager_bg.take_paused(&job_id) {
            let err = "Download process ended unexpectedly".to_string();
            log::error!("[RuForge] job {}: {}", job_id, err);
            let _ = app.emit(
                "download-job-finished",
                DownloadJobFinishedPayload {
                    job_id,
                    success: false,
                    error: Some(err),
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
    manager.mark_paused(&job_id);
    if let Some(child) = manager.remove_active(&job_id) {
        kill_ytdlp_tree(child);
        return Ok(());
    }
    Ok(())
}
