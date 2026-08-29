//! Live LRCLIB match smoke test (no disk sidecars).
//! cargo run -p ruforge --features dev-verify-bins --bin verify_lrclib

use ruforge_lib::commands::lyrics::{fetch_lyrics_for_queries, LyricsQuery};

#[tokio::main]
async fn main() {
    let cases: Vec<LyricsQuery> = vec![
        LyricsQuery {
            artist: "Borislav Slavov".into(),
            title: "I Want to Live".into(),
            album: Some("Baldur's Gate 3 (Original Game Soundtrack)".into()),
            duration: Some(233.0),
            identity: "canonical",
        },
        LyricsQuery {
            artist: "Portal".into(),
            title: "Still Alive".into(),
            album: Some("Portal".into()),
            duration: Some(176.0),
            identity: "canonical",
        },
        LyricsQuery {
            artist: "Radiohead".into(),
            title: "Karma Police".into(),
            album: Some("OK Computer".into()),
            duration: Some(264.0),
            identity: "canonical",
        },
    ];

    for (i, q) in cases.iter().enumerate() {
        eprintln!("--- case {} ---", i + 1);
        eprintln!(
            "query artist={:?} title={:?} album={:?} duration={:?} identity={}",
            q.artist, q.title, q.album, q.duration, q.identity
        );
        let outcome = fetch_lyrics_for_queries(std::slice::from_ref(q)).await;
        let hit = outcome.sidecar.synced_lyrics.is_some()
            || outcome.sidecar.plain_lyrics.is_some()
            || outcome.sidecar.matched_track_name.is_some();
        eprintln!("match_step={}", outcome.match_step);
        eprintln!("raw={}", if hit { "match" } else { "miss" });
        eprintln!(
            "matched_track={:?} matched_artist={:?}",
            outcome.sidecar.matched_track_name, outcome.sidecar.matched_artist_name
        );
        eprintln!(
            "synced_len={} plain_len={}",
            outcome
                .sidecar
                .synced_lyrics
                .as_ref()
                .map(|s| s.len())
                .unwrap_or(0),
            outcome
                .sidecar
                .plain_lyrics
                .as_ref()
                .map(|s| s.len())
                .unwrap_or(0)
        );
        println!("{}", serde_json::to_string_pretty(&outcome.sidecar).unwrap());
    }
}
