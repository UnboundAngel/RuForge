use std::sync::Arc;

use serde_json::Value;

use crate::error::{classify_ytdlp_stderr, EngineError, EngineErrorCode};
use crate::events::{EngineEvent, EventSink, JobStore, MemoryJobStore};
use crate::inspection::InspectionStore;
use crate::jobs::ActiveJobRegistry;
use crate::process::{ProcessLauncher, RuntimeProvider, StdProcessLauncher};
use crate::progress::ProgressTracker;
use crate::rate_limit::{
    register_rate_limit_from_stderr, stderr_is_missing_js_runtime, subprocess_rate_gate_wait,
    JS_RUNTIME_MISSING_PREFIX,
};
use crate::types::{
    DownloadJob, DownloadRequest, DownloadStatus, InspectRequest, InspectionResult,
    RuntimeVersions, ValidatedDownloadChoices,
};
use crate::url::{validate_audio_format, validate_format_selector, validate_http_url, validate_output_dir};
use crate::ytdlp_args::{
    build_download_args, build_inspect_args, destination_summary, effective_filename_template,
    validate_choices_against_inspection, DownloadPaths,
};
use crate::ytdlp_json::{
    dual_file_sizes_from_ytdlp_json, effective_video_format_for_probe,
    media_inspection_from_json, AUDIO_SIMULATE_FORMAT, DEFAULT_VIDEO_FORMAT,
};

pub struct MediaEngineConfig {
    pub max_concurrent_downloads: usize,
    pub inspection_ttl_secs: i64,
}

impl Default for MediaEngineConfig {
    fn default() -> Self {
        Self {
            max_concurrent_downloads: 1,
            inspection_ttl_secs: crate::inspection::DEFAULT_INSPECTION_TTL_SECS,
        }
    }
}

pub struct MediaEngine {
    runtime: Arc<dyn RuntimeProvider>,
    launcher: Arc<dyn ProcessLauncher>,
    inspections: InspectionStore,
    registry: ActiveJobRegistry,
    jobs: Arc<dyn JobStore>,
    events: Arc<dyn EventSink>,
}

impl MediaEngine {
    pub fn new(
        config: MediaEngineConfig,
        runtime: Arc<dyn RuntimeProvider>,
        launcher: Arc<dyn ProcessLauncher>,
        events: Arc<dyn EventSink>,
        jobs: Arc<dyn JobStore>,
    ) -> Self {
        let inspections = InspectionStore::new(config.inspection_ttl_secs);
        let registry = ActiveJobRegistry::new(config.max_concurrent_downloads);
        Self {
            runtime,
            launcher,
            inspections,
            registry,
            jobs,
            events,
        }
    }

    pub fn with_defaults(runtime: Arc<dyn RuntimeProvider>, events: Arc<dyn EventSink>) -> Self {
        Self::new(
            MediaEngineConfig::default(),
            runtime,
            Arc::new(StdProcessLauncher),
            events,
            Arc::new(MemoryJobStore::default()),
        )
    }

    pub fn on_startup(&self) {
        self.jobs.mark_interrupted_active_jobs();
    }

    pub fn registry(&self) -> &ActiveJobRegistry {
        &self.registry
    }

    pub fn job_store(&self) -> Arc<dyn JobStore> {
        self.jobs.clone()
    }

    pub async fn inspect(&self, request: InspectRequest) -> Result<InspectionResult, EngineError> {
        let url = validate_http_url(&request.url)?;
        let video_fmt = effective_video_format_for_probe(request.video_format.as_deref());
        let runtime = self.runtime.snapshot()?;
        if !runtime.ytdlp_available {
            return Err(EngineError::new(
                EngineErrorCode::RuntimeMissing,
                "yt-dlp runtime is not available",
            ));
        }
        let ytdlp = std::path::PathBuf::from(&runtime.ytdlp_path);

        if request.display_only {
            let args = build_inspect_args(&url, None, request.auth.as_ref());
            let json = self.run_simulate(&ytdlp, &args).await?;
            let mut inspection = media_inspection_from_json(json, &video_fmt, request.audio_only, None, None);
            inspection.file_size_bytes_audio = None;
            inspection.file_size_bytes_video = None;
            inspection.file_size_bytes = None;
            let (id, expires_at_secs) = self.inspections.insert(
                url,
                inspection.clone(),
                Value::Null,
                request.auth.clone(),
            );
            return Ok(InspectionResult {
                inspection_id: id,
                inspection,
                expires_at_secs,
                runtime_versions: runtime_versions_from_snapshot(&runtime),
                metadata_probe: Some(Value::Null),
            });
        }

        let (json_video_res, json_audio_res) = tokio::join!(
            self.simulate_with_fallback(&url, request.auth.as_ref(), Some(video_fmt.as_str())),
            self.simulate_with_fallback(&url, request.auth.as_ref(), Some(AUDIO_SIMULATE_FORMAT)),
        );

        let json_video = json_video_res.as_ref().ok();
        let json_audio = json_audio_res.as_ref().ok();
        if json_video.is_none() && json_audio.is_none() {
            let msg = match (&json_video_res, &json_audio_res) {
                (Err(v), Err(a)) => format!("Metadata fetch failed (video: {v}; audio: {a})"),
                (Err(e), Ok(_)) => e.message.clone(),
                (Ok(_), Err(e)) => e.message.clone(),
                (Ok(_), Ok(_)) => "Metadata fetch failed".into(),
            };
            return Err(EngineError::new(EngineErrorCode::RuntimeExecutionFailed, msg));
        }

        let base_json = json_video
            .or(json_audio)
            .expect("at least one simulate succeeded")
            .clone();
        let (_, file_size_bytes_video) = json_video
            .map(|j| dual_file_sizes_from_ytdlp_json(j, Some(video_fmt.as_str()), false))
            .unwrap_or((None, None));
        let (file_size_bytes_audio, _) = json_audio
            .map(|j| dual_file_sizes_from_ytdlp_json(j, None, true))
            .unwrap_or((None, None));

        let inspection = media_inspection_from_json(
            base_json.clone(),
            &video_fmt,
            request.audio_only,
            file_size_bytes_audio,
            file_size_bytes_video,
        );

        let (id, expires_at_secs) = self.inspections.insert(
            request.url.clone(),
            inspection.clone(),
            base_json.clone(),
            request.auth.clone(),
        );

        Ok(InspectionResult {
            inspection_id: id,
            inspection,
            expires_at_secs,
            runtime_versions: runtime_versions_from_snapshot(&runtime),
            metadata_probe: Some(base_json),
        })
    }

    pub async fn start_download(
        &self,
        job_id: String,
        request: DownloadRequest,
    ) -> Result<DownloadJob, EngineError> {
        self.registry.try_claim(&job_id)?;

        let record = match self.inspections.get(&request.inspection_id) {
            Ok(r) => r,
            Err(e) => {
                self.registry.release_claim_if_pending(&job_id);
                return Err(e);
            }
        };

        if record.url != request.url {
            self.registry.release_claim_if_pending(&job_id);
            return Err(EngineError::new(
                EngineErrorCode::InvalidRequest,
                "Download URL does not match inspection",
            ));
        }

        let output_dir = match validate_output_dir(&request.output_dir) {
            Ok(p) => p,
            Err(e) => {
                self.registry.release_claim_if_pending(&job_id);
                return Err(e);
            }
        };

        if let Err(e) = validate_choices_against_inspection(
            &request.choices,
            &record.inspection.choices.allowed_video_formats,
            &record.inspection.choices.allowed_audio_formats,
        ) {
            self.registry.release_claim_if_pending(&job_id);
            return Err(e);
        }

        if let Err(e) = std::fs::create_dir_all(&output_dir) {
            self.registry.release_claim_if_pending(&job_id);
            return Err(EngineError::new(
                EngineErrorCode::PermissionDenied,
                format!("Failed to create output directory \"{output_dir}\": {e}"),
            ));
        }

        let paths = DownloadPaths {
            output_dir: output_dir.clone(),
            filename_template: request.filename_template.clone(),
            playlist_output_folder: request.playlist_output_folder.clone(),
            playlist_index: request.playlist_index,
        };
        let filename_template_eff =
            effective_filename_template(&record.probe_json, &request.filename_template, &request.choices, &paths);

        let runtime = self.runtime.snapshot()?;
        let ytdlp = std::path::PathBuf::from(&runtime.ytdlp_path);
        let deno = runtime.deno_path.as_deref().map(std::path::Path::new);

        let args = match build_download_args(
            &request.url,
            &request.choices,
            &output_dir,
            &filename_template_eff,
            request.resume,
            request.auth.as_ref().or(record.auth.as_ref()),
            deno,
        ) {
            Ok(a) => a,
            Err(e) => {
                self.registry.release_claim_if_pending(&job_id);
                return Err(e);
            }
        };

        let spawned = match self.launcher.spawn(&ytdlp, &args).await {
            Ok(s) => s,
            Err(e) => {
                self.registry.release_claim_if_pending(&job_id);
                return Err(e);
            }
        };

        match self.registry.place_running(&job_id, spawned.pid) {
            Ok(Ok(())) => {}
            Ok(Err(pid)) => {
                let _ = self.launcher.kill_tree(pid).await;
                return Err(EngineError::new(
                    EngineErrorCode::Cancelled,
                    "Download job was cancelled before yt-dlp could start",
                ));
            }
            Err(e) => {
                let _ = self.launcher.kill_tree(spawned.pid).await;
                return Err(e);
            }
        }

        let job = DownloadJob {
            job_id: job_id.clone(),
            url: request.url.clone(),
            status: DownloadStatus::Queued,
            choices: request.choices.clone(),
            output_dir: output_dir.clone(),
            filename_template: request.filename_template.clone(),
            destination_summary: destination_summary(&output_dir, &filename_template_eff),
            runtime_versions: runtime_versions_from_snapshot(&runtime),
            error_code: None,
            error_message: None,
            output_path: None,
        };
        self.jobs.save_job(&job);
        self.jobs.update_status(&job_id, DownloadStatus::Downloading);

        let _launcher = self.launcher.clone();
        let registry = self.registry.clone();
        let jobs = self.jobs.clone();
        let events = self.events.clone();
        let url = request.url.clone();

        tokio::spawn(async move {
            let mut tracker = ProgressTracker::default();
            let mut stderr_log = String::new();
            let mut stdout_rx = spawned.stdout_rx;
            let mut stderr_rx = spawned.stderr_rx;

            loop {
                tokio::select! {
                    line = stdout_rx.recv() => {
                        match line {
                            Some(bytes) => {
                                let line = String::from_utf8_lossy(&bytes);
                                if let Some(mut progress) = tracker.handle_stdout_line(&line) {
                                    progress.job_id = job_id.clone();
                                    jobs.update_status(&job_id, progress.status);
                                    events.emit(EngineEvent::Progress(progress));
                                }
                            }
                            None => break,
                        }
                    }
                    line = stderr_rx.recv() => {
                        if let Some(bytes) = line {
                            crate::progress::append_stderr_bounded(&mut stderr_log, &bytes, ProgressTracker::STDERR_MAX_BYTES);
                        }
                    }
                    else => break,
                }
            }

            let exit = spawned.wait.await.unwrap_or(crate::process::ProcessExit {
                code: None,
                stderr_tail: stderr_log.clone(),
            });
            if stderr_log.is_empty() {
                stderr_log = exit.stderr_tail;
            }

            let _ = registry.remove_active(&job_id);
            if registry.take_paused(&job_id) {
                jobs.update_status(&job_id, DownloadStatus::Cancelled);
                events.emit(EngineEvent::JobPaused { job_id });
                return;
            }

            if exit.code == Some(0) {
                jobs.update_status(&job_id, DownloadStatus::Completed);
                events.emit(EngineEvent::JobFinished {
                    job_id,
                    success: true,
                    error: None,
                    output_path: None,
                });
                return;
            }

            register_rate_limit_from_stderr(&stderr_log).await;
            let mut err = classify_ytdlp_stderr(&stderr_log, exit.code);
            if stderr_is_missing_js_runtime(&stderr_log) {
                err.message = format!(
                    "{JS_RUNTIME_MISSING_PREFIX}Download failed: no JavaScript runtime installed."
                );
            }
            jobs.update_status(&job_id, DownloadStatus::Failed);
            events.emit(EngineEvent::JobFinished {
                job_id,
                success: false,
                error: Some(err.message.clone()),
                output_path: None,
            });
            let _ = url;
        });

        Ok(job)
    }

    pub async fn cancel_job(&self, job_id: &str) -> Result<(), EngineError> {
        self.registry.mark_paused(job_id);
        if let Some(pid) = self.registry.remove_active(job_id) {
            self.launcher.kill_tree(pid).await?;
        }
        self.jobs.update_status(job_id, DownloadStatus::Cancelled);
        Ok(())
    }

    pub fn get_job(&self, job_id: &str) -> Option<DownloadJob> {
        self.jobs.load_job(job_id)
    }

    pub async fn runtime_status(&self) -> Result<crate::types::RuntimeSnapshot, EngineError> {
        self.runtime.snapshot()
    }

    async fn simulate_with_fallback(
        &self,
        url: &str,
        auth: Option<&crate::types::AuthConfig>,
        format: Option<&str>,
    ) -> Result<Value, EngineError> {
        let args = build_inspect_args(url, format, None);
        let ytdlp = self.runtime.ytdlp_path()?;
        match self.run_simulate(&ytdlp, &args).await {
            Ok(json) => Ok(json),
            Err(without_err) => {
                let Some(auth_cfg) = auth.filter(|a| has_auth(a)) else {
                    return Err(without_err);
                };
                let args = build_inspect_args(url, format, Some(auth_cfg));
                self.run_simulate(&ytdlp, &args).await
            }
        }
    }

    async fn run_simulate(&self, ytdlp: &std::path::Path, args: &[String]) -> Result<Value, EngineError> {
        subprocess_rate_gate_wait().await?;
        let output = self.launcher.output(ytdlp, args).await?;
        if output.status_code != Some(0) {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            register_rate_limit_from_stderr(&stderr).await;
            return Err(classify_ytdlp_stderr(&stderr, output.status_code));
        }
        serde_json::from_slice(&output.stdout).map_err(|e| {
            EngineError::new(
                EngineErrorCode::RuntimeExecutionFailed,
                format!("Failed to parse yt-dlp JSON: {e}"),
            )
        })
    }
}

fn has_auth(auth: &crate::types::AuthConfig) -> bool {
    auth.cookie_file.as_deref().is_some_and(|s| !s.is_empty())
        || auth
            .browser_label
            .as_deref()
            .is_some_and(|s| !s.is_empty() && s != "chrome")
}

fn runtime_versions_from_snapshot(snapshot: &crate::types::RuntimeSnapshot) -> RuntimeVersions {
    RuntimeVersions {
        ytdlp: snapshot.ytdlp_version.clone(),
        ffmpeg: None,
        deno: snapshot.deno_path.clone(),
    }
}

pub fn validated_choices_from_options(
    video_format: &str,
    audio_only: bool,
    audio_format: &str,
    sub_langs: &str,
) -> Result<ValidatedDownloadChoices, EngineError> {
    Ok(ValidatedDownloadChoices {
        video_format: if audio_only {
            DEFAULT_VIDEO_FORMAT.to_string()
        } else {
            validate_format_selector(video_format)?
        },
        audio_only,
        audio_format: validate_audio_format(audio_format)?,
        sub_langs: sub_langs.trim().to_string(),
    })
}
