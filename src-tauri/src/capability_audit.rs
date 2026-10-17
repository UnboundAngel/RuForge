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
        ("mini-ghost.json", include_str!("../capabilities/mini-ghost.json")),
        #[cfg(ruforge_games)]
        ("glance-popout.json", include_str!("../capabilities/glance-popout.json")),
        #[cfg(ruforge_games)]
        (
            "games-system-hotkeys.json",
            include_str!("../capabilities/games-system-hotkeys.json"),
        ),
        #[cfg(ruforge_games)]
        ("games-windows.json", include_str!("../capabilities/games-windows.json")),
    ];

    /// Games-only capability files. Audited above when Games is built in; skipped by the folder
    /// check when it is not (a tree without Games drops them, and the harness build sets no cfg).
    const GAMES_CAPABILITY_FILES: &[&str] = &["glance-popout.json", "games-system-hotkeys.json", "games-windows.json"];

    /// Every file in `capabilities/` must be in `CAPABILITIES`, or a new one would skip the audit.
    #[test]
    fn every_capability_file_is_audited() {
        // The app crate, or the test harness two levels below it.
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let dir = [root.join("capabilities"), root.join("../../capabilities")]
            .into_iter()
            .find(|d| d.is_dir())
            .expect("capabilities folder not found");
        let entries = std::fs::read_dir(&dir).unwrap();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".json") {
                let audited = CAPABILITIES.iter().any(|(n, _)| *n == name);
                let games_skipped = !cfg!(ruforge_games) && GAMES_CAPABILITY_FILES.contains(&name.as_str());
                assert!(audited || games_skipped, "{name} is not audited");
            }
        }
    }

    /// Tauri grants a capability when the webview label or the window label matches, so a remote
    /// capability scoped to a window also reaches every other child webview in it (the glance viewer
    /// in `main`, for one). Remote capabilities name their webviews only.
    #[test]
    fn remote_capabilities_are_scoped_to_webviews_not_windows() {
        for (name, raw) in CAPABILITIES {
            let cap: Value = serde_json::from_str(raw).unwrap();
            if cap.get("remote").is_none() {
                continue;
            }
            assert!(cap.get("windows").is_none(), "{name} grants remote pages permissions by window");
            assert!(
                cap["webviews"].as_array().is_some_and(|w| !w.is_empty() && w.iter().all(|l| l.as_str() != Some("*"))),
                "{name} must name its webviews"
            );
        }
    }

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

    /// Spawning happens in Rust only; a frontend grant would turn any injected script into
    /// `yt-dlp --exec` or a launched executable.
    #[test]
    fn no_capability_grants_frontend_process_spawn_or_open_path() {
        for (name, raw) in CAPABILITIES {
            let cap: Value = serde_json::from_str(raw).unwrap();
            for id in permission_ids(&cap) {
                assert!(
                    !matches!(
                        id.as_str(),
                        "shell:allow-spawn" | "shell:allow-execute" | "shell:default" | "opener:allow-open-path"
                    ),
                    "{name} grants {id}"
                );
            }
        }
    }

    /// `opener:default` brings `reveal_item_in_dir` (a UNC path makes Windows contact that host)
    /// and `mailto:` / `tel:`; the frontend only opens web links.
    #[test]
    fn opener_grants_only_scoped_web_urls() {
        for (name, raw) in CAPABILITIES {
            let cap: Value = serde_json::from_str(raw).unwrap();
            for id in permission_ids(&cap) {
                assert!(
                    !id.starts_with("opener:") || id == "opener:allow-open-url",
                    "{name} grants {id}"
                );
            }
            for perm in cap["permissions"].as_array().into_iter().flatten() {
                if perm.as_str() == Some("opener:allow-open-url") {
                    panic!("{name} grants opener:allow-open-url without a URL scope");
                }
                if perm["identifier"] == "opener:allow-open-url" {
                    for entry in perm["allow"].as_array().into_iter().flatten() {
                        let url = entry["url"].as_str().unwrap_or("");
                        assert!(
                            url.starts_with("https://") || url.starts_with("http://"),
                            "{name} lets openUrl reach {url}"
                        );
                    }
                }
            }
        }
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
            for label in [
                "explorer-view",
                "music-explore-view",
                "explorer-session-probe",
                "guide-glance",
                "glance-popout-page",
            ] {
                assert!(
                    !webviews.iter().any(|w| w == label),
                    "{name} grants local permissions to remote webview {label}"
                );
            }
        }
    }
}
