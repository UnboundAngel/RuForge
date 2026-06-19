use std::path::PathBuf;

use ruforge_lib::commands::gallery::{scan_gallery, sweep_library_download_duplicates};

#[tokio::main]
async fn main() {
    let dir = PathBuf::from(
        std::env::args()
            .nth(1)
            .expect("usage: verify_gallery_folder <dir> [sweep]"),
    );
    let do_sweep = std::env::args().nth(2).as_deref() == Some("sweep");

    eprintln!("dir={}", dir.display());
    eprintln!("sweep={do_sweep}");

    let entries = scan_gallery(dir.to_string_lossy().to_string())
        .await
        .expect("scan_gallery");
    eprintln!("entry_count={}", entries.len());
    for (i, entry) in entries.iter().enumerate() {
        match entry {
            ruforge_lib::commands::gallery::GalleryEntry::Media { file } => {
                eprintln!(
                    "[{i}] Media path={} duration={} size={}",
                    file.path, file.duration, file.size
                );
            }
            ruforge_lib::commands::gallery::GalleryEntry::Playlist { playlist } => {
                eprintln!(
                    "[{i}] Playlist title={} item_count={} combined_duration={}",
                    playlist.title, playlist.item_count, playlist.combined_duration
                );
                for (j, item) in playlist.items.iter().enumerate() {
                    eprintln!(
                        "  [{j}] path={} duration={} size={}",
                        item.path, item.duration, item.size
                    );
                }
            }
        }
    }

    if do_sweep {
        sweep_library_download_duplicates(dir.to_string_lossy().to_string())
            .await
            .expect("sweep_library_download_duplicates");
        eprintln!("sweep_done");
    }
}
