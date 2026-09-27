//! Live CookieManager export for RuForge Internal (`browserContext: "ruforge"`).
//!
//! Reads cookies from embedded webviews sharing the `explorer-data` profile and writes a
//! Netscape cookies.txt for yt-dlp `--cookies`. Must run `cookies_for_url` inside
//! `spawn_blocking` (WebView2 deadlock on sync commands).

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use cookie::Cookie;
use netscape_cookies::{cookie_dedupe_key, write_netscape_cookies};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tempfile::NamedTempFile;
use tokio::sync::Mutex;

use crate::hardware_acceleration::HardwareAccelerationDisk;

const YOUTUBE_URL: &str = "https://www.youtube.com";
const MUSIC_YOUTUBE_URL: &str = "https://music.youtube.com";
const MUSIC_EXPLORE_LABEL: &str = "music-explore-view";
/// Hidden boot webview from `youtubeProfileProbeRunner.ts`; already on the profile when present.
const SESSION_PROBE_LABEL: &str = "explorer-session-probe";
/// Temporary hidden window used only when nothing on the profile is mounted.
const COOKIE_PROBE_LABEL: &str = "explorer-cookie-probe";
/// Must match the other explorer-data webviews; UA is per webview, not an environment option.
const EXPLORER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[cfg(target_os = "linux")]
const LINUX_EXPLORER_LABEL: &str = "explorer-surface";
#[cfg(not(target_os = "linux"))]
const WIN_EXPLORER_LABEL: &str = "explorer-view";

/// Per-webview probe result at export time (for diagnostics).
#[derive(Clone, Debug)]
pub struct WebviewCookieProbe {
    pub label: String,
    pub cookie_count: usize,
}

/// Diagnostics captured on a successful export.
#[derive(Clone, Debug)]
pub struct RuforgeCookieExportReport {
    pub probes: Vec<WebviewCookieProbe>,
    pub not_mounted: Vec<String>,
    pub raw_cookie_count: usize,
    pub deduped_cookie_count: usize,
    pub written_cookie_count: usize,
    pub temp_path: PathBuf,
}

impl RuforgeCookieExportReport {
    /// One-line summary for logs and user-visible errors.
    pub fn summary_line(&self) -> String {
        let mounted_detail: Vec<String> = self
            .probes
            .iter()
            .map(|p| format!("{} ({} cookies)", p.label, p.cookie_count))
            .collect();
        format!(
            "RuForge cookie export: mounted=[{}]; not mounted=[{}]; raw={} deduped={}; wrote {} to {}",
            if mounted_detail.is_empty() {
                "none".to_string()
            } else {
                mounted_detail.join(", ")
            },
            if self.not_mounted.is_empty() {
                "none".to_string()
            } else {
                self.not_mounted.join(", ")
            },
            self.raw_cookie_count,
            self.deduped_cookie_count,
            self.written_cookie_count,
            self.temp_path.display()
        )
    }

    pub fn failure_line(&self) -> String {
        format!(
            "{}. yt-dlp will use --cookies (not --cookies-from-browser).",
            self.summary_line()
        )
    }
}

/// Keeps the temp cookies.txt on disk until dropped.
pub struct RuforgeCookieExport {
    _file: NamedTempFile,
    pub report: RuforgeCookieExportReport,
}

impl RuforgeCookieExport {
    pub fn path(&self) -> &Path {
        self._file.path()
    }
}

fn fetch_cookies_for_urls(
    cookies_for_url: &dyn Fn(Url) -> Result<Vec<Cookie<'static>>, String>,
) -> Result<Vec<Cookie<'static>>, String> {
    let urls = [
        Url::parse(YOUTUBE_URL).map_err(|e| e.to_string())?,
        Url::parse(MUSIC_YOUTUBE_URL).map_err(|e| e.to_string())?,
    ];
    let mut out = Vec::new();
    for url in urls {
        out.extend(cookies_for_url(url)?);
    }
    Ok(out)
}

fn probe_webview<F>(label: &str, fetch: F) -> Result<(Vec<Cookie<'static>>, WebviewCookieProbe), String>
where
    F: FnOnce() -> Result<Vec<Cookie<'static>>, String>,
{
    match fetch() {
        Ok(cookies) => {
            let count = cookies.len();
            Ok((
                cookies,
                WebviewCookieProbe {
                    label: label.to_string(),
                    cookie_count: count,
                },
            ))
        }
        Err(e) => Err(format!("{label}: {e}")),
    }
}

fn collect_cookies_sync(
    app: &AppHandle,
) -> Result<(Vec<Cookie<'static>>, Vec<WebviewCookieProbe>, Vec<String>, usize), String> {
    let mut probes = Vec::new();
    let mut missing_labels = Vec::new();
    let mut cookies = Vec::new();

    #[cfg(target_os = "linux")]
    {
        let label = LINUX_EXPLORER_LABEL;
        if let Some(win) = app.get_webview_window(label) {
            let (batch, probe) = probe_webview(label, || {
                fetch_cookies_for_urls(&|url| {
                    win.cookies_for_url(url).map_err(|e| e.to_string())
                })
            })?;
            cookies.extend(batch);
            probes.push(probe);
        } else {
            missing_labels.push(label.to_string());
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let label = WIN_EXPLORER_LABEL;
        if let Some(webview) = app.get_webview(label) {
            let (batch, probe) = probe_webview(label, || {
                fetch_cookies_for_urls(&|url| {
                    webview.cookies_for_url(url).map_err(|e| e.to_string())
                })
            })?;
            cookies.extend(batch);
            probes.push(probe);
        } else {
            missing_labels.push(label.to_string());
        }
    }

    if let Some(webview) = app.get_webview(MUSIC_EXPLORE_LABEL) {
        let (batch, probe) = probe_webview(MUSIC_EXPLORE_LABEL, || {
            fetch_cookies_for_urls(&|url| {
                webview.cookies_for_url(url).map_err(|e| e.to_string())
            })
        })?;
        cookies.extend(batch);
        probes.push(probe);
    } else {
        missing_labels.push(MUSIC_EXPLORE_LABEL.to_string());
    }

    if probes.is_empty() {
        let (batch, probe) = read_unmounted_profile(app)?;
        cookies.extend(batch);
        probes.push(probe);
    }

    let raw_cookie_count = cookies.len();
    let mut seen = HashSet::new();
    cookies.retain(|c| seen.insert(cookie_dedupe_key(c)));

    Ok((cookies, probes, missing_labels, raw_cookie_count))
}

/// Cold start: neither Explorer nor Music Explore is mounted, but the session is saved on disk
/// in `explorer-data`. Reuse the boot probe webview if it exists, otherwise open a hidden,
/// unfocused window on the same profile just long enough to read the cookie store.
fn read_unmounted_profile(
    app: &AppHandle,
) -> Result<(Vec<Cookie<'static>>, WebviewCookieProbe), String> {
    if let Some(webview) = app.get_webview(SESSION_PROBE_LABEL) {
        return probe_webview(SESSION_PROBE_LABEL, || {
            fetch_cookies_for_urls(&|url| webview.cookies_for_url(url).map_err(|e| e.to_string()))
        });
    }

    let window = match app.get_webview_window(COOKIE_PROBE_LABEL) {
        Some(w) => w,
        None => build_hidden_profile_window(app)?,
    };
    let result = probe_webview(COOKIE_PROBE_LABEL, || {
        fetch_cookies_for_urls(&|url| window.cookies_for_url(url).map_err(|e| e.to_string()))
    });
    // destroy, not close: skips close-requested handlers and never leaves a stray window.
    let _ = window.destroy();
    result
}

fn build_hidden_profile_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("explorer-data");

    // WebView2 rejects a second webview on the same user data folder whose environment
    // options differ, which would break Explorer or Music Explore opening later. Take the
    // browser args from the same source they use.
    let prefs = HardwareAccelerationDisk::load(&app.config().identifier);

    // about:blank keeps the probe off the network and silent; the cookie store is per
    // profile, so no YouTube page load is needed to read it.
    let mut builder = WebviewWindowBuilder::new(
        app,
        COOKIE_PROBE_LABEL,
        WebviewUrl::External(Url::parse("about:blank").map_err(|e| e.to_string())?),
    )
    .title("RuForge cookie probe")
    .visible(false)
    .focused(false)
    .skip_taskbar(true)
    .decorations(false)
    .shadow(false)
    .resizable(false)
    .inner_size(1.0, 1.0)
    .position(-4096.0, -4096.0)
    .user_agent(EXPLORER_USER_AGENT)
    .data_directory(data_dir);

    if let Some(browser_args) = prefs.webview_additional_browser_args() {
        builder = builder.additional_browser_args(&browser_args);
    }

    builder
        .build()
        .map_err(|e| format!("{COOKIE_PROBE_LABEL}: {e}"))
}

fn format_empty_export_error(probes: &[WebviewCookieProbe], missing: &[String]) -> String {
    let mounted_detail: Vec<String> = probes
        .iter()
        .map(|p| format!("{} ({} cookies)", p.label, p.cookie_count))
        .collect();
    let mounted_text = if mounted_detail.is_empty() {
        "none".to_string()
    } else {
        mounted_detail.join(", ")
    };
    let missing_text = if missing.is_empty() {
        "none".to_string()
    } else {
        missing.join(", ")
    };
    let read_saved_profile = probes
        .iter()
        .any(|p| p.label == COOKIE_PROBE_LABEL || p.label == SESSION_PROBE_LABEL);
    let hint = if read_saved_profile {
        "The saved RuForge Internal profile has no YouTube session. \
         Sign in to YouTube in Explorer or Music Explore, then try again."
    } else {
        "Sign in to YouTube in Explorer or Music Explore, then try again."
    };
    format!(
        "No YouTube session cookies found in RuForge Internal browser (0 cookies exported). \
         {hint} webviews mounted: [{mounted_text}]; not mounted: [{missing_text}]"
    )
}

fn format_unwritable_export_error(
    probes: &[WebviewCookieProbe],
    missing: &[String],
    raw_before_dedupe: usize,
    deduped: usize,
) -> String {
    let mounted_detail: Vec<String> = probes
        .iter()
        .map(|p| format!("{} ({} cookies)", p.label, p.cookie_count))
        .collect();
    let mounted_text = if mounted_detail.is_empty() {
        "none".to_string()
    } else {
        mounted_detail.join(", ")
    };
    let missing_text = if missing.is_empty() {
        "none".to_string()
    } else {
        missing.join(", ")
    };
    format!(
        "RuForge Internal cookie export wrote 0 lines ({raw_before_dedupe} raw, {deduped} after dedupe, \
         none with usable domain metadata). webviews mounted: [{mounted_text}]; not mounted: [{missing_text}]"
    )
}

fn cookie_export_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub async fn export_ruforge_cookies_for_ytdlp(
    app: &AppHandle,
) -> Result<RuforgeCookieExport, String> {
    // Serialize exports: concurrent CookieManager probes from queued hydrations deadlock
    // or return thin/empty snapshots when two jobs start together.
    let _export_gate = cookie_export_lock().lock().await;

    let app = app.clone();
    let (cookies, probes, missing, raw_before_dedupe) = tauri::async_runtime::spawn_blocking(move || {
        collect_cookies_sync(&app)
    })
    .await
    .map_err(|e| format!("Cookie export task failed: {e}"))??;

    if cookies.is_empty() {
        return Err(format_empty_export_error(&probes, &missing));
    }

    let deduped_count = cookies.len();

    let writable: Vec<Cookie<'static>> = cookies
        .into_iter()
        .filter(|c| netscape_cookies::format_netscape_line(c).is_some())
        .collect();
    if writable.is_empty() {
        return Err(format_unwritable_export_error(
            &probes,
            &missing,
            raw_before_dedupe,
            deduped_count,
        ));
    }

    let mut file = NamedTempFile::new()
        .map_err(|e| format!("Failed to create temporary cookies file: {e}"))?;
    let written_cookie_count = write_netscape_cookies(&mut file, &writable)?;
    file.flush()
        .map_err(|e| format!("Failed to flush cookies file: {e}"))?;

    let temp_path = file.path().to_path_buf();
    let report = RuforgeCookieExportReport {
        probes,
        not_mounted: missing,
        raw_cookie_count: raw_before_dedupe,
        deduped_cookie_count: deduped_count,
        written_cookie_count,
        temp_path: temp_path.clone(),
    };

    crate::rf_log!(
        "download.ytdlp",
        log::Level::Warn,
        "{}",
        report.failure_line()
    );

    Ok(RuforgeCookieExport {
        _file: file,
        report,
    })
}
