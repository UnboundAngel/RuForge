use super::pubkey::ANNOUNCE_PUBKEY;
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::NaiveDate;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

const LINK_PREFIX: &str = "https://ruforge.app/";
const MAX_ITEMS: usize = 50;

#[derive(Deserialize)]
struct Envelope {
    payload: String,
    sig: String,
}

#[derive(Deserialize)]
struct Payload {
    version: u32,
    items: Vec<serde_json::Value>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct PollOption {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub published: String,
    #[serde(default)]
    pub ends: Option<String>,
    #[serde(default)]
    pub options: Option<Vec<PollOption>>,
    #[serde(default)]
    pub link: Option<String>,
}

fn chars(s: &str) -> usize {
    s.chars().count()
}

pub fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

fn kebab(id: &str) -> bool {
    !id.is_empty()
        && chars(id) <= 64
        && !id.starts_with('-')
        && !id.ends_with('-')
        && !id.contains("--")
        && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn valid_item(it: &Item) -> bool {
    if !kebab(&it.id) || it.title.is_empty() || chars(&it.title) > 80 {
        return false;
    }
    // Polls show only the question and options; their body is optional and never rendered.
    let body_ok = chars(&it.body) <= 280 && (it.kind == "poll" || !it.body.is_empty());
    if !body_ok || parse_date(&it.published).is_none() {
        return false;
    }
    if it.ends.as_deref().is_some_and(|e| parse_date(e).is_none()) {
        return false;
    }
    match it.kind.as_str() {
        "poll" => {
            let Some(options) = &it.options else { return false };
            let mut seen: Vec<&str> = Vec::new();
            for o in options {
                if o.id.is_empty() || o.label.is_empty() || chars(&o.label) > 60 || seen.contains(&o.id.as_str()) {
                    return false;
                }
                seen.push(&o.id);
            }
            (2..=6).contains(&options.len()) && it.link.is_none()
        }
        "notice" => {
            it.options.is_none() && it.link.as_deref().is_none_or(|l| l.starts_with(LINK_PREFIX))
        }
        _ => false,
    }
}

/// Checks the signature over the exact payload bytes, then keeps only well-formed items. Any
/// envelope-level failure (bad signature, bad JSON, wrong version) rejects the whole file so the
/// caller keeps its last good copy.
pub fn verify_and_parse(body: &str) -> Result<Vec<Item>, String> {
    let env: Envelope = serde_json::from_str(body).map_err(|e| format!("envelope: {e}"))?;
    let payload_bytes = STANDARD.decode(env.payload.trim()).map_err(|e| format!("payload base64: {e}"))?;
    let sig_bytes = STANDARD.decode(env.sig.trim()).map_err(|e| format!("sig base64: {e}"))?;
    let sig = Signature::from_slice(&sig_bytes).map_err(|e| format!("sig: {e}"))?;
    let key = VerifyingKey::from_bytes(&ANNOUNCE_PUBKEY).map_err(|e| format!("pubkey: {e}"))?;
    key.verify_strict(&payload_bytes, &sig).map_err(|_| "signature mismatch".to_string())?;
    let payload: Payload = serde_json::from_slice(&payload_bytes).map_err(|e| format!("payload: {e}"))?;
    if payload.version != 1 {
        return Err(format!("unsupported version {}", payload.version));
    }
    let mut items: Vec<Item> = Vec::new();
    for raw in payload.items.into_iter().take(MAX_ITEMS) {
        match serde_json::from_value::<Item>(raw) {
            Ok(it) if valid_item(&it) && !items.iter().any(|o| o.id == it.id) => items.push(it),
            _ => log::warn!("announcements: dropped an invalid item"),
        }
    }
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsigned_body() {
        let body = r#"{"payload":"e30=","sig":"AAAA"}"#;
        assert!(verify_and_parse(body).is_err());
    }

    #[test]
    fn item_rules() {
        let mut it = Item {
            id: "hello-world".into(),
            kind: "notice".into(),
            title: "Hi".into(),
            body: "Body".into(),
            published: "2026-10-01".into(),
            ends: None,
            options: None,
            link: Some("https://evil.example/".into()),
        };
        assert!(!valid_item(&it));
        it.link = Some("https://ruforge.app/changelog".into());
        assert!(valid_item(&it));
        it.id = "Bad_Id".into();
        assert!(!valid_item(&it));
    }
}
