use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use tauri_plugin_shell::process::CommandChild;

#[derive(Clone, Default)]
pub struct DownloadJobManager {
    pub active: Arc<Mutex<HashMap<String, CommandChild>>>,
    pub user_paused: Arc<Mutex<HashSet<String>>>,
}

impl DownloadJobManager {
    pub fn mark_paused(&self, job_id: &str) {
        self.user_paused.lock().unwrap().insert(job_id.to_string());
    }

    pub fn take_paused(&self, job_id: &str) -> bool {
        self.user_paused.lock().unwrap().remove(job_id)
    }

    pub fn remove_active(&self, job_id: &str) -> Option<CommandChild> {
        self.active.lock().unwrap().remove(job_id)
    }

    pub fn insert_active(&self, job_id: String, child: CommandChild) {
        self.active.lock().unwrap().insert(job_id, child);
    }
}

/// Kill yt-dlp sidecar and any child processes (Windows process tree).
pub fn kill_ytdlp_tree(child: CommandChild) {
    let pid = child.pid();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    let _ = child.kill();
}
