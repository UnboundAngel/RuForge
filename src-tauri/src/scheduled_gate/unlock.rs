use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub struct ScheduledFeature {
    pub id: &'static str,
    /// Local calendar date, `YYYY-MM-DD`. Unlocks at local midnight so it rolls around the world.
    pub unlock_at: &'static str,
    /// Released features are public source and always on; the gate is a no-op for them.
    pub released: bool,
}

/// One entry in `ruforge.app/unlocks.json` > `features`. Absent means the compiled date stands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub enum Override {
    Open,
    Hold,
    Date(NaiveDate),
}

impl From<Override> for String {
    fn from(o: Override) -> Self {
        match o {
            Override::Open => "open".into(),
            Override::Hold => "hold".into(),
            Override::Date(d) => d.format("%Y-%m-%d").to_string(),
        }
    }
}

impl TryFrom<String> for Override {
    type Error = String;
    fn try_from(s: String) -> Result<Self, String> {
        match s.as_str() {
            "open" => Ok(Self::Open),
            "hold" => Ok(Self::Hold),
            other => parse_date(other).map(Self::Date),
        }
    }
}

pub fn parse_date(s: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| format!("bad date {s:?}: {e}"))
}

/// Unknown or malformed entries are skipped one by one so a typo for one feature cannot
/// lock or unlock the others.
pub fn parse_overrides(json: &str) -> HashMap<String, Override> {
    let Ok(root) = serde_json::from_str::<serde_json::Value>(json) else {
        return HashMap::new();
    };
    let Some(map) = root.get("features").and_then(|f| f.as_object()) else {
        return HashMap::new();
    };
    map.iter()
        .filter_map(|(id, v)| {
            let s = v.as_str()?.to_string();
            Override::try_from(s).ok().map(|o| (id.clone(), o))
        })
        .collect()
}

pub fn is_unlocked(feature: &ScheduledFeature, server: Option<&Override>, today: NaiveDate) -> bool {
    if feature.released {
        return true;
    }
    let date = match server {
        Some(Override::Open) => return true,
        Some(Override::Hold) => return false,
        Some(Override::Date(d)) => *d,
        // An unparseable compiled date fails closed; build.rs only checks presence.
        None => match parse_date(feature.unlock_at) {
            Ok(d) => d,
            Err(_) => return false,
        },
    };
    today >= date
}
