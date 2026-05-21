use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const SB_API_BASE: &str = "https://sponsor.ajay.app";

fn resolve_info_json_path(parent: &Path, stem: &str) -> Option<PathBuf> {
    let primary = parent.join(format!("{}.info.json", stem));
    if primary.is_file() {
        return Some(primary);
    }
    let double_dot = parent.join(format!("{}..info.json", stem));
    if double_dot.is_file() {
        return Some(double_dot);
    }
    None
}

fn source_id_from_info(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    json["id"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
}

fn hash_prefix_4(video_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(video_id.as_bytes());
    let hex = format!("{:x}", hasher.finalize());
    hex.chars().take(4).collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SponsorBlockSegmentDto {
    pub segment: Vec<f64>,
    #[serde(rename = "UUID")]
    pub uuid: String,
    pub category: String,
    pub action_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub votes: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_duration: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SponsorBlockSidecarDto {
    pub video_id: String,
    pub fetched_at: String,
    pub api: String,
    pub segments: Vec<SponsorBlockSegmentDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureSponsorBlockResult {
    pub segments: Vec<SponsorBlockSegmentDto>,
    pub from_cache: bool,
}

#[derive(Debug, Deserialize)]
struct ApiVideoBlock {
    #[serde(rename = "videoID")]
    video_id: String,
    segments: Vec<ApiSegment>,
}

#[derive(Debug, Deserialize)]
struct ApiSegment {
    segment: Vec<f64>,
    #[serde(rename = "UUID")]
    uuid: String,
    category: String,
    #[serde(rename = "actionType")]
    action_type: String,
    #[serde(default)]
    locked: i64,
    #[serde(default)]
    votes: i64,
    #[serde(default, rename = "videoDuration")]
    video_duration: f64,
    #[serde(default)]
    description: String,
}

fn local_duration_secs(info_path: Option<&Path>, fallback: f64) -> f64 {
    if let Some(p) = info_path {
        if let Ok(content) = std::fs::read_to_string(p) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let d = json["duration"]
                    .as_f64()
                    .or_else(|| json["duration"].as_u64().map(|u| u as f64))
                    .or_else(|| json["duration"].as_i64().map(|i| i as f64));
                if let Some(d) = d {
                    if d.is_finite() && d > 0.0 {
                        return d;
                    }
                }
            }
        }
    }
    if fallback.is_finite() && fallback > 0.0 {
        fallback
    } else {
        0.0
    }
}

fn sidecar_is_stale(sidecar: &SponsorBlockSidecarDto, local_duration: f64) -> bool {
    if local_duration <= 0.0 {
        return false;
    }
    for s in &sidecar.segments {
        let vd = s.video_duration.unwrap_or(0.0);
        if vd > 0.0 {
            let diff = (local_duration - vd).abs() / vd;
            if diff > 0.05 {
                return true;
            }
        }
    }
    false
}

fn normalize_api_segment(s: ApiSegment) -> Option<SponsorBlockSegmentDto> {
    if s.segment.len() < 2 {
        return None;
    }
    let a = s.segment[0];
    let b = s.segment[1];
    if !a.is_finite() || !b.is_finite() {
        return None;
    }
    let action = s.action_type.trim().to_lowercase();
    if action == "full" || action == "mute" {
        return None;
    }
    Some(SponsorBlockSegmentDto {
        segment: vec![a, b],
        uuid: s.uuid,
        category: s.category,
        action_type: s.action_type,
        locked: Some(s.locked),
        votes: Some(s.votes),
        video_duration: if s.video_duration > 0.0 {
            Some(s.video_duration)
        } else {
            None
        },
        description: if s.description.trim().is_empty() {
            None
        } else {
            Some(s.description)
        },
    })
}

async fn fetch_segments_from_api(video_id: &str) -> Option<Vec<SponsorBlockSegmentDto>> {
    let prefix = hash_prefix_4(video_id);
    let url = format!("{SB_API_BASE}/api/skipSegments/{prefix}");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .ok()?;
    let resp = client.get(&url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let blocks: Vec<ApiVideoBlock> = resp.json().await.ok()?;
    let block = blocks.into_iter().find(|b| b.video_id == video_id)?;
    let mut out = Vec::new();
    for s in block.segments {
        if let Some(n) = normalize_api_segment(s) {
            out.push(n);
        }
    }
    Some(out)
}

fn read_sidecar(path: &Path) -> Option<SponsorBlockSidecarDto> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_sidecar(path: &Path, sidecar: &SponsorBlockSidecarDto) -> bool {
    let Some(json) = serde_json::to_string_pretty(sidecar).ok() else {
        return false;
    };
    std::fs::write(path, json).is_ok()
}

/// Load or fetch SponsorBlock segments for a library file. Failures are silent; returns cache when possible.
#[tauri::command]
pub async fn ensure_sponsorblock_segments(
    media_path: String,
    force: Option<bool>,
) -> EnsureSponsorBlockResult {
    let force = force.unwrap_or(false);
    let media = PathBuf::from(&media_path);
    let parent = match media.parent() {
        Some(p) => p,
        None => {
            return EnsureSponsorBlockResult {
                segments: vec![],
                from_cache: true,
            }
        }
    };
    let stem = match media.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s,
        None => {
            return EnsureSponsorBlockResult {
                segments: vec![],
                from_cache: true,
            }
        }
    };

    let info_path = resolve_info_json_path(parent, stem);
    let video_id = match info_path.as_ref().and_then(|p| source_id_from_info(p)) {
        Some(id) => id,
        None => {
            return EnsureSponsorBlockResult {
                segments: vec![],
                from_cache: true,
            }
        }
    };

    let sidecar_path = parent.join(format!("{stem}.sponsorblock.json"));
    let cached = read_sidecar(&sidecar_path);
    let local_dur = local_duration_secs(info_path.as_deref(), 0.0);

    let need_fetch = force
        || cached.is_none()
        || cached
            .as_ref()
            .map(|c| sidecar_is_stale(c, local_dur))
            .unwrap_or(false);

    if need_fetch {
        if let Some(segments) = fetch_segments_from_api(&video_id).await {
            let sidecar = SponsorBlockSidecarDto {
                video_id: video_id.clone(),
                fetched_at: iso_now(),
                api: "skipSegments-hash".to_string(),
                segments: segments.clone(),
            };
            let _ = write_sidecar(&sidecar_path, &sidecar);
            return EnsureSponsorBlockResult {
                segments,
                from_cache: false,
            };
        }
    }

    if let Some(c) = cached {
        return EnsureSponsorBlockResult {
            segments: c.segments,
            from_cache: true,
        };
    }

    EnsureSponsorBlockResult {
        segments: vec![],
        from_cache: true,
    }
}

fn iso_now() -> String {
    chrono::Utc::now().to_rfc3339()
}
