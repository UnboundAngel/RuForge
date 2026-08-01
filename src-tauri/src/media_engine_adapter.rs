use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use media_engine::{
    AuthConfig, EngineError, EngineErrorCode, EventSink, ProcessLauncher, ProcessOutput,
    RuntimeProvider, RuntimeSnapshot, SUBPROCESS_OUTPUT_TIMEOUT_SECS,
};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;

use crate::deno_binary::resolved_deno_path_if_present;
use crate::process_tree::kill_shell_child_tree;
use crate::ytdlp_binary::{userdata_ytdlp_path, ytdlp_shell_command};

pub struct RuForgeRuntimeProvider {
    app: AppHandle,
    active_jobs: Arc<dyn Fn() -> bool + Send + Sync>,
}

impl RuForgeRuntimeProvider {
    pub fn new(app: AppHandle, active_jobs: Arc<dyn Fn() -> bool + Send + Sync>) -> Self {
        Self { app, active_jobs }
    }
}

impl RuntimeProvider for RuForgeRuntimeProvider {
    fn snapshot(&self) -> Result<RuntimeSnapshot, EngineError> {
        let ytdlp_path = resolve_ytdlp_path(&self.app)?;
        let available = Path::new(&ytdlp_path).is_file()
            || self.app.shell().sidecar("yt-dlp").is_ok();
        let deno = resolved_deno_path_if_present(&self.app).map(|p| p.display().to_string());
        Ok(RuntimeSnapshot {
            ytdlp_path,
            ytdlp_available: available,
            ytdlp_version: None,
            deno_path: deno,
            ffmpeg_path: None,
        })
    }

    fn ytdlp_path(&self) -> Result<PathBuf, EngineError> {
        Ok(PathBuf::from(resolve_ytdlp_path(&self.app)?))
    }

    fn deno_path(&self) -> Option<PathBuf> {
        resolved_deno_path_if_present(&self.app)
    }

    fn ffmpeg_path(&self) -> Option<PathBuf> {
        None
    }

    fn has_active_jobs(&self) -> bool {
        (self.active_jobs)()
    }
}

fn resolve_ytdlp_path(app: &AppHandle) -> Result<String, EngineError> {
    if let Ok(user_path) = userdata_ytdlp_path(app) {
        if user_path.is_file() && user_path.metadata().map(|m| m.len() > 0).unwrap_or(false) {
            return Ok(user_path.display().to_string());
        }
    }
    app.shell()
        .sidecar("yt-dlp")
        .map_err(|e| {
            EngineError::new(
                EngineErrorCode::RuntimeMissing,
                format!("Bundled yt-dlp sidecar unavailable: {e}"),
            )
        })
        .map(|_| "yt-dlp-sidecar".to_string())
}

pub struct TauriProcessLauncher {
    app: AppHandle,
}

impl TauriProcessLauncher {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

#[async_trait]
impl ProcessLauncher for TauriProcessLauncher {
    async fn output(&self, _exe: &Path, args: &[String]) -> Result<ProcessOutput, EngineError> {
        use tauri_plugin_shell::process::CommandEvent;

        let shell = ytdlp_shell_command(&self.app)
            .map_err(|e| EngineError::new(EngineErrorCode::RuntimeMissing, e))?;
        let (mut rx, child) = shell.args(args.to_vec()).spawn().map_err(|e| {
            EngineError::new(
                EngineErrorCode::ProcessLaunchFailure,
                format!("Failed to run yt-dlp: {e}"),
            )
        })?;

        let collect = async {
            let mut stdout = Vec::new();
            let mut stderr = Vec::new();
            let mut status_code = None;
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => stdout.extend_from_slice(&bytes),
                    CommandEvent::Stderr(bytes) => stderr.extend_from_slice(&bytes),
                    CommandEvent::Terminated(payload) => {
                        status_code = payload.code;
                        break;
                    }
                    _ => {}
                }
            }
            (stdout, stderr, status_code)
        };

        match tokio::time::timeout(
            std::time::Duration::from_secs(SUBPROCESS_OUTPUT_TIMEOUT_SECS),
            collect,
        )
        .await
        {
            Ok((stdout, stderr, status_code)) => {
                drop(child);
                Ok(ProcessOutput {
                    status_code,
                    stdout,
                    stderr,
                })
            }
            Err(_) => {
                kill_shell_child_tree(child);
                Err(EngineError::new(
                    EngineErrorCode::RuntimeExecutionFailed,
                    format!("yt-dlp timed out after {SUBPROCESS_OUTPUT_TIMEOUT_SECS}s"),
                ))
            }
        }
    }

    async fn spawn(
        &self,
        _exe: &Path,
        _args: &[String],
    ) -> Result<media_engine::SpawnedProcess, EngineError> {
        Err(EngineError::new(
            EngineErrorCode::InvalidRequest,
            "RuForge uses Tauri shell spawn in downloader adapter",
        ))
    }

    async fn kill_tree(&self, _pid: u32) -> Result<(), EngineError> {
        Ok(())
    }
}

pub struct TauriEventSink {
    app: AppHandle,
}

impl TauriEventSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl EventSink for TauriEventSink {
    fn emit(&self, event: media_engine::EngineEvent) {
        use media_engine::EngineEvent;
        match event {
            EngineEvent::Progress(p) => {
                let _ = self.app.emit(
                    "download-progress",
                    ProgressPayload {
                        job_id: p.job_id,
                        percentage: p.percentage,
                        speed: p.speed,
                        eta: p.eta,
                        status: match p.status {
                            media_engine::DownloadStatus::PostProcessing => "processing".into(),
                            _ => "downloading".into(),
                        },
                        current_index: p.current_index,
                        total_items: p.total_items,
                        current_item_title: p.current_item_title,
                        downloaded_bytes: p.downloaded_bytes,
                        total_bytes: p.total_bytes,
                    },
                );
            }
            EngineEvent::JobFinished {
                job_id,
                success,
                error,
                output_path,
            } => {
                let _ = self.app.emit(
                    "download-job-finished",
                    DownloadJobFinishedPayload {
                        job_id,
                        url: String::new(),
                        success,
                        error,
                        output_path,
                    },
                );
            }
            EngineEvent::JobPaused { job_id } => {
                let _ = self.app.emit("download-job-paused", job_id);
            }
        }
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub job_id: String,
    pub percentage: f32,
    pub speed: String,
    pub eta: String,
    pub status: String,
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

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJobFinishedPayload {
    pub job_id: String,
    pub url: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
}

pub struct MediaEngineState {
    pub engine: media_engine::MediaEngine,
}

impl MediaEngineState {
    pub fn new(
        app: AppHandle,
        max_concurrent: usize,
        active_jobs: Arc<dyn Fn() -> bool + Send + Sync>,
    ) -> Self {
        let runtime = Arc::new(RuForgeRuntimeProvider::new(app.clone(), active_jobs));
        let events = Arc::new(TauriEventSink::new(app.clone()));
        let launcher = Arc::new(TauriProcessLauncher::new(app));
        let config = media_engine::MediaEngineConfig {
            max_concurrent_downloads: max_concurrent,
            ..Default::default()
        };
        let engine = media_engine::MediaEngine::new(
            config,
            runtime,
            launcher,
            events,
            Arc::new(media_engine::MemoryJobStore::default()),
        );
        engine.on_startup();
        Self { engine }
    }
}

pub fn auth_from_download_options(
    browser_cookies: Option<&str>,
    cookie_file: Option<&str>,
    browser_cookie_arg: Option<String>,
) -> Option<AuthConfig> {
    if let Some(file) = cookie_file.filter(|s| !s.is_empty()) {
        return Some(AuthConfig {
            cookie_file: Some(file.to_string()),
            browser_label: None,
        });
    }
    if let Some(browser) = browser_cookies.filter(|s| !s.is_empty() && *s != "chrome") {
        return Some(AuthConfig {
            cookie_file: None,
            browser_label: browser_cookie_arg.or_else(|| Some(browser.to_string())),
        });
    }
    None
}
