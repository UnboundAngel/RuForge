use serde::{Deserialize, Serialize};

use crate::error::EngineErrorCode;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectRequest {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_format: Option<String>,
    #[serde(default)]
    pub audio_only: bool,
    #[serde(default)]
    pub display_only: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<AuthConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cookie_file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaChoice {
    pub video_format: String,
    pub audio_only: bool,
    pub audio_format: String,
    pub sub_langs: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInspection {
    pub title: String,
    pub thumbnail: String,
    pub duration: f64,
    pub formats: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes_audio: Option<u64>,
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
    pub choices: MediaChoiceSet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaChoiceSet {
    pub allowed_video_formats: Vec<String>,
    pub allowed_audio_formats: Vec<String>,
    pub default_video_format: String,
    pub default_audio_format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectionResult {
    pub inspection_id: String,
    pub inspection: MediaInspection,
    pub expires_at_secs: i64,
    pub runtime_versions: RuntimeVersions,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata_probe: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub inspection_id: String,
    pub url: String,
    pub output_dir: String,
    pub filename_template: String,
    pub choices: ValidatedDownloadChoices,
    #[serde(default)]
    pub resume: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<AuthConfig>,
    #[serde(default)]
    pub auto_scrub_previews: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlist_output_folder: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlist_index: Option<u32>,
    #[serde(default)]
    pub stamp_artist_tags: bool,
    #[serde(default)]
    pub download_comments: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidatedDownloadChoices {
    pub video_format: String,
    pub audio_only: bool,
    pub audio_format: String,
    pub sub_langs: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    PostProcessing,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJob {
    pub job_id: String,
    pub url: String,
    pub status: DownloadStatus,
    pub choices: ValidatedDownloadChoices,
    pub output_dir: String,
    pub filename_template: String,
    pub destination_summary: String,
    pub runtime_versions: RuntimeVersions,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<EngineErrorCode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub job_id: String,
    pub status: DownloadStatus,
    pub percentage: f32,
    pub speed: String,
    pub eta: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_items: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_item_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downloaded_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_bytes: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeVersions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ytdlp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ffmpeg: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deno: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    pub ytdlp_path: String,
    pub ytdlp_available: bool,
    pub ytdlp_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deno_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ffmpeg_path: Option<String>,
}
