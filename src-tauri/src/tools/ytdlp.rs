use serde::Deserialize;
use tauri::AppHandle;

use super::fetch::{self, Reporter};
use super::paths::{bin_dir, Tool};
use super::{hash, ERR_INTEGRITY};
use crate::ytdlp_binary::upstream_asset_basename;

const LATEST_RELEASE: &str = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
const SUMS_ASSET: &str = "SHA2-256SUMS";
/// Used for the overall progress weight and the status estimate before the real size is known.
pub const ESTIMATED_BYTES: u64 = 18 * 1024 * 1024;

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

fn trusted(url: &str, tag: &str) -> bool {
    url.starts_with(&format!("https://github.com/yt-dlp/yt-dlp/releases/download/{tag}/"))
}

pub async fn install(app: &AppHandle, reporter: &mut Reporter) -> Result<(), String> {
    let client = fetch::client(app)?;
    let rel: Release = fetch::get_json(&client, LATEST_RELEASE).await?;
    let find = |name: &str| {
        rel.assets
            .iter()
            .find(|a| a.name == name && trusted(&a.browser_download_url, &rel.tag_name))
            .map(|a| a.browser_download_url.clone())
            .ok_or_else(|| format!("Latest yt-dlp release is missing `{name}`."))
    };
    let asset_name = upstream_asset_basename();
    let bin_url = find(asset_name)?;
    let sums_url = find(SUMS_ASSET)?;

    let sums = fetch::get_text(&client, &sums_url).await?;
    let expected = hash::find_sum(&sums, asset_name)
        .ok_or_else(|| format!("No checksum published for `{asset_name}`."))?;

    let dir = bin_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let final_path = dir.join(Tool::YtDlp.data_file_name());
    let part = dir.join(format!("{}.part", Tool::YtDlp.data_file_name()));
    let _ = std::fs::remove_file(&part);

    let result = fetch_verify_install(&client, &bin_url, &expected, &part, &final_path, reporter).await;
    if result.is_err() {
        let _ = std::fs::remove_file(&part);
    }
    result?;
    crate::ytdlp_binary::set_bundled_wins(false);
    Ok(())
}

async fn fetch_verify_install(
    client: &reqwest::Client,
    url: &str,
    expected: &str,
    part: &std::path::Path,
    final_path: &std::path::Path,
    reporter: &mut Reporter,
) -> Result<(), String> {
    let (digest, received) =
        fetch::download(client, url, part, reporter, "yt-dlp", ESTIMATED_BYTES).await?;
    reporter.emit("verifying", Some("yt-dlp"), received, received, true);
    if digest != expected {
        return Err(ERR_INTEGRITY.to_string());
    }
    run_version_check(part).await?;
    crate::ytdlp_binary::swap_in_ytdlp(part, final_path)?;
    reporter.step_done(received);
    Ok(())
}

async fn run_version_check(path: &std::path::Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    use crate::no_console::NoConsole;
    let mut cmd = tokio::process::Command::new(path);
    cmd.no_console().arg("--version").kill_on_drop(true);
    let out = tokio::time::timeout(std::time::Duration::from_secs(30), cmd.output())
        .await
        .map_err(|_| "Downloaded yt-dlp did not start in time.".to_string())?
        .map_err(|e| format!("Downloaded yt-dlp could not start: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err("Downloaded yt-dlp failed its startup check.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::trusted;

    #[test]
    fn trusts_only_matching_release_path() {
        let ok = "https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.01/yt-dlp.exe";
        assert!(trusted(ok, "2026.10.01"));
        assert!(!trusted(ok, "2026.10.02"));
        assert!(!trusted("https://evil.example/yt-dlp/yt-dlp/releases/download/x/a", "x"));
    }
}
