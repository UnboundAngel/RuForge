use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tauri::menu::{Menu, MenuEvent, MenuItem, Submenu};
use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
use std::sync::Mutex;

#[derive(Default)]
pub struct AppConfig {
    pub minimize_to_tray: Mutex<bool>,
}

// PR note: Disabled mode uses WebView2 `additional_browser_arguments` (`WebviewWindowBuilder::additional_browser_args` /
// `WindowConfig.additional_browser_args` → `wry`'s `with_additional_browser_args`) with Chromium flags
// `--disable-gpu` and `--disable-gpu-compositing`. Setting custom args replaces wry defaults, so we repeat
// `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection` exactly as `wry` does in `webview2/mod.rs`.

const HW_ACCEL_PREF_FILE: &str = "hardware-acceleration.json";

#[cfg(target_os = "windows")]
const WRY_WIN_DEFAULT_FEATURES: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HardwareAccelerationDisk {
    #[serde(default = "default_hardware_acceleration_enabled")]
    hardware_acceleration: bool,
}

fn default_hardware_acceleration_enabled() -> bool {
    true
}

impl Default for HardwareAccelerationDisk {
    fn default() -> Self {
        Self {
            hardware_acceleration: true,
        }
    }
}

impl HardwareAccelerationDisk {
    fn load(identifier: &str) -> Self {
        std::fs::read_to_string(pref_path(identifier))
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default()
    }

    #[cfg(target_os = "windows")]
    fn disable_gpu_browser_args() -> Option<String> {
        Some(format!(
            "{} --disable-gpu --disable-gpu-compositing",
            WRY_WIN_DEFAULT_FEATURES,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    fn disable_gpu_browser_args() -> Option<String> {
        None
    }

    /// Args for WebView creation when troubleshooting mode (HW off) is enabled. `None` = use browser defaults (HW on).
    fn webview_additional_browser_args(&self) -> Option<String> {
        if self.hardware_acceleration {
            None
        } else {
            Self::disable_gpu_browser_args()
        }
    }

    fn save_to_app_disk(&self, app: &AppHandle) -> Result<(), String> {
        let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(
            dir.join(HW_ACCEL_PREF_FILE),
            serde_json::to_string(self).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn pref_path(identifier: &str) -> std::path::PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(identifier)
        .join(HW_ACCEL_PREF_FILE)
}

fn apply_hardware_acceleration_prefs_to_context<R>(ctx: &mut tauri::Context<R>)
where
    R: tauri::Runtime,
{
    let prefs = HardwareAccelerationDisk::load(&ctx.config().identifier);
    if let Some(args) = prefs.webview_additional_browser_args() {
        for w in &mut ctx.config_mut().app.windows {
            w.additional_browser_args = Some(args.clone());
        }
    }
}

#[tauri::command]
fn get_hardware_acceleration_pref(app: AppHandle) -> Result<bool, String> {
    Ok(HardwareAccelerationDisk::load(&app.config().identifier).hardware_acceleration)
}

#[tauri::command]
fn set_hardware_acceleration_pref(app: AppHandle, hardware_acceleration: bool) -> Result<(), String> {
    HardwareAccelerationDisk { hardware_acceleration }.save_to_app_disk(&app)
}

#[tauri::command]
fn get_hardware_acceleration_browser_args(app: AppHandle) -> Option<String> {
    HardwareAccelerationDisk::load(&app.config().identifier).webview_additional_browser_args()
}

/// Best-effort local file inspection via `ffprobe` (ffmpeg bundle). Cached per path + file mtime.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FfprobeHint {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codecs_line: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate_kbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FfprobeCacheEntry {
    mtime_unix_secs: u64,
    hint: FfprobeHint,
}

fn probe_ffprobe_cache_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let dir = base.join("ffprobe-hints");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn probe_cache_hash_key(media_path: &str, mtime_unix: u64) -> String {
    let mut h = DefaultHasher::new();
    media_path.hash(&mut h);
    mtime_unix.hash(&mut h);
    format!("{:016x}", h.finish())
}

fn optional_bitrate_kbps(raw: Option<&serde_json::Value>) -> Option<u32> {
    let v = raw?;
    let bits = v
        .as_str()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .or_else(|| v.as_u64())
        .or_else(|| v.as_i64().filter(|i| *i >= 0).map(|i| i as u64))
        .filter(|n| *n > 0)?;
    Some(if bits >= 1000 {
        (bits / 1000).min(999_999) as u32
    } else {
        bits as u32
    })
}

fn run_ffprobe_json(media_path: &str) -> Result<serde_json::Value, String> {
    let mut cmd = std::process::Command::new("ffprobe");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let out = cmd
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            media_path,
        ])
        .output()
        .map_err(|e| format!("{}", e))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let msg = err.trim();
        return Err(if msg.is_empty() {
            "ffprobe exited with error".into()
        } else {
            msg.to_string()
        });
    }
    serde_json::from_slice(&out.stdout).map_err(|e| format!("ffprobe JSON: {}", e))
}

fn ffprobe_hint_from_root(val: serde_json::Value) -> FfprobeHint {
    let streams = val["streams"].as_array().cloned().unwrap_or_default();
    let mut v_codec = None::<String>;
    let mut a_codec = None::<String>;
    let mut bitrate_kbps_total = 0u64;
    let mut bitrate_streams = false;

    for s in &streams {
        let kind = s["codec_type"].as_str().unwrap_or("");
        let cand = s["codec_name"].as_str().unwrap_or("").trim();
        let trimmed = (!cand.is_empty()).then(|| {
            if cand.len() > 32 {
                format!("{}…", &cand[..31])
            } else {
                cand.to_string()
            }
        });
        match kind {
            "video" if trimmed.is_some() && v_codec.is_none() => v_codec = trimmed,
            "audio" if trimmed.is_some() && a_codec.is_none() => a_codec = trimmed,
            _ => {}
        }
        if let Some(br) = optional_bitrate_kbps(s.get("bit_rate")) {
            bitrate_streams = true;
            bitrate_kbps_total = bitrate_kbps_total.saturating_add(br as u64);
        }
    }

    let codecs_line = match (&v_codec, &a_codec) {
        (Some(v), Some(a)) => Some(format!("{} + {}", v, a)),
        (Some(v), None) => Some(v.clone()),
        (None, Some(a)) => Some(a.clone()),
        _ => None,
    };

    let format_obj = val["format"].clone();
    let format_name = format_obj["format_name"]
        .as_str()
        .map(|raw| raw.split(',').next().unwrap_or(raw).trim().to_string())
        .filter(|s| !s.is_empty());

    let mut bitrate_kbps = optional_bitrate_kbps(format_obj.get("bit_rate")).map(|kb| kb as u64);

    if bitrate_kbps.is_none() && bitrate_streams && bitrate_kbps_total > 0 {
        bitrate_kbps = Some(bitrate_kbps_total.min(u64::from(u32::MAX)));
    }

    let bitrate_final = bitrate_kbps.map(|b| b as u32).filter(|&k| k > 0);

    let ok =
        codecs_line.is_some() || bitrate_final.is_some() || format_name.as_ref().is_some_and(|s| !s.is_empty());

    let mut hint = FfprobeHint {
        ok,
        codecs_line,
        bitrate_kbps: bitrate_final,
        format_name,
        error: None,
    };

    if !ok && !streams.is_empty() {
        hint.error = Some("ffprobe returned streams but nothing we could summarize".into());
        return hint;
    }

    hint
}

fn probe_ffprobe_blocking(app: AppHandle, media_path: String, force_refresh: bool) -> Result<FfprobeHint, String> {
    let path_ref = std::path::Path::new(&media_path);
    let meta = std::fs::metadata(path_ref).map_err(|e| e.to_string())?;
    let mtime_unix = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let cache_dir = probe_ffprobe_cache_dir(&app)?;
    let hash = probe_cache_hash_key(&media_path, mtime_unix);
    let cache_file = cache_dir.join(format!("{}.json", hash));

    if !force_refresh {
        if let Ok(txt) = std::fs::read_to_string(&cache_file) {
            if let Ok(entry) = serde_json::from_str::<FfprobeCacheEntry>(&txt) {
                if entry.mtime_unix_secs == mtime_unix {
                    return Ok(entry.hint);
                }
            }
        }
    }

    let val = match run_ffprobe_json(&media_path) {
        Ok(v) => v,
        Err(e) => {
            return Ok(FfprobeHint {
                ok: false,
                codecs_line: None,
                bitrate_kbps: None,
                format_name: None,
                error: Some(format!(
                    "{} (requires ffprobe on PATH, same bundle as ffmpeg)",
                    e
                )),
            })
        }
    };

    let hint = ffprobe_hint_from_root(val);
    let hint_display = hint.clone();

    if hint.ok {
        let entry = FfprobeCacheEntry {
            mtime_unix_secs: mtime_unix,
            hint,
        };
        if let Ok(bytes) = serde_json::to_vec_pretty(&entry) {
            let _ = std::fs::write(cache_file, bytes);
        }
    }

    Ok(hint_display)
}

#[tauri::command]
async fn probe_local_media_ffprobe(
    app: AppHandle,
    media_path: String,
    force_refresh: Option<bool>,
) -> Result<FfprobeHint, String> {
    let app = app.clone();
    let refresh = force_refresh == Some(true);
    tokio::task::spawn_blocking(move || probe_ffprobe_blocking(app, media_path, refresh))
        .await
        .map_err(|e| format!("blocking task join: {}", e))?
}

/// One row inside a yt-dlp multi-video / playlist `-J` dump (lightweight subset for previews).
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
    /// Best-effort size from yt-dlp metadata (`-s` does not download; many entries omit this).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes: Option<u64>,
    /// True when the resolved URL behaves as multiple entries (`entries` nonempty with at least one valid item).
    /// Empty or all-null `entries`, or a flat single extractor dict → false and `playlist_items` is omitted.
    #[serde(default)]
    pub is_playlist: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist_items: Option<Vec<PlaylistItemPreview>>,
}

/// Pick a pre-download byte estimate from yt-dlp `--print-json` output (used with `-s` simulate).
///
/// **Why this order:** Root `filesize` is an exact size when the extractor knows `Content-Length`;
/// otherwise `filesize_approx` is yt-dlp's bitrate×duration-style estimate. For merged video+audio,
/// sizes often live only on `requested_formats` — we sum each stream's `filesize` or, failing that,
/// `filesize_approx`. If the merge dict has no sizes, we match a single root `format_id` against
/// `formats`. For `requested_formats` (video+audio), we only sum when **every** stream reports a
/// size — otherwise a partial sum would undercount. **Limitations with `-s`:** no HTTP HEAD/fetch is
/// performed; YouTube and others often leave these fields null; merged output may stay unknown if any
/// stream omits size metadata.
fn video_file_size_from_ytdlp_json(json: &serde_json::Value) -> Option<u64> {
    fn u64_from_field(v: &serde_json::Value) -> Option<u64> {
        v.as_u64()
            .or_else(|| v.as_i64().filter(|&i| i >= 0).map(|i| i as u64))
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
    if let Some(n) = json
        .get("filesize_approx")
        .and_then(u64_from_field)
        .filter(|&n| n > 0)
    {
        return Some(n);
    }

    if let Some(arr) = json.get("requested_formats").and_then(|v| v.as_array()) {
        if !arr.is_empty() && arr.iter().all(|f| size_from_format_entry(f).is_some()) {
            let sum: u64 = arr
                .iter()
                .map(|f| size_from_format_entry(f).unwrap_or(0))
                .sum();
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
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    while out.ends_with('.') || out.ends_with(char::is_whitespace) {
        out.pop();
    }
    let out = out.trim_matches('_').trim();
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

/// Best thumbnail URL from an entry (string field preferred, else thumbnails[] last URL).
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
        .and_then(|a| {
            a.last()?.get("url").and_then(|u| u.as_str()).map(str::trim)
        })
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_default()
}

fn ytdlp_entry_is_usable(entry: &serde_json::Value) -> bool {
    !(entry.is_null() || entry.as_object().is_some_and(|m| m.is_empty()))
}

/// Non-empty playable `entries`: filter null placeholders and empty objects.
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

/// Builds `VideoInfo` from a yt-dlp **single-json** `-J` root object (playlist wrapper or flat video dict).
///
/// Playlist detection (`is_playlist`): root has `entries`, and after dropping null/skipped placeholders
/// there is ≥1 usable item (`_type` is informational only; some sites omit it). Flat single videos have
/// no usable `entries` list and use root-level title/thumbnail/duration unchanged.
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

            let duration: f64 = entries
                .iter()
                .filter_map(|e| ytdlp_duration_secs(e))
                .sum();

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
    app: Option<&AppHandle>,
    url: &str,
    cookie_opts: Option<&DownloadOptions>,
) -> Result<serde_json::Value, String> {
    let mut cmd = Command::new("yt-dlp");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
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
                    let app_handle =
                        app.ok_or("RuForge cookie routing requires AppHandle resolution")?;
                    let data_dir = app_handle
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
    cmd.args(&args);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp (-J simulate): {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    serde_json::from_slice(&output.stdout).map_err(|e| format!("Failed to parse yt-dlp JSON: {}", e))
}

#[derive(Default, Clone)]
struct PlaylistDownloadProgressExtras {
    current_index: Option<u32>,
    total_items: Option<u32>,
    current_item_title: Option<String>,
}

/// yt-dlp lines like `[download] Downloading video 3 of 12` / `Downloading item 2 of 5`; optional ` - Title` suffix.
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
    let total: u32 = sep
        .1
        .split_whitespace()
        .next()?
        .trim()
        .parse()
        .ok()?;
    if total == 0 || current == 0 || current > total {
        return None;
    }
    let idx0 = current - 1;
    let tail_title = tail_raw
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string());
    Some((idx0, total, tail_title))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadOptions {
    pub format: String,
    pub output_dir: String,
    pub filename_template: String,
    pub browser_cookies: Option<String>,
    pub cookie_file: Option<String>,
}
#[derive(Clone, Serialize)]
struct ProgressPayload {
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
#[tauri::command]
async fn get_video_info(url: String) -> Result<VideoInfo, String> {
    let json = yt_dlp_single_json_simulate(None, &url, None).await?;
    Ok(video_info_from_ytdlp_single_json(json))
}
#[tauri::command]
async fn eval_in_webview(app: AppHandle, label: String, script: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
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

/// Playlist downloads nest beneath `output_dir/<sanitized name>/`; single videos reuse the flat template.
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

#[tauri::command]
async fn download_video(
    app: AppHandle,
    url: String,
    options: DownloadOptions,
) -> Result<String, String> {
    // One `-J -s` pass (same shape as `get_video_info`) so playlist vs single matches UI metadata and paths.
    let probe = yt_dlp_single_json_simulate(Some(&app), &url, Some(&options)).await?;
    let filename_template_eff = yt_dlp_effective_filename_template(&probe, &options.filename_template);

    let mut args = vec![
        "-f".to_string(),
        options.format.clone(),
        "-P".to_string(),
        options.output_dir.clone(),
        "-o".to_string(),
        filename_template_eff.clone(),
        "--newline".to_string(),
        // Sidecar: write the metadata JSON (contains chapters, description, etc.)
        "--write-info-json".to_string(),
        // Sidecar: write subtitles if the creator provided them
        "--write-subs".to_string(),
        // Sidecar: also write auto-generated captions as a fallback
        "--write-auto-subs".to_string(),
        // Target English; yt-dlp will fall back to the first available language if absent
        "--sub-lang".to_string(),
        "en.*".to_string(),
        // Convert any format (srv1, ttml, etc.) to VTT — native to the HTML5 <track> element
        "--convert-subs".to_string(),
        "vtt".to_string(),
        "--write-thumbnail".to_string(),
        "--convert-thumbnails".to_string(),
        "jpg".to_string(),
    ];

    push_ytdlp_download_cookie_args(&app, &mut args, &options)?;
    args.push(url.clone());

    let mut cmd = Command::new("yt-dlp");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let mut child = cmd
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start download: {}", e))?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let mut reader = BufReader::new(stdout).lines();
    let mut err_reader = BufReader::new(stderr).lines();

    let app_handle = app.clone();
    let progress_extras = std::sync::Arc::new(tokio::sync::Mutex::new(
        PlaylistDownloadProgressExtras::default(),
    ));
    let progress_clone = progress_extras.clone();

    tokio::spawn(async move {
        while let Ok(Some(line)) = reader.next_line().await {
            if line.contains("[download]") {
                if let Some((idx, total, tit)) = parse_ytdlp_playlist_download_line(&line) {
                    let mut lk = progress_clone.lock().await;
                    lk.current_index = Some(idx);
                    lk.total_items = Some(total);
                    if tit.is_some() {
                        lk.current_item_title = tit;
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

                        let extras = progress_clone.lock().await.clone();
                        let _ = app_handle.emit(
                            "download-progress",
                            ProgressPayload {
                                percentage,
                                speed: speed.to_string(),
                                eta: eta.to_string(),
                                status: "downloading".to_string(),
                                current_index: extras.current_index,
                                total_items: extras.total_items,
                                current_item_title: extras.current_item_title.clone(),
                            },
                        );
                    }
                }
            }
        }
    });

    let error_log = std::sync::Arc::new(tokio::sync::Mutex::new(String::new()));
    let error_log_clone = error_log.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = err_reader.next_line().await {
            let mut log = error_log_clone.lock().await;
            log.push_str(&line);
            log.push('\n');
        }
    });

    let status = child.wait().await.map_err(|e| e.to_string())?;

    if status.success() {
        let app_handle = app.clone();
        let video_url = url.clone();
        let dl_opts_for_name = options.clone();
        let filename_for_probe = filename_template_eff;

        tokio::spawn(async move {
            let mut get_name_args = vec![
                "-P".to_string(),
                dl_opts_for_name.output_dir.clone(),
                "-o".to_string(),
                filename_for_probe,
                "--get-filename".to_string(),
            ];
            let _ = push_ytdlp_download_cookie_args(&app_handle, &mut get_name_args, &dl_opts_for_name);
            get_name_args.push(video_url);

            let mut get_name_cmd = Command::new("yt-dlp");
            #[cfg(target_os = "windows")]
            get_name_cmd.creation_flags(0x08000000);

            if let Ok(output) = get_name_cmd.args(get_name_args).output().await {
                for raw in output.stdout.split(|&b| b == b'\n') {
                    let path_str = match std::str::from_utf8(raw) {
                        Ok(s) => s.trim(),
                        Err(_) => continue,
                    };
                    if path_str.is_empty() {
                        continue;
                    }
                    if std::path::Path::new(path_str).is_file() {
                        let _ = extract_frames(app_handle.clone(), path_str.to_string()).await;
                    }
                }
            }
        });

        Ok("Download completed successfully".to_string())
    } else {
        let final_err = error_log.lock().await.clone();
        Err(format!(
            "yt-dlp exited with status: {}\nError output:\n{}",
            status, final_err
        ))
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub start_time: f64,
    pub end_time: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created: u64,
    pub duration: f64,
    pub thumbnail_path: Option<String>,
    /// Single-frame `poster.jpg` under `.ruforge_thumbs/<stem>/` for library tiles (not sprite sheets).
    pub ruforge_poster_path: Option<String>,
    pub subtitle_path: Option<String>,
    pub chapters: Option<Vec<Chapter>>,
    /// Codec / bitrate string from yt-dlp `<stem>.info.json` beside the media file — indicative only (not decoded in-app).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_metadata_hint: Option<String>,
}

/// One folder grouping direct media children (Yt-dlp-style playlist directory under the library root).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistCollection {
    pub title: String,
    pub path: String,
    pub item_count: u32,
    pub combined_duration: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack_thumbnail_path: Option<String>,
    pub items: Vec<MediaFile>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GalleryEntry {
    Media {
        #[serde(flatten)]
        file: MediaFile,
    },
    Playlist {
        #[serde(flatten)]
        playlist: PlaylistCollection,
    },
}

/// Direct children media only (same folder thumbnails / sidecars as historical `scan_gallery`).
///
/// Nested subdirectories are deliberately ignored — only `GalleryEntry::Playlist` aggregates one level deep.
fn scan_direct_media_children(dir_path: &std::path::Path) -> Result<Vec<MediaFile>, String> {
    let mut sibling_paths: Vec<std::path::PathBuf> = std::fs::read_dir(dir_path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    sibling_paths.sort_by(|a, b| {
        a.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
            .cmp(
                &b.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase(),
            )
    });

    let mut files = vec![];
    for path in &sibling_paths {
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if !is_media_ext(ext) {
            continue;
        }

        let metadata = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let parent = path.parent().unwrap_or(std::path::Path::new(""));

        // --- Thumbnail discovery (in-memory scan; same folder as the video) ---
        let thumbnail_path = sibling_paths
            .iter()
            .find(|p| {
                let p_ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
                (p_ext == "jpg" || p_ext == "webp")
                    && p.file_name()
                        .and_then(|s| s.to_str())
                        .map(|n| n.starts_with(stem))
                        .unwrap_or(false)
            })
            .map(|p| p.to_string_lossy().to_string());

        let ruforge_poster_path = {
            let p = parent.join(THUMB_DIR_NAME).join(stem).join(POSTER_FILE);
            if p.is_file() {
                Some(p.to_string_lossy().to_string())
            } else {
                None
            }
        };

        let subtitle_path = sibling_paths
            .iter()
            .find(|p| {
                p.extension().and_then(|s| s.to_str()) == Some("vtt")
                    && p.file_name()
                        .and_then(|s| s.to_str())
                        .map(|n| n.starts_with(stem))
                        .unwrap_or(false)
            })
            .map(|p| p.to_string_lossy().to_string());

        // --- yt-dlp sidecar: title, duration, chapters ---
        let info_json_path = parent.join(format!("{}.info.json", stem));
        let (duration, chapters, metadata_title, download_metadata_hint) = if info_json_path.is_file() {
            std::fs::read_to_string(&info_json_path)
                .ok()
                .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
                .map(|json| {
                    let duration = json["duration"]
                        .as_f64()
                        .or_else(|| json["duration"].as_u64().map(|u| u as f64))
                        .or_else(|| json["duration"].as_i64().map(|i| i as f64))
                        .unwrap_or(0.0);
                    let chapters = json["chapters"].as_array().map(|arr| {
                        arr.iter()
                            .filter_map(|c| {
                                Some(Chapter {
                                    title: c["title"].as_str().unwrap_or("Chapter").to_string(),
                                    start_time: c["start_time"].as_f64().unwrap_or(0.0),
                                    end_time: c["end_time"].as_f64().unwrap_or(0.0),
                                })
                            })
                            .collect::<Vec<Chapter>>()
                    });
                    let metadata_title = json["title"]
                        .as_str()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(String::from);
                    let download_metadata_hint = download_metadata_hint_from_ytdlp_info(&json);
                    (duration, chapters, metadata_title, download_metadata_hint)
                })
                .unwrap_or((0.0, None, None, None))
        } else {
            (0.0, None, None, None)
        };

        let display_name = metadata_title.unwrap_or_else(|| stem.to_string());

        let created = match metadata.created() {
            Ok(time) => time.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
            Err(_) => continue,
        };

        files.push(MediaFile {
            name: display_name,
            path: path.to_string_lossy().to_string(),
            size: metadata.len(),
            created,
            duration,
            thumbnail_path,
            ruforge_poster_path,
            subtitle_path,
            chapters,
            download_metadata_hint,
        });
    }
    Ok(files)
}

fn bitrate_kbps_from_ytdlp_value(v: Option<&serde_json::Value>) -> Option<u32> {
    let json = v?;
    let n = json
        .as_f64()
        .or_else(|| json.as_u64().map(|u| u as f64))
        .or_else(|| json.as_i64().map(|i| i as f64))?;
    if !n.is_finite() || n <= 0.0 {
        return None;
    }
    let kb = n.round().clamp(1.0, 999_999.0) as u32;
    Some(kb)
}

fn bitrate_hint_from_ytdlp_root(json: &serde_json::Value) -> Option<u32> {
    for key in ["tbr", "abr", "vbr"] {
        if let Some(b) = bitrate_kbps_from_ytdlp_value(json.get(key)) {
            return Some(b);
        }
    }
    None
}

fn yt_dlp_codec_token(raw: Option<&serde_json::Value>) -> Option<String> {
    let s = raw?.as_str()?.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("none") {
        return None;
    }
    let s = if s.len() > 48 {
        format!("{}…", &s[..47])
    } else {
        s.to_string()
    };
    Some(s)
}

fn download_metadata_hint_from_ytdlp_info(json: &serde_json::Value) -> Option<String> {
    let v_part = yt_dlp_codec_token(json.get("vcodec"));
    let a_part = yt_dlp_codec_token(json.get("acodec"));
    let codec = match (&v_part, &a_part) {
        (Some(v), Some(a)) => format!("{} + {}", v, a),
        (Some(v), None) => v.clone(),
        (None, Some(a)) => a.clone(),
        (None, None) => String::new(),
    };

    let bit = bitrate_hint_from_ytdlp_root(json).map(|kb| format!("~{} kb/s", kb));

    match (!codec.is_empty(), bit) {
        (true, Some(b)) => Some(format!("{} · {}", codec, b)),
        (true, None) => Some(codec),
        (false, Some(b)) => Some(b),
        _ => None,
    }
}

#[tauri::command]
fn open_windows_sound_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg("ms-settings:sound")
            .spawn()
            .map_err(|e| format!("{}", e))?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows Sound settings shortcut is only available on Windows.".to_string())
    }
}

/// Hidden / internal folders under the library root (`scan_gallery`).
fn gallery_skip_subdirectory(folder_name: &str) -> bool {
    folder_name.starts_with('.') || folder_name == THUMB_DIR_NAME
}

#[tauri::command]
async fn scan_gallery(dir: String) -> Result<Vec<GalleryEntry>, String> {
    let dir_path = std::path::Path::new(&dir);
    let mut children: Vec<std::path::PathBuf> = std::fs::read_dir(dir_path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();

    children.sort_by(|a, b| {
        a.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
            .cmp(
                &b.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase(),
            )
    });

    let mut out: Vec<GalleryEntry> = Vec::new();

    // Loose media: direct media files beside folders (still flat relative to `-P`).
    let loose_media = scan_direct_media_children(dir_path)?;
    for file in loose_media {
        out.push(GalleryEntry::Media { file });
    }

    // One aggregate per immediate subfolder containing ≥1 direct media child; no duplicate loose rows.
    for path in children.iter().filter(|p| p.is_dir()) {
        let fname = match path.file_name().and_then(|n| n.to_str()) {
            Some(s) => s,
            None => continue,
        };
        if gallery_skip_subdirectory(fname) {
            continue;
        }

        let items = scan_direct_media_children(path)?;
        if items.is_empty() {
            continue;
        }

        let combined_duration: f64 = items.iter().map(|m| m.duration).sum();
        let folder_jpg = path.join("folder.jpg");
        let stack_thumb = folder_jpg
            .is_file()
            .then(|| folder_jpg.to_string_lossy().to_string())
            .or_else(|| {
                items
                    .iter()
                    .find_map(|it| it.ruforge_poster_path.clone().or_else(|| it.thumbnail_path.clone()))
            });

        out.push(GalleryEntry::Playlist {
            playlist: PlaylistCollection {
                title: fname.to_string(),
                path: path.to_string_lossy().to_string(),
                item_count: items.len() as u32,
                combined_duration,
                stack_thumbnail_path: stack_thumb,
                items,
            },
        });
    }

    Ok(out)
}
#[tauri::command]
fn update_tray_config(state: State<'_, AppConfig>, minimize: bool) {
    let mut minimize_to_tray = state.minimize_to_tray.lock().unwrap();
    *minimize_to_tray = minimize;
}
#[derive(Debug, Serialize, Deserialize)]
pub struct StorageStats {
    pub total_bytes: u64,
    pub file_count: u32,
}

#[tauri::command]
async fn get_storage_stats(dir: String) -> Result<StorageStats, String> {
    let mut total_bytes = 0;
    let mut file_count = 0;
    
    let path = std::path::Path::new(&dir);
    if !path.exists() {
        std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                    if is_media_ext(ext) {
                        if let Ok(metadata) = std::fs::metadata(path) {
                            total_bytes += metadata.len();
                            file_count += 1;
                        }
                    }
                }
            }
        }
    }
    
    Ok(StorageStats {
        total_bytes,
        file_count,
    })
}

/// Deletes ffprobe hint JSON files under the app cache (safe to purge; hints are rebuilt on demand).
#[tauri::command]
async fn clear_ruforge_cache(app: AppHandle) -> Result<u32, String> {
    let dir = probe_ffprobe_cache_dir(&app)?;
    let mut removed: u32 = 0;
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            removed = removed.saturating_add(1);
        }
    }
    Ok(removed)
}

#[tauri::command]
async fn authorize_cleanup(dir: String, target_free_bytes: u64) -> Result<u64, String> {
    let mut files = vec![];
    let paths = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    
    for path in paths {
        let path = path.map_err(|e| e.to_string())?.path();
        if path.is_file() {
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            if is_media_ext(ext) {
                let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
                let created = metadata.created().unwrap_or(std::time::SystemTime::now());
                files.push((path, metadata.len(), created));
            }
        }
    }
    
    // Sort by creation time (oldest first)
    files.sort_by(|a, b| a.2.cmp(&b.2));
    
    let mut deleted_bytes = 0;
    for (path, size, _) in files {
        if deleted_bytes >= target_free_bytes {
            break;
        }
        if std::fs::remove_file(path).is_ok() {
            deleted_bytes += size;
        }
    }
    
    Ok(deleted_bytes)
}

#[tauri::command]
async fn open_mini_player(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mini") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let prefs = HardwareAccelerationDisk::load(&app.config().identifier);

    let mut mini_builder =
        tauri::WebviewWindowBuilder::new(&app, "mini", tauri::WebviewUrl::App("index.html".into()))
            .title("RuForge Mini")
            .inner_size(480.0, 320.0)
            .min_inner_size(300.0, 200.0)
            .resizable(true)
            .decorations(false)
            .transparent(true)
            .shadow(false);

    if let Some(browser_args) = prefs.webview_additional_browser_args() {
        mini_builder = mini_builder.additional_browser_args(&browser_args);
    }

    let _window = mini_builder.build().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn open_youtube_explorer(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("explorer") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let ext_path = app.path().resource_dir()
        .map_err(|e| e.to_string())?
        .join("extensions/ublock");

    // Use a dedicated data directory for explorer to avoid conflicts with extensions enabled
    let data_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("explorer-data");

    let prefs = HardwareAccelerationDisk::load(&app.config().identifier);

    let mut builder = tauri::WebviewWindowBuilder::new(&app, "explorer", tauri::WebviewUrl::External("https://www.youtube.com".parse().unwrap()))
        .title("YouTube Explorer")
        .inner_size(1200.0, 800.0)
        .data_directory(data_dir)
        .browser_extensions_enabled(true)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .initialization_script(r#"
            (function() {
                console.log('RuForge Explorer Active');
                let lastUrl = window.location.href;
                
                function checkUrl() {
                    const currentUrl = window.location.href;
                    if (currentUrl !== lastUrl) {
                        lastUrl = currentUrl;
                        if (currentUrl.includes('watch?v=')) {
                            window.__TAURI__.event.emit('explorer-url', currentUrl);
                        }
                    }
                }
                
                // Monitor navigation
                setInterval(checkUrl, 1000);
                window.addEventListener('yt-navigate-finish', checkUrl);

                // Add visual badge
                const style = document.createElement('style');
                style.innerHTML = `
                    #ruforge-badge {
                        position: fixed;
                        top: 10px;
                        right: 150px;
                        z-index: 9999;
                        background: #d4a373;
                        color: #1c1512;
                        padding: 5px 15px;
                        border-radius: 20px;
                        font-family: sans-serif;
                        font-weight: bold;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                        pointer-events: none;
                    }
                `;
                document.head.appendChild(style);
                const badge = document.createElement('div');
                badge.id = 'ruforge-badge';
                badge.innerText = 'RuForge Ready';
                document.body.appendChild(badge);
            })();
        "#);

    if let Some(browser_args) = prefs.webview_additional_browser_args() {
        builder = builder.additional_browser_args(&browser_args);
    }

    if ext_path.exists() && ext_path.join("manifest.json").exists() {
        builder = builder.extensions_path(ext_path);
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}
const THUMB_DIR_NAME: &str = ".ruforge_thumbs";
const POSTER_FILE: &str = "poster.jpg";
const MEDIA_EXTS: &[&str] = &["mp4", "mkv", "webm", "mp3", "m4a", "flac"];

#[inline]
fn is_media_ext(ext: &str) -> bool {
    MEDIA_EXTS.contains(&ext)
}

fn collect_sprite_paths(thumb_dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(thumb_dir) {
        for e in rd.flatten() {
            let p = e.path();
            let Some(fname) = p.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            if fname.starts_with("sprite_") && fname.ends_with(".jpg") {
                out.push(p);
            }
        }
    }
    out.sort();
    out
}

/// Writes `poster.jpg` next to the video if it is still missing (fast path for library thumbnails).
#[tauri::command]
async fn ensure_poster_if_missing(video_path: String) -> Result<(), String> {
    let video_file_path = std::path::Path::new(&video_path);
    if !video_file_path.is_file() {
        return Ok(());
    }
    let video_dir = video_file_path.parent().ok_or("Invalid video path")?;
    let video_name = video_file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    let thumb_root = video_dir.join(THUMB_DIR_NAME);
    let thumb_dir = thumb_root.join(video_name);
    let poster_dest = thumb_dir.join(POSTER_FILE);
    if poster_dest.is_file() {
        return Ok(());
    }

    if !thumb_root.exists() {
        std::fs::create_dir_all(&thumb_root).map_err(|e| e.to_string())?;
        #[cfg(target_os = "windows")]
        {
            let mut attrib_cmd = Command::new("attrib");
            attrib_cmd.creation_flags(0x08000000);
            let _ = attrib_cmd
                .args(["+h", thumb_root.to_str().unwrap()])
                .status()
                .await;
        }
    }
    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    write_poster_jpeg(&video_path, &poster_dest).await
}

async fn write_poster_jpeg(video_path: &str, dest: &std::path::Path) -> Result<(), String> {
    let dest_str = dest.to_str().ok_or("Invalid poster path")?;
    let mut cmd = Command::new("ffmpeg");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let status = cmd
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            "0.1",
            "-i",
            video_path,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            dest_str,
        ])
        .status()
        .await
        .map_err(|e| format!("ffmpeg poster: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err("ffmpeg failed to write poster.jpg".into())
    }
}

#[tauri::command]
async fn extract_frames(_app: AppHandle, video_path: String) -> Result<Vec<String>, String> {
    let video_file_path = std::path::Path::new(&video_path);
    let video_dir = video_file_path.parent().ok_or("Invalid video path")?;
    let video_name = video_file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");

    let thumb_root = video_dir.join(THUMB_DIR_NAME);
    let thumb_dir = thumb_root.join(video_name);

    if !thumb_root.exists() {
        std::fs::create_dir_all(&thumb_root).map_err(|e| e.to_string())?;
        #[cfg(target_os = "windows")]
        {
            let mut attrib_cmd = Command::new("attrib");
            attrib_cmd.creation_flags(0x08000000);
            let _ = attrib_cmd.args(["+h", thumb_root.to_str().unwrap()]).status().await;
        }
    }

    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

    let poster_dest = thumb_dir.join(POSTER_FILE);
    let mut sprites = collect_sprite_paths(&thumb_dir);

    if sprites.is_empty() {
        let output_pattern = thumb_dir.join("sprite_%03d.jpg");
        let mut ffmpeg_cmd = Command::new("ffmpeg");
        #[cfg(target_os = "windows")]
        ffmpeg_cmd.creation_flags(0x08000000);

        let status = ffmpeg_cmd
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                video_path.as_str(),
                "-vf",
                "fps=1/5,scale=160:90,tile=10x10",
                "-q:v",
                "5",
                output_pattern.to_str().ok_or("Bad sprite path")?,
            ])
            .status()
            .await
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        if !status.success() {
            return Err("ffmpeg failed to extract frames".to_string());
        }

        sprites = collect_sprite_paths(&thumb_dir);
        if sprites.is_empty() {
            return Err("ffmpeg produced no sprite sheets".to_string());
        }
    }

    if !poster_dest.is_file() {
        let _ = write_poster_jpeg(&video_path, &poster_dest).await;
    }

    let out: Vec<String> = collect_sprite_paths(&thumb_dir)
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    Ok(out)
}

#[tauri::command]
async fn delete_media(video_path: String) -> Result<(), String> {
    let video_file_path = std::path::Path::new(&video_path);
    let video_dir = video_file_path.parent().ok_or("Invalid video path")?;
    let video_name = video_file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");
    
    let thumb_dir = video_dir.join(THUMB_DIR_NAME).join(video_name);

    // Delete the video file
    if video_file_path.exists() {
        std::fs::remove_file(video_file_path).map_err(|e| e.to_string())?;
    }

    // Delete the thumbnail directory
    if thumb_dir.exists() {
        std::fs::remove_dir_all(thumb_dir).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    apply_hardware_acceleration_prefs_to_context(&mut context);

    tauri::Builder::default()
        .manage(AppConfig {
            minimize_to_tray: Mutex::new(true),
        })
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--silently"])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Handle silent start
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--silently".to_string()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            
            // Troubleshooting Submenu
            let reload_i = MenuItem::with_id(app, "reload", "Reload Interface", true, None::<&str>)?;
            let toggle_gpu_i = MenuItem::with_id(app, "toggle_gpu", "Toggle GPU Acceleration & Restart", true, None::<&str>)?;
            let reset_i = MenuItem::with_id(app, "reset_data", "Reset App Data & Restart", true, None::<&str>)?;
            
            let troubleshooting_m = Submenu::with_items(
                app,
                "Troubleshooting",
                true,
                &[&reload_i, &toggle_gpu_i, &reset_i],
            )?;

            let menu = Menu::with_items(app, &[&show_i, &troubleshooting_m, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app: &AppHandle, event: MenuEvent| {
                    match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "reload" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("location.reload()");
                            }
                        }
                        "toggle_gpu" => {
                            // relaunch not found in current plugin version path
                            app.exit(0);
                        }
                        "reset_data" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("localStorage.clear(); location.reload();");
                            }
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray: &TrayIcon, event: TrayIconEvent| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppConfig>();
                let minimize_to_tray = *state.minimize_to_tray.lock().unwrap();
                
                if minimize_to_tray && window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_video_info,
            download_video,
            scan_gallery,
            open_mini_player,
            open_youtube_explorer,
            update_tray_config,
            extract_frames,
            ensure_poster_if_missing,
            delete_media,
            get_storage_stats,
            authorize_cleanup,
            clear_ruforge_cache,
            eval_in_webview,
            get_hardware_acceleration_pref,
            set_hardware_acceleration_pref,
            get_hardware_acceleration_browser_args,
            open_windows_sound_settings,
            probe_local_media_ffprobe
        ])
        .run(context)
        .expect("error while running tauri application");
}
