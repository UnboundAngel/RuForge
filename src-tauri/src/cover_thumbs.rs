//! Small cached thumbnails of local cover images, served by the asset protocol for `?thumb=` URLs.
//! Music lists show ~1280 px covers at 24 to 64 px, so a view switch moved ~18 MB and decoded
//! hundreds of full-size images. A thumb is made once per source version and kept in
//! `app_cache_dir/cover-thumbs/`; anything that cannot be thumbed falls back to the original.

use std::collections::HashMap;
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::{ImageEncoder, ImageReader};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime};

pub const THUMB_DIR: &str = "cover-thumbs";

/// Short edge, not long edge: small spots crop with `object-cover`, so a 16:9 thumbnail needs
/// 128 px of height to stay sharp in a 64 px square at 2x DPI.
const THUMB_SHORT_EDGE: u32 = 128;
const THUMB_MAX_LONG_EDGE: u32 = 384;
const JPEG_QUALITY: u8 = 85;
const MAX_SOURCE_BYTES: u64 = 40 * 1024 * 1024;

/// Generation is CPU-bound; a cold Music view asks for hundreds at once and must not starve
/// the blocking pool that also serves media ranges or the cores playback needs.
fn max_concurrent_generations() -> usize {
    std::thread::available_parallelism().map(|n| n.get() / 2).unwrap_or(2).clamp(2, 6)
}

const CACHE_CAP_BYTES: u64 = 200 * 1024 * 1024;
const CACHE_PRUNE_TO_BYTES: u64 = 160 * 1024 * 1024;
const TOUCH_AFTER: Duration = Duration::from_secs(24 * 3600);

/// Zero-byte marker for a source that cannot or need not be thumbed (corrupt, unsupported,
/// already small), so it is not decoded again on every request.
const SKIP_EXT: &str = "none";

pub fn wants_thumb(query: Option<&str>) -> bool {
    query.is_some_and(|q| q.split('&').any(|kv| kv.strip_prefix("thumb=").is_some_and(|v| !v.is_empty())))
}

pub fn is_thumbable_ext(path: &str) -> bool {
    let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("");
    matches!(ext.to_ascii_lowercase().as_str(), "jpg" | "jpeg" | "png" | "webp")
}

/// Changes whenever the source path, size, or mtime changes, so a replaced cover gets a new thumb.
pub fn thumb_stem(path: &str, mtime_ms: u128, size: u64) -> String {
    let digest = Sha256::digest(path.as_bytes());
    let hash: String = digest[..10].iter().map(|b| format!("{b:02x}")).collect();
    format!("{hash}-{mtime_ms}-{size}")
}

/// `None` when the source is already small enough to serve as is.
pub fn target_size(width: u32, height: u32) -> Option<(u32, u32)> {
    let short = width.min(height);
    if short <= THUMB_SHORT_EDGE || width == 0 || height == 0 {
        return None;
    }
    let mut scale = THUMB_SHORT_EDGE as f64 / short as f64;
    let long = width.max(height) as f64 * scale;
    if long > THUMB_MAX_LONG_EDGE as f64 {
        scale *= THUMB_MAX_LONG_EDGE as f64 / long;
    }
    let w = ((width as f64 * scale).round() as u32).max(1);
    let h = ((height as f64 * scale).round() as u32).max(1);
    Some((w, h))
}

/// Oldest first until the total drops to `target`; nothing when under `cap`.
pub fn files_to_prune<T: Clone>(entries: &[(T, u64, SystemTime)], cap: u64, target: u64) -> Vec<T> {
    let mut total: u64 = entries.iter().map(|e| e.1).sum();
    if total <= cap {
        return Vec::new();
    }
    let mut sorted: Vec<&(T, u64, SystemTime)> = entries.iter().collect();
    sorted.sort_by_key(|e| e.2);
    let mut out = Vec::new();
    for (item, size, _) in sorted {
        if total <= target {
            break;
        }
        total = total.saturating_sub(*size);
        out.push(item.clone());
    }
    out
}

pub fn thumb_dir<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_cache_dir().ok().map(|d| d.join(THUMB_DIR))
}

fn mtime_ms(meta: &std::fs::Metadata) -> u128 {
    meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis()).unwrap_or(0)
}

pub enum Lookup {
    Ready(PathBuf),
    Skip,
    Missing(String),
}

/// Blocking. `src` must already be validated against the asset scope.
pub fn lookup(dir: &Path, src: &str) -> Lookup {
    let Ok(meta) = std::fs::metadata(src) else {
        return Lookup::Skip;
    };
    if !meta.is_file() || meta.len() > MAX_SOURCE_BYTES {
        return Lookup::Skip;
    }
    let stem = thumb_stem(src, mtime_ms(&meta), meta.len());
    for ext in ["jpg", "png"] {
        let p = dir.join(format!("{stem}.{ext}"));
        if let Ok(m) = std::fs::metadata(&p) {
            touch_if_stale(&p, &m);
            return Lookup::Ready(p);
        }
    }
    if dir.join(format!("{stem}.{SKIP_EXT}")).is_file() {
        return Lookup::Skip;
    }
    Lookup::Missing(stem)
}

/// Keeps pruning least-recently-used without a write on every hit.
fn touch_if_stale(path: &Path, meta: &std::fs::Metadata) {
    let stale = meta.modified().ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age > TOUCH_AFTER);
    if stale {
        if let Ok(f) = File::options().write(true).open(path) {
            let _ = f.set_modified(SystemTime::now());
        }
    }
}

/// Blocking. Writes `{stem}.jpg` (or `.png` when the source has transparency) atomically, or a
/// skip marker when the source cannot be thumbed.
pub fn generate(dir: &Path, src: &str, stem: &str) -> Option<PathBuf> {
    std::fs::create_dir_all(dir).ok()?;
    let made = encode_thumb(src);
    let Some((bytes, ext)) = made else {
        let _ = File::create(dir.join(format!("{stem}.{SKIP_EXT}")));
        return None;
    };
    let dest = dir.join(format!("{stem}.{ext}"));
    let tmp = dir.join(format!("{stem}.{ext}.tmp-{}", uuid::Uuid::new_v4().simple()));
    std::fs::write(&tmp, &bytes).ok()?;
    if std::fs::rename(&tmp, &dest).is_err() {
        let _ = std::fs::remove_file(&tmp);
        return dest.is_file().then_some(dest);
    }
    Some(dest)
}

fn encode_thumb(src: &str) -> Option<(Vec<u8>, &'static str)> {
    let img = ImageReader::open(src).ok()?.with_guessed_format().ok()?.decode().ok()?;
    let (w, h) = target_size(img.width(), img.height())?;
    let thumb = img.thumbnail_exact(w, h);
    let mut out = Vec::with_capacity(16 * 1024);
    if thumb.color().has_alpha() {
        let rgba = thumb.to_rgba8();
        PngEncoder::new(BufWriter::new(&mut out))
            .write_image(&rgba, w, h, image::ExtendedColorType::Rgba8)
            .ok()?;
        Some((out, "png"))
    } else {
        let rgb = thumb.to_rgb8();
        JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
            .write_image(&rgb, w, h, image::ExtendedColorType::Rgb8)
            .ok()?;
        Some((out, "jpg"))
    }
}

fn generation_permits() -> &'static tokio::sync::Semaphore {
    static PERMITS: OnceLock<tokio::sync::Semaphore> = OnceLock::new();
    PERMITS.get_or_init(|| tokio::sync::Semaphore::new(max_concurrent_generations()))
}

type Inflight = Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>;

fn inflight() -> &'static Inflight {
    static INFLIGHT: OnceLock<Inflight> = OnceLock::new();
    INFLIGHT.get_or_init(Default::default)
}

/// One generation per stem at a time; later callers for the same cover wait and reuse its file.
pub async fn ensure(dir: PathBuf, src: String, stem: String) -> Option<PathBuf> {
    let gate = {
        let mut map = inflight().lock().ok()?;
        map.entry(stem.clone()).or_default().clone()
    };
    let result = {
        let _same_stem = gate.lock().await;
        let (d, s) = (dir.clone(), src.clone());
        match tauri::async_runtime::spawn_blocking(move || lookup(&d, &s)).await.ok()? {
            Lookup::Ready(p) => Some(p),
            Lookup::Skip => None,
            Lookup::Missing(stem) => {
                let _permit = generation_permits().acquire().await.ok()?;
                tauri::async_runtime::spawn_blocking(move || generate(&dir, &src, &stem)).await.ok()?
            }
        }
    };
    if let Ok(mut map) = inflight().lock() {
        if map.get(&stem).is_some_and(|g| Arc::ptr_eq(g, &gate)) && Arc::strong_count(&gate) <= 2 {
            map.remove(&stem);
        }
    }
    result
}

/// Startup housekeeping: drop half-written temp files and keep the folder under its cap.
pub fn spawn_prune<R: Runtime>(app: &AppHandle<R>) {
    let Some(dir) = thumb_dir(app) else {
        return;
    };
    tauri::async_runtime::spawn_blocking(move || {
        let Ok(read) = std::fs::read_dir(&dir) else {
            return;
        };
        let mut entries = Vec::new();
        for entry in read.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_file() {
                continue;
            }
            let path = entry.path();
            let modified = meta.modified().unwrap_or(UNIX_EPOCH);
            let is_tmp = path.to_string_lossy().contains(".tmp-");
            if is_tmp && modified.elapsed().is_ok_and(|age| age > Duration::from_secs(3600)) {
                let _ = std::fs::remove_file(&path);
                continue;
            }
            entries.push((path, meta.len(), modified));
        }
        let doomed = files_to_prune(&entries, CACHE_CAP_BYTES, CACHE_PRUNE_TO_BYTES);
        let count = doomed.len();
        for path in doomed {
            let _ = std::fs::remove_file(path);
        }
        if count > 0 {
            log::info!("[cover-thumbs] pruned {count} thumbnails over the size cap");
        }
    });
}
