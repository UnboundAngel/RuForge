use std::path::PathBuf;

use ruforge_lib::commands::musicmeta::{
    enrich_music_meta_at, read_sidecar, sidecar_path_for, EnrichMode, EnrichOpts,
};

#[tokio::main]
async fn main() {
    let media = PathBuf::from(
        std::env::args()
            .nth(1)
            .expect("usage: verify_track_enrich <audio_path> [true|false]"),
    );
    let artist_tags = match std::env::args().nth(2).as_deref() {
        Some("false") => false,
        Some("true") | None => true,
        Some(other) => panic!("second arg must be true or false, got {other}"),
    };

    let app_data = dirs::data_dir()
        .expect("data_dir")
        .join("com.attic.ruforge");
    std::fs::create_dir_all(&app_data).expect("create app_data");

    eprintln!("media={}", media.display());
    eprintln!("app_data={}", app_data.display());
    eprintln!("artist_tags={artist_tags}");

    let ok = enrich_music_meta_at(
        &app_data,
        &media,
        EnrichMode::Full { force: true },
        EnrichOpts { artist_tags },
    )
    .await;
    eprintln!("enrich_ok={ok}");

    let parent = media.parent().expect("parent");
    let stem = media
        .file_stem()
        .and_then(|s| s.to_str())
        .expect("stem");
    let sidecar = sidecar_path_for(parent, stem);
    let Some(dto) = read_sidecar(&sidecar) else {
        eprintln!("sidecar missing: {}", sidecar.display());
        std::process::exit(1);
    };

    eprintln!("schema_version={}", dto.schema_version);
    eprintln!("genres={:?}", dto.genres);
    eprintln!("artist_mb_id={:?}", dto.artist_mb_id);
    println!("{}", serde_json::to_string_pretty(&dto).unwrap());
}
