use std::sync::{Arc, Mutex};

use crate::types::{DownloadJob, DownloadProgress};

#[derive(Debug, Clone)]
pub enum EngineEvent {
    Progress(DownloadProgress),
    JobFinished {
        job_id: String,
        success: bool,
        error: Option<String>,
        output_path: Option<String>,
    },
    JobPaused { job_id: String },
}

pub trait EventSink: Send + Sync {
    fn emit(&self, event: EngineEvent);
}

#[derive(Default, Clone)]
pub struct ChannelEventSink {
    inner: Arc<Mutex<Vec<EngineEvent>>>,
}

impl ChannelEventSink {
    pub fn drain(&self) -> Vec<EngineEvent> {
        self.inner.lock().map(|mut g| std::mem::take(&mut *g)).unwrap_or_default()
    }
}

impl EventSink for ChannelEventSink {
    fn emit(&self, event: EngineEvent) {
        if let Ok(mut g) = self.inner.lock() {
            if g.len() < 256 {
                g.push(event);
            }
        }
    }
}

pub trait JobStore: Send + Sync {
    fn save_job(&self, job: &DownloadJob);
    fn load_job(&self, job_id: &str) -> Option<DownloadJob>;
    fn update_status(&self, job_id: &str, status: crate::types::DownloadStatus);
    fn mark_interrupted_active_jobs(&self);
    fn list_jobs(&self) -> Vec<DownloadJob>;
}

#[derive(Default)]
pub struct MemoryJobStore {
    jobs: Mutex<std::collections::HashMap<String, DownloadJob>>,
}

impl JobStore for MemoryJobStore {
    fn save_job(&self, job: &DownloadJob) {
        if let Ok(mut g) = self.jobs.lock() {
            g.insert(job.job_id.clone(), job.clone());
        }
    }

    fn load_job(&self, job_id: &str) -> Option<DownloadJob> {
        self.jobs.lock().ok()?.get(job_id).cloned()
    }

    fn update_status(&self, job_id: &str, status: crate::types::DownloadStatus) {
        if let Ok(mut g) = self.jobs.lock() {
            if let Some(job) = g.get_mut(job_id) {
                job.status = status;
            }
        }
    }

    fn mark_interrupted_active_jobs(&self) {
        if let Ok(mut g) = self.jobs.lock() {
            for job in g.values_mut() {
                if matches!(
                    job.status,
                    crate::types::DownloadStatus::Downloading
                        | crate::types::DownloadStatus::PostProcessing
                        | crate::types::DownloadStatus::Queued
                ) {
                    job.status = crate::types::DownloadStatus::Interrupted;
                }
            }
        }
    }

    fn list_jobs(&self) -> Vec<DownloadJob> {
        self.jobs
            .lock()
            .map(|g| g.values().cloned().collect())
            .unwrap_or_default()
    }
}
