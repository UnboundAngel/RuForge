use tauri::State;

use crate::media_engine_adapter::MediaEngineState;
use media_engine::{
    DownloadJob, DownloadRequest, DownloadStatus, InspectRequest, InspectionResult,
    RuntimeSnapshot, ValidatedDownloadChoices,
};

#[tauri::command]
pub async fn media_engine_inspect(
    state: State<'_, MediaEngineState>,
    request: InspectRequest,
) -> Result<InspectionResult, String> {
    state
        .engine
        .inspect(request)
        .await
        .map_err(|e| e.message)
}

#[tauri::command]
pub async fn media_engine_start_download(
    state: State<'_, MediaEngineState>,
    job_id: String,
    request: DownloadRequest,
) -> Result<DownloadJob, String> {
    state
        .engine
        .start_download(job_id, request)
        .await
        .map_err(|e| e.message)
}

#[tauri::command]
pub fn media_engine_get_job(
    state: State<'_, MediaEngineState>,
    job_id: String,
) -> Option<DownloadJob> {
    state.engine.get_job(&job_id)
}

#[tauri::command]
pub async fn media_engine_cancel_job(
    state: State<'_, MediaEngineState>,
    job_id: String,
) -> Result<(), String> {
    state
        .engine
        .cancel_job(&job_id)
        .await
        .map_err(|e| e.message)
}

#[tauri::command]
pub async fn media_engine_runtime_status(
    state: State<'_, MediaEngineState>,
) -> Result<RuntimeSnapshot, String> {
    state
        .engine
        .runtime_status()
        .await
        .map_err(|e| e.message)
}

#[tauri::command]
pub fn media_engine_list_jobs(state: State<'_, MediaEngineState>) -> Vec<DownloadJob> {
    state.engine.job_store().list_jobs()
}

pub fn download_status_label(status: DownloadStatus) -> &'static str {
    match status {
        DownloadStatus::Queued => "queued",
        DownloadStatus::Downloading => "downloading",
        DownloadStatus::PostProcessing => "processing",
        DownloadStatus::Completed => "completed",
        DownloadStatus::Failed => "failed",
        DownloadStatus::Cancelled => "cancelled",
        DownloadStatus::Interrupted => "interrupted",
    }
}

pub fn validated_choices(
    video_format: String,
    audio_only: bool,
    audio_format: String,
    sub_langs: String,
) -> Result<ValidatedDownloadChoices, String> {
    media_engine::validated_choices_from_options(
        &video_format,
        audio_only,
        &audio_format,
        &sub_langs,
    )
    .map_err(|e| e.message)
}
