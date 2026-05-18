use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, MutexGuard};

use tauri_plugin_shell::process::CommandChild;

fn lock_active<'a>(
    mutex: &'a Mutex<HashMap<String, ActiveSlot>>,
) -> Result<MutexGuard<'a, HashMap<String, ActiveSlot>>, String> {
    mutex
        .lock()
        .map_err(|e| format!("Download job activity lock poisoned: {}", e))
}

fn lock_paused<'a>(mutex: &'a Mutex<HashSet<String>>) -> Result<MutexGuard<'a, HashSet<String>>, String> {
    mutex
        .lock()
        .map_err(|e| format!("Download job pause lock poisoned: {}", e))
}

enum ActiveSlot {
    /// Reserved between atomic claim and successful `yt-dlp` spawn attach.
    Pending,
    Running(CommandChild),
}

#[derive(Clone, Default)]
pub struct DownloadJobManager {
    active: Arc<Mutex<HashMap<String, ActiveSlot>>>,
    pub user_paused: Arc<Mutex<HashSet<String>>>,
}

impl DownloadJobManager {
    pub fn mark_paused(&self, job_id: &str) -> Result<(), String> {
        lock_paused(&self.user_paused)?.insert(job_id.to_string());
        Ok(())
    }

    pub fn take_paused(&self, job_id: &str) -> Result<bool, String> {
        Ok(lock_paused(&self.user_paused)?.remove(job_id))
    }

    /// True while any job is starting or a `yt-dlp` child is tracked (used to gate yt-dlp self-update).
    pub fn has_active_downloads(&self) -> Result<bool, String> {
        Ok(!lock_active(&self.active)?.is_empty())
    }

    /// Atomically reserve `job_id` or fail if it is already starting/running.
    pub fn try_claim_active_job(&self, job_id: &str) -> Result<(), String> {
        use std::collections::hash_map::Entry;
        let mut guard = lock_active(&self.active)?;
        match guard.entry(job_id.to_string()) {
            Entry::Vacant(v) => {
                v.insert(ActiveSlot::Pending);
                Ok(())
            }
            Entry::Occupied(_) => Err(format!("Job {} is already running", job_id)),
        }
    }

    /// Drop a `Pending` reservation (e.g. setup failed before spawn). No-op if absent or already running.
    pub fn release_claim_if_pending(&self, job_id: &str) -> Result<(), String> {
        let mut guard = lock_active(&self.active)?;
        if matches!(guard.get(job_id), Some(ActiveSlot::Pending)) {
            guard.remove(job_id);
        }
        Ok(())
    }

    /// Upgrade `Pending` → `Running`. If the claim was cleared (e.g. pause), returns `Ok(Err(child))` to kill.
    /// Lock poisoning returns `Err(message)` after killing `child` (claim was never attached).
    pub fn place_running_child(
        &self,
        job_id: &str,
        child: CommandChild,
    ) -> Result<Result<(), CommandChild>, String> {
        let mut guard = match lock_active(&self.active) {
            Ok(g) => g,
            Err(e) => {
                kill_ytdlp_tree(child);
                return Err(e);
            }
        };
        match guard.remove(job_id) {
            Some(ActiveSlot::Pending) => {
                guard.insert(job_id.to_string(), ActiveSlot::Running(child));
                Ok(Ok(()))
            }
            Some(ActiveSlot::Running(old)) => {
                guard.insert(job_id.to_string(), ActiveSlot::Running(old));
                Ok(Err(child))
            }
            None => Ok(Err(child)),
        }
    }

    pub fn remove_active(&self, job_id: &str) -> Result<Option<CommandChild>, String> {
        let mut guard = lock_active(&self.active)?;
        let Some(slot) = guard.remove(job_id) else {
            return Ok(None);
        };
        Ok(match slot {
            ActiveSlot::Running(c) => Some(c),
            ActiveSlot::Pending => None,
        })
    }

    /// Kill every in-flight yt-dlp child (e.g. after a webview reload left the UI on "paused").
    /// Marks each job paused first so termination handlers emit `download-job-paused`, not failure.
    pub fn stop_all_active_downloads(&self) -> Result<u32, String> {
        let mut guard = lock_active(&self.active)?;
        let entries: Vec<(String, ActiveSlot)> = guard.drain().collect();
        drop(guard);
        let mut stopped = 0u32;
        for (id, slot) in entries {
            let _ = self.mark_paused(&id);
            if let ActiveSlot::Running(child) = slot {
                kill_ytdlp_tree(child);
                stopped += 1;
            }
        }
        Ok(stopped)
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
