use std::path::Path;
use std::sync::Arc;

use media_engine::{EngineError, EngineErrorCode, SpawnedProcess};
use media_engine::process::ProcessExit;

/// Streaming spawn for playlist listing and download jobs. Lines are forwarded as they arrive.
pub fn spawn_via_tokio(exe: &Path, args: &[String]) -> Result<SpawnedProcess, EngineError> {
    use crate::no_console::NoConsole;
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut child = tokio::process::Command::new(exe)
        .no_console()
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
    let child_job = child.id().and_then(crate::child_job::ChildJob::adopt);
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let (stdout_tx, stdout_rx) = tokio::sync::mpsc::channel(64);
    let (stderr_tx, stderr_rx) = tokio::sync::mpsc::channel(64);

    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if stdout_tx.send(format!("{line}\n").into_bytes()).await.is_err() {
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
            media_engine::progress::append_stderr_bounded(&mut log, line.as_bytes(), 32_768);
            drop(log);
            if stderr_tx.send(line.into_bytes()).await.is_err() {
                break;
            }
        }
    });

    let wait = tokio::spawn(async move {
        let _child_job = child_job;
        let code = child.wait().await.ok().and_then(|s| s.code());
        let stderr_tail = stderr_cap.lock().await.clone();
        ProcessExit { code, stderr_tail }
    });

    Ok(SpawnedProcess {
        pid,
        stdout_rx,
        stderr_rx,
        wait,
    })
}

/// yt-dlp forks ffmpeg (and a second interpreter in PyInstaller builds), so the whole tree dies.
pub fn kill_tree_pid(pid: u32) {
    if pid == 0 {
        return;
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
        let _ = std::process::Command::new("pkill")
            .args(["-KILL", "-P", &pid.to_string()])
            .output();
        let _ = std::process::Command::new("kill")
            .args(["-KILL", &pid.to_string()])
            .output();
    }
}
