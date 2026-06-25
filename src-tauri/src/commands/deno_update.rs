use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::deno_binary::{
    is_userdata_deno_active, upstream_asset_zip_name, userdata_deno_filename, userdata_deno_path,
};

const DENO_REPO_LATEST_RELEASE: &str =
    "https://api.github.com/repos/denoland/deno/releases/latest";

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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DenoStatus {
    pub present: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DenoDownloadProgress {
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DenoDownloadResult {
    pub version: String,
}

fn validate_trusted_deno_url(url: &str, tag: &str) -> Result<(), String> {
    let expected = format!(
        "https://github.com/denoland/deno/releases/download/{}/",
        tag
    );
    if url.starts_with(&expected)
        && url.starts_with("https://github.com/denoland/deno/releases/download/")
    {
        Ok(())
    } else {
        Err("Refusing untrusted Deno download URL".into())
    }
}

fn userdata_deno_bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("bin"))
}

async fn read_deno_version(path: &Path) -> Option<String> {
    let out = tokio::process::Command::new(path)
        .args(["--version"])
        .output()
        .await
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    // Deno prints: "deno x.y.z (release, <target>)\n..."
    let first_line = text.lines().next().unwrap_or("").trim().to_string();
    if first_line.is_empty() {
        None
    } else {
        Some(first_line)
    }
}

#[tauri::command]
pub async fn get_deno_status(app: AppHandle) -> Result<DenoStatus, String> {
    if !is_userdata_deno_active(&app) {
        return Ok(DenoStatus {
            present: false,
            path: None,
            version: None,
        });
    }
    let path = userdata_deno_path(&app)?;
    let version = read_deno_version(&path).await;
    Ok(DenoStatus {
        present: true,
        path: Some(path.to_string_lossy().into_owned()),
        version,
    })
}

#[tauri::command]
pub async fn download_deno(app: AppHandle) -> Result<DenoDownloadResult, String> {
    let _ = app.emit(
        "deno-download-progress",
        DenoDownloadProgress {
            phase: "downloading".into(),
            percent: None,
        },
    );

    let client = reqwest::Client::builder()
        .user_agent(format!(
            "{}/{} (RuForge Deno download)",
            app.package_info().name,
            app.package_info().version,
        ))
        .build()
        .map_err(|e| e.to_string())?;

    // Resolve the latest release.
    let release_resp = client
        .get(DENO_REPO_LATEST_RELEASE)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Deno release info: {}", e))?;

    if !release_resp.status().is_success() {
        return Err(format!("Deno release API HTTP {}", release_resp.status()));
    }

    let rel: GithubReleaseLatest = release_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Deno release JSON: {}", e))?;

    let want_zip = upstream_asset_zip_name();
    let asset = rel
        .assets
        .iter()
        .find(|a| a.name == want_zip)
        .ok_or_else(|| format!("Deno release missing asset `{}`", want_zip))?;

    validate_trusted_deno_url(&asset.browser_download_url, &rel.tag_name)?;

    let bin_dir = userdata_deno_bin_dir(&app)?;
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    let zip_part = bin_dir.join("deno-download.part.zip");
    if zip_part.exists() {
        std::fs::remove_file(&zip_part).map_err(|e| e.to_string())?;
    }

    // Download the zip.
    let dl_resp = client
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|e| format!("Deno download request failed: {}", e))?;

    if !dl_resp.status().is_success() {
        return Err(format!("Deno download HTTP {}", dl_resp.status()));
    }

    let total_size = dl_resp.content_length();
    let mut stream = dl_resp.bytes_stream();
    let mut zip_file =
        std::fs::File::create(&zip_part).map_err(|e| format!("Create Deno zip temp: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut last_bucket: Option<u32> = None;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Deno download stream: {}", e))?;
        zip_file
            .write_all(&chunk)
            .map_err(|e| format!("Writing Deno zip: {}", e))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);

        if let Some(total) = total_size {
            if total > 0 {
                // Scale the download phase to 0-85% so extracting/verifying fit after.
                let pct_raw = (downloaded as f64 / total as f64) * 85.0;
                let bucket = (pct_raw.floor() as u32) / 5;
                if Some(bucket) != last_bucket {
                    last_bucket = Some(bucket);
                    let _ = app.emit(
                        "deno-download-progress",
                        DenoDownloadProgress {
                            phase: "downloading".into(),
                            percent: Some(pct_raw.min(85.0) as f32),
                        },
                    );
                }
            }
        }
    }
    drop(zip_file);

    // Extracting phase.
    let _ = app.emit(
        "deno-download-progress",
        DenoDownloadProgress {
            phase: "extracting".into(),
            percent: Some(85.0),
        },
    );

    let final_path = userdata_deno_path(&app)?;
    let exe_part = final_path.with_extension("download.part");
    if exe_part.exists() {
        std::fs::remove_file(&exe_part).map_err(|e| e.to_string())?;
    }

    let want_exe = userdata_deno_filename().to_owned();
    let zip_part_clone = zip_part.clone();
    let exe_part_clone = exe_part.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let zip_file =
            std::fs::File::open(&zip_part_clone).map_err(|e| format!("Open Deno zip: {}", e))?;
        let mut archive =
            zip::ZipArchive::new(zip_file).map_err(|e| format!("Read Deno zip: {}", e))?;

        let mut entry = archive
            .by_name(&want_exe)
            .map_err(|_| format!("Deno zip does not contain `{}`", want_exe))?;

        let mut out =
            std::fs::File::create(&exe_part_clone).map_err(|e| format!("Create Deno exe: {}", e))?;

        let mut buf = [0u8; 65536];
        loop {
            let n = entry.read(&mut buf).map_err(|e| format!("Read Deno zip entry: {}", e))?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n]).map_err(|e| format!("Write Deno exe: {}", e))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Deno extraction task: {}", e))??;

    // Delete the temp zip.
    let _ = std::fs::remove_file(&zip_part);

    // Verify the extracted binary.
    let _ = app.emit(
        "deno-download-progress",
        DenoDownloadProgress {
            phase: "verifying".into(),
            percent: Some(92.0),
        },
    );

    let version = read_deno_version(&exe_part)
        .await
        .ok_or_else(|| "Downloaded Deno binary failed `deno --version`; discarding.".to_string())?;

    // Atomic rename.
    if final_path.exists() {
        std::fs::remove_file(&final_path).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&exe_part, &final_path).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::fs::Permissions;
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&final_path, Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }

    let _ = app.emit(
        "deno-download-progress",
        DenoDownloadProgress {
            phase: "done".into(),
            percent: Some(100.0),
        },
    );

    crate::rf_log!(
        "download.binary",
        log::Level::Info,
        "Deno installed: {} at {}",
        version,
        final_path.display()
    );

    Ok(DenoDownloadResult { version })
}
