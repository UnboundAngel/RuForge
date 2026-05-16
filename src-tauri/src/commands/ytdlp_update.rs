use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::Command as ShellCmd;
use tauri_plugin_shell::ShellExt;

use crate::download_job_manager::DownloadJobManager;
use crate::ytdlp_binary::{
    bundled_ytdlp_command, is_userdata_ytdlp_active, upstream_asset_basename,
    userdata_ytdlp_bin_dir, userdata_ytdlp_path, ytdlp_shell_command,
};

const YTDLP_REPO_LATEST_RELEASE: &str =
    "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
const CACHE_FILENAME: &str = "ytdlp-update-cache.json";
pub(crate) const CACHE_TTL_SECS: u64 = 12 * 60 * 60;

#[derive(Debug, Clone, Deserialize)]
struct GithubReleaseLatest {
    tag_name: String,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct YtdlpUpdateCacheDisk {
    checked_at_epoch_secs: i64,
    latest_tag_normalized: String,
    browser_download_url: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtdlpUpdateStatus {
    pub bundled_version: String,
    pub active_version: String,
    pub active_source: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_checked: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check_error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtdlpUpdateDownloadProgress {
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtdlpDownloadResult {
    pub active_version: String,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn normalize_release_tag(raw: &str) -> String {
    raw.strip_prefix('v').unwrap_or(raw).trim().to_owned()
}

fn parse_ytdlp_version_tuple(line: &str) -> Option<(u32, u32, u32)> {
    let first = line.lines().next().unwrap_or(line).trim();
    let cleaned = normalize_release_tag(first);
    let parts: Vec<u32> = cleaned
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|x| x.parse::<u32>().ok())
        .take(8)
        .collect();
    if parts.len() >= 3 {
        Some((parts[0], parts[1], parts[2]))
    } else {
        None
    }
}

fn tuple_newer_than_latest(active: &(u32, u32, u32), candidate: &(u32, u32, u32)) -> bool {
    candidate > active
}

fn cache_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(CACHE_FILENAME))
}

fn read_cache_disk(app: &AppHandle) -> Option<YtdlpUpdateCacheDisk> {
    let path = cache_file_path(app).ok()?;
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

fn write_cache_disk(app: &AppHandle, rec: &YtdlpUpdateCacheDisk) -> Result<(), String> {
    let path = cache_file_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(rec).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

fn trusted_download_url_prefix(tag_normalized: &str) -> String {
    format!(
        "https://github.com/yt-dlp/yt-dlp/releases/download/{}/",
        tag_normalized
    )
}

fn validate_trusted_url(url: &str, tag_normalized: &str) -> Result<(), String> {
    let expected = trusted_download_url_prefix(tag_normalized);
    if url.starts_with(&expected)
        && url.starts_with("https://github.com/yt-dlp/yt-dlp/releases/download/")
    {
        Ok(())
    } else {
        Err("Refusing untrusted yt-dlp download URL".into())
    }
}

async fn yt_dlp_version_line<F>(app: &AppHandle, f: F) -> Result<String, String>
where
    F: FnOnce(&AppHandle) -> Result<ShellCmd, String>,
{
    let out = f(app)?
        .args(["--version"])
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp --version: {}", e))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("yt-dlp --version failed: {}", err));
    }
    let line = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if line.is_empty() {
        Err("yt-dlp --version returned empty stdout".into())
    } else {
        Ok(line)
    }
}

fn pick_latest_asset(rel: &GithubReleaseLatest) -> Result<&GithubAsset, String> {
    let want = upstream_asset_basename();
    rel.assets
        .iter()
        .find(|a| a.name == want)
        .ok_or_else(|| format!("Latest release missing asset `{}`", want))
}

async fn fetch_github_latest_release_uncached(app: &AppHandle) -> Result<YtdlpUpdateCacheDisk, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!(
            "{}/{} (RuForge yt-dlp update check)",
            app.package_info().name,
            app.package_info().version,
        ))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(YTDLP_REPO_LATEST_RELEASE)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch yt-dlp release info: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "yt-dlp release API HTTP {}",
            response.status()
        ));
    }

    let rel: GithubReleaseLatest = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub JSON: {}", e))?;

    let tag_norm = normalize_release_tag(&rel.tag_name);
    let asset = pick_latest_asset(&rel)?;
    validate_trusted_url(&asset.browser_download_url, &tag_norm)?;

    Ok(YtdlpUpdateCacheDisk {
        checked_at_epoch_secs: now_secs(),
        latest_tag_normalized: tag_norm,
        browser_download_url: asset.browser_download_url.clone(),
    })
}

/// Refresh cached latest release metadata when TTL expired or `force_refresh`.
pub(crate) async fn refresh_ytdlp_release_cache_inner(
    app: &AppHandle,
    force_refresh: bool,
) -> Result<Option<YtdlpUpdateCacheDisk>, String> {
    let stale = match read_cache_disk(app) {
        Some(c) if !force_refresh => {
            if now_secs() - c.checked_at_epoch_secs <= CACHE_TTL_SECS as i64 {
                return Ok(Some(c));
            }
            Some(c)
        }
        otherwise => otherwise,
    };

    match fetch_github_latest_release_uncached(app).await {
        Ok(fresh) => {
            write_cache_disk(app, &fresh)?;
            Ok(Some(fresh))
        }
        Err(err) => {
            if let Some(snapshot) = stale {
                Ok(Some(snapshot))
            } else {
                Err(err)
            }
        }
    }
}

/// Fire-and-forget cache warm after app startup.
pub fn warm_ytdlp_release_cache_spawn(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = refresh_ytdlp_release_cache_inner(&app_handle, false).await {
            log::warn!("[RuForge] yt-dlp release cache warm failed: {}", e);
        }
    });
}

#[tauri::command]
pub async fn get_ytdlp_update_status(app: AppHandle) -> Result<YtdlpUpdateStatus, String> {
    let bundled_line = yt_dlp_version_line(&app, bundled_ytdlp_command).await?;
    let active_line = yt_dlp_version_line(&app, ytdlp_shell_command).await?;

    let active_source = if is_userdata_ytdlp_active(&app) {
        "userdata"
    } else {
        "bundled"
    }
    .to_string();

    let mut check_error = None::<String>;
    let cache = match refresh_ytdlp_release_cache_inner(&app, false).await {
        Ok(c) => c,
        Err(e) => {
            check_error = Some(e.clone());
            log::warn!("[RuForge] yt-dlp upstream check failed: {}", e);
            read_cache_disk(&app)
        }
    };

    let (latest_version, last_checked, update_available) = match &cache {
        Some(c) => {
            let last_checked = Some(c.checked_at_epoch_secs);
            let active_tuple = parse_ytdlp_version_tuple(&active_line);
            let latest_tuple = parse_ytdlp_version_tuple(&c.latest_tag_normalized);
            let cmp = match (active_tuple.as_ref(), latest_tuple.as_ref()) {
                (Some(av), Some(lv)) => tuple_newer_than_latest(av, lv),
                _ => normalize_release_tag(active_line.trim()) != c.latest_tag_normalized,
            };
            (
                Some(c.latest_tag_normalized.clone()),
                last_checked,
                cmp,
            )
        }
        None => (
            Option::<String>::None,
            None::<i64>,
            false,
        ),
    };

    if latest_version.is_none() && check_error.is_none() {
        check_error = Some("Could not resolve latest yt-dlp version".into());
    }

    Ok(YtdlpUpdateStatus {
        bundled_version: bundled_line.clone(),
        active_version: active_line,
        active_source,
        latest_version,
        update_available,
        last_checked,
        check_error,
    })
}

async fn verify_part_binary(app: &AppHandle, part_path: &Path) -> Result<(), String> {
    let out = app
        .shell()
        .command(part_path)
        .args(["--version"])
        .output()
        .await
        .map_err(|e| format!("Verify downloaded yt-dlp: {}", e))?;
    if !out.status.success() {
        return Err("Downloaded file failed `yt-dlp --version`; discarding.".into());
    }
    Ok(())
}

fn set_exe_unix(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::fs::Permissions;
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

#[tauri::command]
pub async fn download_ytdlp_update(
    app: AppHandle,
    manager: State<'_, DownloadJobManager>,
) -> Result<YtdlpDownloadResult, String> {
    if manager.has_active_downloads()? {
        return Err(
            "Finish or pause active downloads before updating yt-dlp.".into(),
        );
    }

    let _ = app.emit(
        "ytdlp-update-download-progress",
        YtdlpUpdateDownloadProgress {
            phase: "downloading".into(),
            percent: None,
        },
    );

    let fresh = refresh_ytdlp_release_cache_inner(&app, true)
        .await?
        .ok_or_else(|| "No yt-dlp release metadata available.".to_string())?;
    validate_trusted_url(&fresh.browser_download_url, &fresh.latest_tag_normalized)?;

    let bin_dir = userdata_ytdlp_bin_dir(&app)?;
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    let final_path = userdata_ytdlp_path(&app)?;
    let part_path = final_path.with_extension("download.part");

    if part_path.exists() {
        std::fs::remove_file(&part_path).map_err(|e| e.to_string())?;
    }

    let client = reqwest::Client::builder()
        .user_agent(format!(
            "{}/{} (RuForge yt-dlp download)",
            app.package_info().name,
            app.package_info().version,
        ))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(fresh.browser_download_url.clone())
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download HTTP {}", response.status()));
    }

    let total_size = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file =
        std::fs::File::create(&part_path).map_err(|e| format!("Create temp yt-dlp: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut last_bucket: Option<u32> = None;
    while let Some(byte_chunk) = stream.next().await {
        let chunk = byte_chunk.map_err(|e| format!("Download stream: {}", e))?;
        file
            .write_all(&chunk)
            .map_err(|e| format!("Writing yt-dlp file: {}", e))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);

        if let Some(total) = total_size {
            if total > 0 {
                let pct_floor = (((downloaded as f64 / total as f64) * 99.999).floor() as u32).min(100);
                let bucket = pct_floor / 5;
                if Some(bucket) != last_bucket {
                    last_bucket = Some(bucket);
                    let pct = ((downloaded as f64 / total as f64) * 100.0).min(100.0) as f32;
                    let _ = app.emit(
                        "ytdlp-update-download-progress",
                        YtdlpUpdateDownloadProgress {
                            phase: "downloading".into(),
                            percent: Some(pct),
                        },
                    );
                }
            }
        }
    }

    drop(file);

    let _ = app.emit(
        "ytdlp-update-download-progress",
        YtdlpUpdateDownloadProgress {
            phase: "verifying".into(),
            percent: None,
        },
    );

    verify_part_binary(&app, &part_path).await?;

    if final_path.exists() {
        std::fs::remove_file(&final_path).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&part_path, &final_path).map_err(|e| e.to_string())?;
    set_exe_unix(&final_path)?;

    let active_line = yt_dlp_version_line(&app, ytdlp_shell_command).await?;

    let _ = app.emit(
        "ytdlp-update-download-progress",
        YtdlpUpdateDownloadProgress {
            phase: "done".into(),
            percent: Some(100.0),
        },
    );

    Ok(YtdlpDownloadResult {
        active_version: active_line,
    })
}
