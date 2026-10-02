//! Remote pages (youtube.com in the Explorer webviews) must never be able to listen for app events:
//! Tauri hands every event to Any-target listeners regardless of `emit_to`, and several carry
//! local paths (`download-job-finished`, `delete-media-batch-progress`, scrub sprites, exports).

#[cfg(test)]
mod tests {
    use serde_json::Value;

    const CAPABILITIES: &[(&str, &str)] = &[
        ("default.json", include_str!("../capabilities/default.json")),
        (
            "music-explore-webview.json",
            include_str!("../capabilities/music-explore-webview.json"),
        ),
    ];

    fn permission_ids(cap: &Value) -> Vec<String> {
        cap["permissions"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|p| p.as_str().or_else(|| p["identifier"].as_str()).map(str::to_string))
            .collect()
    }

    fn grants_listen(id: &str) -> bool {
        id == "core:event:allow-listen" || id == "core:event:default" || id == "core:default"
    }

    #[test]
    fn remote_capabilities_cannot_listen_for_events() {
        let mut remote_seen = 0;
        for (name, raw) in CAPABILITIES {
            let cap: Value = serde_json::from_str(raw).unwrap();
            if cap.get("remote").is_none() {
                continue;
            }
            remote_seen += 1;
            for id in permission_ids(&cap) {
                assert!(!grants_listen(&id), "{name} lets remote pages listen via {id}");
            }
        }
        assert!(remote_seen > 0, "the Explorer capability should be audited");
    }

    #[test]
    fn explorer_webviews_only_get_the_remote_capability() {
        for (name, raw) in CAPABILITIES {
            let cap: Value = serde_json::from_str(raw).unwrap();
            if cap.get("remote").is_some() {
                continue;
            }
            assert_ne!(cap["local"], Value::Bool(false), "{name} must stay local-only");
            let webviews = cap["webviews"].as_array().cloned().unwrap_or_default();
            for label in ["explorer-view", "music-explore-view", "explorer-session-probe"] {
                assert!(
                    !webviews.iter().any(|w| w == label),
                    "{name} grants local permissions to remote webview {label}"
                );
            }
        }
    }
}
