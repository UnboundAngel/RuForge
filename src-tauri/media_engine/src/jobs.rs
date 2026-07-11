use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use crate::error::{EngineError, EngineErrorCode};

enum ActiveSlot {
    Pending,
    Running(u32),
}

#[derive(Clone, Default)]
pub struct ActiveJobRegistry {
    active: Arc<Mutex<HashMap<String, ActiveSlot>>>,
    pub user_paused: Arc<Mutex<HashSet<String>>>,
    max_concurrent: usize,
}

impl ActiveJobRegistry {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            active: Arc::new(Mutex::new(HashMap::new())),
            user_paused: Arc::new(Mutex::new(HashSet::new())),
            max_concurrent: max_concurrent.max(1),
        }
    }

    pub fn has_active_downloads(&self) -> bool {
        self.active.lock().map(|g| !g.is_empty()).unwrap_or(false)
    }

    pub fn running_count(&self) -> usize {
        self.active
            .lock()
            .map(|g| {
                g.values()
                    .filter(|s| matches!(s, ActiveSlot::Running(_)))
                    .count()
            })
            .unwrap_or(0)
    }

    pub fn try_claim(&self, job_id: &str) -> Result<(), EngineError> {
        let mut guard = self.active.lock().map_err(|e| {
            EngineError::new(
                EngineErrorCode::InvalidRequest,
                format!("Active job lock poisoned: {e}"),
            )
        })?;
        if guard.contains_key(job_id) {
            return Err(EngineError::new(
                EngineErrorCode::InvalidRequest,
                format!("Job {job_id} is already running"),
            ));
        }
        let running = guard
            .values()
            .filter(|s| matches!(s, ActiveSlot::Running(_)))
            .count();
        if running >= self.max_concurrent {
            return Err(EngineError::new(
                EngineErrorCode::QueueFull,
                "Maximum concurrent downloads reached",
            ));
        }
        guard.insert(job_id.to_string(), ActiveSlot::Pending);
        Ok(())
    }

    pub fn release_claim_if_pending(&self, job_id: &str) {
        if let Ok(mut guard) = self.active.lock() {
            if matches!(guard.get(job_id), Some(ActiveSlot::Pending)) {
                guard.remove(job_id);
            }
        }
    }

    pub fn place_running(&self, job_id: &str, pid: u32) -> Result<Result<(), u32>, EngineError> {
        let mut guard = self.active.lock().map_err(|e| {
            EngineError::new(
                EngineErrorCode::InvalidRequest,
                format!("Active job lock poisoned: {e}"),
            )
        })?;
        match guard.remove(job_id) {
            Some(ActiveSlot::Pending) => {
                guard.insert(job_id.to_string(), ActiveSlot::Running(pid));
                Ok(Ok(()))
            }
            Some(ActiveSlot::Running(old)) => {
                guard.insert(job_id.to_string(), ActiveSlot::Running(old));
                Ok(Err(pid))
            }
            None => Ok(Err(pid)),
        }
    }

    pub fn remove_active(&self, job_id: &str) -> Option<u32> {
        let mut guard = self.active.lock().ok()?;
        match guard.remove(job_id) {
            Some(ActiveSlot::Running(pid)) => Some(pid),
            Some(ActiveSlot::Pending) => None,
            None => None,
        }
    }

    pub fn mark_paused(&self, job_id: &str) {
        if let Ok(mut guard) = self.user_paused.lock() {
            guard.insert(job_id.to_string());
        }
    }

    pub fn take_paused(&self, job_id: &str) -> bool {
        self.user_paused
            .lock()
            .ok()
            .is_some_and(|mut g| g.remove(job_id))
    }

    pub fn stop_all(&self) -> u32 {
        let entries: Vec<(String, ActiveSlot)> = self
            .active
            .lock()
            .map(|mut g| g.drain().collect())
            .unwrap_or_default();
        let mut stopped = 0u32;
        for (id, slot) in entries {
            self.mark_paused(&id);
            if let ActiveSlot::Running(_) = slot {
                stopped += 1;
            }
        }
        stopped
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claim_rejects_duplicate() {
        let reg = ActiveJobRegistry::new(1);
        reg.try_claim("a").unwrap();
        assert!(reg.try_claim("a").is_err());
    }
}
