use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;

use crate::error::{classify_ytdlp_stderr, EngineError, EngineErrorCode};
use crate::types::RuntimeSnapshot;

#[derive(Debug, Clone)]
pub struct ProcessOutput {
    pub status_code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

#[derive(Debug)]
pub struct SpawnedProcess {
    pub pid: u32,
    pub stdout_rx: tokio::sync::mpsc::Receiver<Vec<u8>>,
    pub stderr_rx: tokio::sync::mpsc::Receiver<Vec<u8>>,
    pub wait: tokio::task::JoinHandle<ProcessExit>,
}

#[derive(Debug, Clone)]
pub struct ProcessExit {
    pub code: Option<i32>,
    pub stderr_tail: String,
}

#[async_trait]
pub trait ProcessLauncher: Send + Sync {
    async fn output(&self, exe: &Path, args: &[String]) -> Result<ProcessOutput, EngineError>;
    async fn spawn(&self, exe: &Path, args: &[String]) -> Result<SpawnedProcess, EngineError>;
    async fn kill_tree(&self, pid: u32) -> Result<(), EngineError>;
}

pub struct StdProcessLauncher;

#[async_trait]
impl ProcessLauncher for StdProcessLauncher {
    async fn output(&self, exe: &Path, args: &[String]) -> Result<ProcessOutput, EngineError> {
        validate_executable(exe)?;
        let output = tokio::process::Command::new(exe)
            .args(args)
            .output()
            .await
            .map_err(|e| {
                EngineError::new(
                    EngineErrorCode::ProcessLaunchFailure,
                    format!("Failed to launch {}: {}", exe.display(), e),
                )
            })?;
        Ok(ProcessOutput {
            status_code: output.status.code(),
            stdout: output.stdout,
            stderr: output.stderr,
        })
    }

    async fn spawn(&self, exe: &Path, args: &[String]) -> Result<SpawnedProcess, EngineError> {
        validate_executable(exe)?;
        use tokio::io::{AsyncBufReadExt, BufReader};
        use tokio::process::Command;

        let mut child = Command::new(exe)
            .args(args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| {
                EngineError::new(
                    EngineErrorCode::ProcessLaunchFailure,
                    format!("Failed to spawn {}: {}", exe.display(), e),
                )
            })?;

        let pid = child.id().unwrap_or(0);
        let stdout = child.stdout.take().expect("stdout piped");
        let stderr = child.stderr.take().expect("stderr piped");

        let (stdout_tx, stdout_rx) = tokio::sync::mpsc::channel(64);
        let (stderr_tx, stderr_rx) = tokio::sync::mpsc::channel(64);

        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if stdout_tx
                    .send(format!("{line}\n").into_bytes())
                    .await
                    .is_err()
                {
                    break;
                }
            }
        });

        let stderr_cap = Arc::new(tokio::sync::Mutex::new(String::new()));
        let stderr_cap_bg = stderr_cap.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let mut log = stderr_cap_bg.lock().await;
                crate::progress::append_stderr_bounded(&mut log, line.as_bytes(), 32_768);
                drop(log);
                if stderr_tx.send(line.into_bytes()).await.is_err() {
                    break;
                }
            }
        });

        let wait = tokio::spawn(async move {
            let status = child.wait().await.ok();
            let code = status.and_then(|s| s.code());
            let stderr_tail = stderr_cap.lock().await.clone();
            ProcessExit {
                code,
                stderr_tail,
            }
        });

        Ok(SpawnedProcess {
            pid,
            stdout_rx,
            stderr_rx,
            wait,
        })
    }

    async fn kill_tree(&self, pid: u32) -> Result<(), EngineError> {
        if pid == 0 {
            return Ok(());
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            let _ = std::process::Command::new("taskkill")
                .args(["/T", "/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .output();
        }
        Ok(())
    }
}

pub fn validate_executable(path: &Path) -> Result<(), EngineError> {
    if !path.is_file() {
        return Err(EngineError::new(
            EngineErrorCode::RuntimeMissing,
            format!("Executable not found: {}", path.display()),
        ));
    }
    let meta = std::fs::metadata(path).map_err(|e| {
        EngineError::new(
            EngineErrorCode::PermissionDenied,
            format!("Cannot read executable metadata: {}", e),
        )
    })?;
    if meta.len() == 0 {
        return Err(EngineError::new(
            EngineErrorCode::RuntimeIncompatible,
            format!("Executable is empty: {}", path.display()),
        ));
    }
    Ok(())
}

pub async fn query_runtime_version(
    launcher: &dyn ProcessLauncher,
    exe: &Path,
) -> Result<String, EngineError> {
    validate_executable(exe)?;
    let out = launcher.output(exe, &["--version".to_string()]).await?;
    if out.status_code != Some(0) {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(classify_ytdlp_stderr(&stderr, out.status_code));
    }
    let line = String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if line.is_empty() {
        return Err(EngineError::new(
            EngineErrorCode::RuntimeIncompatible,
            "Runtime returned empty version string",
        ));
    }
    Ok(line)
}

pub trait RuntimeProvider: Send + Sync {
    fn snapshot(&self) -> Result<RuntimeSnapshot, EngineError>;
    fn ytdlp_path(&self) -> Result<PathBuf, EngineError>;
    fn deno_path(&self) -> Option<PathBuf>;
    fn ffmpeg_path(&self) -> Option<PathBuf>;
    fn has_active_jobs(&self) -> bool;
}
