use serde_json::Value;

/// A one-item list pasted as a playlist stays a playlist; other one-entry wrappers (a bare video
/// URL, a multi-part post) still collapse to the single video.
pub(crate) fn source_is_playlist(json: &Value) -> bool {
    if json.get("_type").and_then(|v| v.as_str()) != Some("playlist") {
        return false;
    }
    ["original_url", "webpage_url"].iter().any(|k| {
        json.get(*k)
            .and_then(|v| v.as_str())
            .is_some_and(|u| u.contains("list=") || u.contains("/playlist"))
    })
}
