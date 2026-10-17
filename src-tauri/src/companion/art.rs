use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use tokio::sync::Semaphore;

const MAX_EDGE: u32 = 256;
const JPEG_QUALITY: u8 = 82;

// Decoding a full cover is the costly part; a cold library scroll must not spawn dozens at once.
static DECODE_SLOTS: Semaphore = Semaphore::const_new(2);

/// The 256px JPEG for one cover, built once and kept in the app cache dir.
pub async fn variant(app: &AppHandle, id: &str, version: u64, source: PathBuf) -> Option<Vec<u8>> {
    let dir = app.path().app_cache_dir().ok()?.join("companion-art");
    let file = dir.join(format!("{id}-{version}-sq.jpg"));
    if let Ok(bytes) = tokio::fs::read(&file).await {
        return Some(bytes);
    }
    let _slot = DECODE_SLOTS.acquire().await.ok()?;
    if let Ok(bytes) = tokio::fs::read(&file).await {
        return Some(bytes);
    }
    let prefix = format!("{id}-");
    tokio::task::spawn_blocking(move || {
        let bytes = encode(&source)?;
        if std::fs::create_dir_all(&dir).is_ok() {
            // An older cover version of this item is dead weight once a new one exists.
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for e in entries.flatten() {
                    if e.file_name().to_string_lossy().starts_with(&prefix) {
                        let _ = std::fs::remove_file(e.path());
                    }
                }
            }
            let tmp = file.with_extension("tmp");
            if std::fs::write(&tmp, &bytes).is_ok() {
                let _ = std::fs::rename(&tmp, &file);
            }
        }
        Some(bytes)
    })
    .await
    .ok()
    .flatten()
}

fn encode(source: &std::path::Path) -> Option<Vec<u8>> {
    let mut img = image::open(source).ok()?;
    // The lock screen and Dynamic Island letterbox non-square art, so the cover is cut square here.
    let side = img.width().min(img.height());
    if img.width() != img.height() {
        img = img.crop_imm((img.width() - side) / 2, (img.height() - side) / 2, side, side);
    }
    let small = if side > MAX_EDGE {
        img.thumbnail(MAX_EDGE, MAX_EDGE)
    } else {
        img
    };
    let rgb = small.to_rgb8();
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
        .encode_image(&rgb)
        .ok()?;
    Some(out)
}
