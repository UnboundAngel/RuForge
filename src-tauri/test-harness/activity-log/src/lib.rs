pub mod commands {
    #[path = "../../../../src/commands/activity_log/mod.rs"]
    pub mod activity_log;
    #[path = "../../../../src/commands/activity_stats/mod.rs"]
    pub mod activity_stats;
    #[path = "../../../../src/commands/music_playlists.rs"]
    pub mod music_playlists;
}

/// Stand-in for `library::path_access` so `music_playlists` compiles in the harness.
pub mod library {
    pub mod path_access {
        pub fn allow_path(
            _app: &tauri::AppHandle,
            raw: &str,
        ) -> Result<std::path::PathBuf, String> {
            Ok(std::path::PathBuf::from(raw))
        }
    }
}

#[cfg(test)]
mod real_data_smoke {
    use crate::commands::activity_stats::{
        compute_bests_for_paths, compute_streaks_for_paths, compute_summary_for_paths,
        seed_milestones_for_paths, StatsRange,
    };
    use std::path::PathBuf;

    fn paths() -> Option<(PathBuf, PathBuf)> {
        let appdata = std::env::var_os("APPDATA")?;
        let app_data = PathBuf::from(appdata).join("com.attic.ruforge");
        let dir = app_data.join("activity");
        if !dir.is_dir() {
            return None;
        }
        Some((dir, app_data))
    }

    /// Dev-only: print Angel's live summary once. Not part of CI.
    #[test]
    #[ignore]
    fn print_angel_stats() {
        let Some((dir, app_data)) = paths() else {
            eprintln!("no activity dir");
            return;
        };
        let summary = compute_summary_for_paths(&dir, &app_data, &StatsRange::Named("all".into())).unwrap();
        let streaks = compute_streaks_for_paths(&dir, &app_data).unwrap();
        let bests = compute_bests_for_paths(&dir, &app_data).unwrap();
        let seeded = seed_milestones_for_paths(&dir, &app_data).unwrap();
        println!("SUMMARY={}", serde_json::to_string_pretty(&summary).unwrap());
        println!("STREAKS={}", serde_json::to_string_pretty(&streaks).unwrap());
        println!("BESTS={}", serde_json::to_string_pretty(&bests).unwrap());
        println!("MILESTONES_CROSSED={}", seeded);
        let milestones = std::fs::read_to_string(dir.join("milestones.json")).unwrap_or_default();
        println!("MILESTONES_FILE={}", milestones);
    }
}
