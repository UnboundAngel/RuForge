//! Live CookieManager export for RuForge Internal (`browserContext: "ruforge"`).
//!
//! Reads cookies from embedded webviews sharing the `explorer-data` profile and writes a
//! Netscape cookies.txt for yt-dlp `--cookies`. Must run `cookies_for_url` inside
//! `spawn_blocking` (WebView2 deadlock on sync commands).

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

use cookie::Cookie;
use netscape_cookies::{cookie_dedupe_key, write_netscape_cookies};
use tauri::{AppHandle, Manager, Url};
use tempfile::NamedTempFile;

const YOUTUBE_URL: &str = "https://www.youtube.com";
const MUSIC_YOUTUBE_URL: &str = "https://music.youtube.com";
const MUSIC_EXPLORE_LABEL: &str = "music-explore-view";

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

    let raw_cookie_count = cookies.len();
    let mut seen = HashSet::new();
    cookies.retain(|c| seen.insert(cookie_dedupe_key(c)));

    Ok((cookies, probes, missing_labels, raw_cookie_count))
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
    format!(
        "No YouTube session cookies found in RuForge Internal browser (0 cookies exported). \
         Open Explorer or Music Explore, sign in to YouTube, then try again. \
         webviews mounted: [{mounted_text}]; not mounted: [{missing_text}]"
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

pub async fn export_ruforge_cookies_for_ytdlp(
    app: &AppHandle,
) -> Result<RuforgeCookieExport, String> {
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
