use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

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

pub fn probe_ffprobe_cache_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
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

async fn run_ffprobe_json(app: &AppHandle, media_path: &str) -> Result<serde_json::Value, String> {
    let output = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| e.to_string())?
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
        .await
        .map_err(|e| format!("{}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let msg = err.trim();
        return Err(if msg.is_empty() {
            "ffprobe exited with error".into()
        } else {
            msg.to_string()
        });
    }
    serde_json::from_slice(&output.stdout).map_err(|e| format!("ffprobe JSON: {}", e))
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

async fn probe_ffprobe_async(app: AppHandle, media_path: String, force_refresh: bool) -> Result<FfprobeHint, String> {
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

    let val = match run_ffprobe_json(&app, &media_path).await {
        Ok(v) => v,
        Err(e) => {
            return Ok(FfprobeHint {
                ok: false,
                codecs_line: None,
                bitrate_kbps: None,
                format_name: None,
                error: Some(format!("{} (requires ffprobe sidecar bundle)", e)),
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
pub async fn probe_local_media_ffprobe(
    app: AppHandle,
    media_path: String,
    force_refresh: Option<bool>,
) -> Result<FfprobeHint, String> {
    let refresh = force_refresh == Some(true);
    probe_ffprobe_async(app, media_path, refresh).await
}
