use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;
use uuid::Uuid;

use crate::error::{EngineError, EngineErrorCode};
use crate::types::{AuthConfig, MediaInspection};

pub const DEFAULT_INSPECTION_TTL_SECS: i64 = 900;

pub struct InspectionRecord {
    pub id: String,
    pub url: String,
    pub inspection: MediaInspection,
    pub probe_json: Value,
    pub auth: Option<AuthConfig>,
    pub created_at: Instant,
    pub expires_at: Instant,
}

pub trait Clock: Send + Sync {
    fn now(&self) -> Instant;
}

#[derive(Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> Instant {
        Instant::now()
    }
}

pub struct InspectionStore {
    ttl: Duration,
    clock: Box<dyn Clock>,
    records: Mutex<HashMap<String, InspectionRecord>>,
}

impl InspectionStore {
    pub fn new(ttl_secs: i64) -> Self {
        Self {
            ttl: Duration::from_secs(ttl_secs.max(60) as u64),
            clock: Box::new(SystemClock),
            records: Mutex::new(HashMap::new()),
        }
    }

    pub fn insert(
        &self,
        url: String,
        inspection: MediaInspection,
        probe_json: Value,
        auth: Option<AuthConfig>,
    ) -> (String, i64) {
        self.purge_expired();
        let id = Uuid::new_v4().to_string();
        let now = self.clock.now();
        let expires_at = now + self.ttl;
        let expires_at_secs = chrono::Utc::now().timestamp() + self.ttl.as_secs() as i64;
        let record = InspectionRecord {
            id: id.clone(),
            url,
            inspection,
            probe_json,
            auth,
            created_at: now,
            expires_at,
        };
        if let Ok(mut g) = self.records.lock() {
            g.insert(id.clone(), record);
        }
        (id, expires_at_secs)
    }

    pub fn get(&self, id: &str) -> Result<InspectionRecord, EngineError> {
        self.purge_expired();
        let g = self.records.lock().map_err(|_| {
            EngineError::new(EngineErrorCode::InvalidRequest, "Inspection store lock poisoned")
        })?;
        let Some(rec) = g.get(id) else {
            return Err(EngineError::new(
                EngineErrorCode::InspectionExpired,
                "Inspection not found or expired",
            ));
        };
        if self.clock.now() >= rec.expires_at {
            return Err(EngineError::new(
                EngineErrorCode::InspectionExpired,
                "Inspection has expired",
            ));
        }
        Ok(InspectionRecord {
            id: rec.id.clone(),
            url: rec.url.clone(),
            inspection: rec.inspection.clone(),
            probe_json: rec.probe_json.clone(),
            auth: rec.auth.clone(),
            created_at: rec.created_at,
            expires_at: rec.expires_at,
        })
    }

    fn purge_expired(&self) {
        let now = self.clock.now();
        if let Ok(mut g) = self.records.lock() {
            g.retain(|_, rec| now < rec.expires_at);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::MediaChoiceSet;

    fn sample_inspection() -> MediaInspection {
        MediaInspection {
            title: "t".into(),
            thumbnail: String::new(),
            duration: 0.0,
            formats: vec![],
            file_size_bytes: None,
            file_size_bytes_audio: None,
            file_size_bytes_video: None,
            is_playlist: false,
            playlist_items: None,
            uploader: None,
            channel: None,
            choices: MediaChoiceSet {
                allowed_video_formats: vec!["best".into()],
                allowed_audio_formats: vec!["m4a".into()],
                default_video_format: "best".into(),
                default_audio_format: "m4a".into(),
            },
        }
    }

    #[test]
    fn inspection_round_trip() {
        let store = InspectionStore::new(900);
        let (id, _) = store.insert(
            "https://example.com/watch".into(),
            sample_inspection(),
            serde_json::json!({}),
            None,
        );
        assert!(store.get(&id).is_ok());
    }
}
