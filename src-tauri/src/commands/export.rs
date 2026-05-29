use std::collections::{HashMap, HashSet};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::Local;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::utils::{is_media_ext, vtt_sidecars_for_stem, THUMB_DIR_NAME};

const EXPORT_SUBFOLDER_PREFIX: &str = "RuForge Export ";
const MANIFEST_FILENAME: &str = "ruforge-export-manifest.json";
const SCAN_MAX_DEPTH: u8 = 5;

#[derive(Clone)]
pub struct ExportBundleState {
    cancel: Arc<AtomicBool>,
}

impl Default for ExportBundleState {
    fn default() -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPlaybackEntry {
    pub source_path: String,
    pub playback_position_sec: f64,
    pub duration_sec: f64,
    pub watched: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMediaBundleOptions {
    pub paths: Vec<String>,
    pub dest_dir: String,
    pub include_manifest: bool,
    #[serde(default)]
    pub playback_entries: Vec<ExportPlaybackEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMediaBundleResult {
    pub dest_dir: String,
    pub files_copied: u32,
    pub files_skipped: u32,
    pub bytes_copied: u64,
    pub manifest_path: Option<String>,
    pub cancelled: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBundleProgress {
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_path: Option<String>,
    pub file_index: u32,
    pub file_total: u32,
    pub bytes_copied: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f32>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SelectionKind {
    File,
    Dir,
}

#[derive(Clone)]
struct SelectionAnchor {
    path: PathBuf,
    kind: SelectionKind,
}

struct MediaCopyJob {
    src_media: PathBuf,
    anchor: SelectionAnchor,
}

#[derive(Clone)]
struct PlannedJob {
    src_media: PathBuf,
    dest_media: PathBuf,
    relative_path: String,
    source_path_hint: String,
}

struct ExportRunContext {
    app: Option<AppHandle>,
    _bundle_root: PathBuf,
    cancel: Arc<AtomicBool>,
    file_total: u32,
    bytes_total: u64,
    bytes_copied: u64,
    files_copied: u32,
    files_skipped: u32,
    warnings: Vec<String>,
    last_percent_bucket: Option<u32>,
    completed_jobs: Vec<PlannedJob>,
}

fn strip_ytdlp_stream_suffix(stem: &str) -> &str {
    let Some(dot_f) = stem.rfind(".f") else {
        return stem;
    };
    let tail = &stem[dot_f + 2..];
    if tail.is_empty() {
        return stem;
    }
    if tail
        .chars()
        .all(|c| c.is_ascii_digit() || c == '-' || c == '.')
    {
        return &stem[..dot_f];
    }
    stem
}

fn stem_candidates(stem: &str) -> Vec<&str> {
    let stripped = strip_ytdlp_stream_suffix(stem);
    if stripped == stem {
        vec![stem]
    } else {
        vec![stem, stripped]
    }
}

fn gallery_skip_subdirectory(folder_name: &str) -> bool {
    folder_name.starts_with('.') || folder_name == THUMB_DIR_NAME
}

fn canonical_path_key(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn path_component_count(path: &Path) -> usize {
    path.components().count()
}

pub fn canonical_path_dedup(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut keyed: Vec<(PathBuf, PathBuf)> = paths
        .into_iter()
        .map(|p| {
            let key = canonical_path_key(&p);
            (key, p)
        })
        .collect();

    keyed.sort_by(|a, b| {
        path_component_count(&a.0)
            .cmp(&path_component_count(&b.0))
            .then_with(|| a.0.cmp(&b.0))
    });

    let mut kept: Vec<PathBuf> = Vec::new();
    let mut kept_keys: Vec<PathBuf> = Vec::new();
    let mut seen_exact: HashSet<PathBuf> = HashSet::new();

    for (key, original) in keyed {
        if !seen_exact.insert(key.clone()) {
            continue;
        }
        let dominated = kept_keys.iter().any(|k| {
            k != &key && k.is_dir() && key.starts_with(k) && key != *k
        });
        if !dominated {
            kept_keys.push(key);
            kept.push(original);
        }
    }

    kept
}

fn collect_media_files_under(dir: &Path, depth: u8, out: &mut Vec<PathBuf>) {
    if depth > SCAN_MAX_DEPTH {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<PathBuf> = rd.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entries.sort_by(|a, b| {
        a.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
            .cmp(
                &b.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase(),
            )
    });
    for path in entries {
        if path.is_dir() {
            let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !gallery_skip_subdirectory(fname) {
                collect_media_files_under(&path, depth + 1, out);
            }
            continue;
        }
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if is_media_ext(ext) {
            out.push(path);
        }
    }
}

fn expand_selections(
    selections: &[PathBuf],
    warnings: &mut Vec<String>,
) -> (Vec<MediaCopyJob>, Vec<(PathBuf, PathBuf)>) {
    let mut jobs: Vec<MediaCopyJob> = Vec::new();
    let mut extras: Vec<(PathBuf, PathBuf)> = Vec::new();

    for sel in selections {
        if sel.is_dir() {
            let anchor = SelectionAnchor {
                path: sel.clone(),
                kind: SelectionKind::Dir,
            };
            let mut media = Vec::new();
            collect_media_files_under(sel, 0, &mut media);
            if media.is_empty() {
                warnings.push(format!("No media files under folder: {}", sel.display()));
            }
            for src in media {
                jobs.push(MediaCopyJob {
                    src_media: src,
                    anchor: anchor.clone(),
                });
            }
            let folder_jpg = sel.join("folder.jpg");
            if folder_jpg.is_file() {
                let folder_name = sel
                    .file_name()
                    .map(|n| n.to_owned())
                    .unwrap_or_else(|| std::ffi::OsString::from("playlist"));
                extras.push((folder_jpg, PathBuf::from(folder_name).join("folder.jpg")));
            }
            continue;
        }

        if !sel.is_file() {
            warnings.push(format!("Path not found or not a file: {}", sel.display()));
            continue;
        }

        let ext = sel.extension().and_then(|s| s.to_str()).unwrap_or("");
        if !is_media_ext(ext) {
            warnings.push(format!("Not a supported media file: {}", sel.display()));
            continue;
        }

        jobs.push(MediaCopyJob {
            src_media: sel.clone(),
            anchor: SelectionAnchor {
                path: sel.clone(),
                kind: SelectionKind::File,
            },
        });
    }

    (jobs, extras)
}

fn relative_path_within_anchor(src: &Path, anchor: &SelectionAnchor) -> PathBuf {
    match anchor.kind {
        SelectionKind::Dir => {
            let folder_name = anchor
                .path
                .file_name()
                .map(|n| PathBuf::from(n))
                .unwrap_or_else(|| PathBuf::from("export"));
            let rel = src
                .strip_prefix(&anchor.path)
                .map(PathBuf::from)
                .unwrap_or_else(|_| {
                    src.file_name()
                        .map(PathBuf::from)
                        .unwrap_or_default()
                });
            folder_name.join(rel)
        }
        SelectionKind::File => src
            .file_name()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("media")),
    }
}

fn parent_folder_name(path: &Path) -> String {
    path.parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("export")
        .to_string()
}

fn fix_collision_resolution(tentative: &mut [(PlannedJob, PathBuf)], bundle_root: &Path) {
    let mut claimed: HashSet<PathBuf> = HashSet::new();

    for (planned, rel) in tentative.iter_mut() {
        let mut rel_path = rel.clone();
        let mut dest_media = bundle_root.join(&rel_path);
        let mut n = 2usize;

        while claimed.contains(&rel_path) {
            let stem = dest_media
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("media");
            let ext = dest_media.extension().and_then(|e| e.to_str());
            let parent = dest_media.parent().unwrap_or_else(|| Path::new(""));
            let new_stem = format!("{stem} ({n})");
            n += 1;
            let mut new_name = new_stem;
            if let Some(e) = ext {
                new_name.push('.');
                new_name.push_str(e);
            }
            dest_media = parent.join(&new_name);
            rel_path = dest_media
                .strip_prefix(bundle_root)
                .unwrap_or(&dest_media)
                .to_path_buf();
        }

        claimed.insert(rel_path.clone());
        planned.dest_media = dest_media;
        planned.relative_path = rel_path.to_string_lossy().replace('\\', "/");
        *rel = rel_path;
    }
}

fn plan_destination_jobs_v2(jobs: Vec<MediaCopyJob>, bundle_root: &Path) -> Vec<PlannedJob> {
    let parent_names: HashSet<String> = jobs
        .iter()
        .filter(|j| matches!(j.anchor.kind, SelectionKind::File))
        .map(|j| parent_folder_name(&j.src_media))
        .collect();
    let disambiguate_file_parents = parent_names.len() > 1;

    let mut tentative: Vec<(PlannedJob, PathBuf)> = jobs
        .into_iter()
        .map(|job| {
            let mut rel = relative_path_within_anchor(&job.src_media, &job.anchor);
            if matches!(job.anchor.kind, SelectionKind::File) && disambiguate_file_parents {
                let parent = parent_folder_name(&job.src_media);
                let fname = job
                    .src_media
                    .file_name()
                    .map(PathBuf::from)
                    .unwrap_or_default();
                rel = PathBuf::from(parent).join(fname);
            }
            let dest_media = bundle_root.join(&rel);
            let planned = PlannedJob {
                src_media: job.src_media.clone(),
                dest_media,
                relative_path: rel.to_string_lossy().replace('\\', "/"),
                source_path_hint: job.src_media.to_string_lossy().to_string(),
            };
            (planned, rel)
        })
        .collect();

    fix_collision_resolution(&mut tentative, bundle_root);
    tentative.into_iter().map(|(p, _)| p).collect()
}

fn collect_sidecar_sources(parent: &Path, stem: &str) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();

    for candidate in stem_candidates(stem) {
        for name in [
            format!("{candidate}.jpg"),
            format!("{candidate}.webp"),
            format!("{candidate}.info.json"),
            format!("{candidate}..info.json"),
            format!("{candidate}.sponsorblock.json"),
            format!("{candidate}.comments.json"),
        ] {
            let p = parent.join(&name);
            if p.is_file() && seen.insert(p.clone()) {
                paths.push(p);
            }
        }
    }

    if let Ok(vtts) = vtt_sidecars_for_stem(parent, stem) {
        for (p, _) in vtts {
            if seen.insert(p.clone()) {
                paths.push(p);
            }
        }
    }

    paths
}

fn thumb_dir_candidates(parent: &Path, stem: &str) -> Vec<PathBuf> {
    stem_candidates(stem)
        .into_iter()
        .map(|s| parent.join(THUMB_DIR_NAME).join(s))
        .filter(|p| p.is_dir())
        .collect()
}

#[cfg(target_os = "windows")]
fn hide_thumb_root_if_new(thumb_root: &Path) {
    if thumb_root.is_dir() {
        let mut attrib_cmd = std::process::Command::new("attrib");
        let _ = attrib_cmd
            .args(["+h", &thumb_root.to_string_lossy()])
            .status();
    }
}

#[cfg(not(target_os = "windows"))]
fn hide_thumb_root_if_new(_thumb_root: &Path) {}

fn copy_dir_all(src_dir: &Path, dest_dir: &Path, ctx: &mut ExportRunContext) -> io::Result<()> {
    std::fs::create_dir_all(dest_dir)?;
    for entry in std::fs::read_dir(src_dir)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = dest_dir.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_all(&src_path, &dest_path, ctx)?;
        } else {
            match copy_file_skip_if_exists(&src_path, &dest_path, ctx) {
                Ok(_) => {}
                Err(e) => return Err(io::Error::new(io::ErrorKind::Other, e)),
            }
        }
    }
    Ok(())
}

fn is_destination_failure(err: &io::Error) -> bool {
    match err.kind() {
        io::ErrorKind::StorageFull | io::ErrorKind::ReadOnlyFilesystem => return true,
        _ => {}
    }
    #[cfg(windows)]
    if err.raw_os_error() == Some(112) {
        return true;
    }
    false
}

fn is_destination_failure_display(err: &str) -> bool {
    err.to_lowercase().contains("disk full")
        || err.to_lowercase().contains("not enough space")
        || err.contains("os error 112")
}

fn copy_file_skip_if_exists(
    src: &Path,
    dest: &Path,
    ctx: &mut ExportRunContext,
) -> Result<CopyOutcome, String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            if is_destination_failure(&e) {
                e.to_string()
            } else {
                format!("Create directory {}: {}", parent.display(), e)
            }
        })?;
    }

    if dest.is_file() {
        if let (Ok(src_meta), Ok(dest_meta)) = (std::fs::metadata(src), std::fs::metadata(dest))
        {
            if src_meta.len() == dest_meta.len() {
                ctx.files_skipped += 1;
                return Ok(CopyOutcome::Skipped);
            }
        }
    }

    let bytes = std::fs::metadata(src).map(|m| m.len()).unwrap_or(0);
    std::fs::copy(src, dest).map_err(|e| {
        if is_destination_failure(&e) {
            e.to_string()
        } else {
            format!("Copy {} -> {}: {}", src.display(), dest.display(), e)
        }
    })?;
    ctx.files_copied += 1;
    ctx.bytes_copied = ctx.bytes_copied.saturating_add(bytes);
    Ok(CopyOutcome::Copied)
}

enum CopyOutcome {
    Copied,
    Skipped,
}

fn emit_progress(ctx: &mut ExportRunContext, phase: &str, current: Option<&Path>, file_index: u32) {
    let percent = if ctx.bytes_total > 0 {
        Some(
            ((ctx.bytes_copied as f64 / ctx.bytes_total as f64) * 100.0).min(100.0) as f32,
        )
    } else {
        None
    };

    if let Some(pct) = percent {
        let bucket = (pct.floor() as u32).min(100) / 5;
        if phase == "copying" {
            if ctx.last_percent_bucket == Some(bucket) {
                return;
            }
            ctx.last_percent_bucket = Some(bucket);
        }
    }

    if let Some(app) = &ctx.app {
        let _ = app.emit(
            "export-bundle-progress",
            ExportBundleProgress {
                phase: phase.to_string(),
                current_path: current.map(|p| p.to_string_lossy().to_string()),
                file_index,
                file_total: ctx.file_total,
                bytes_copied: ctx.bytes_copied,
                bytes_total: if ctx.bytes_total > 0 {
                    Some(ctx.bytes_total)
                } else {
                    None
                },
                percent,
            },
        );
    }
}

fn sidecar_dest_path(dest_media: &Path, sidecar_src: &Path) -> PathBuf {
    let parent = dest_media.parent().unwrap_or_else(|| Path::new(""));
    let fname = sidecar_src
        .file_name()
        .map(PathBuf::from)
        .unwrap_or_default();
    parent.join(fname)
}

fn dest_stem(dest_media: &Path) -> String {
    dest_media
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("media")
        .to_string()
}

fn copy_media_bundle_for_job(job: &PlannedJob, ctx: &mut ExportRunContext, file_index: u32) -> bool {
    let src_parent = match job.src_media.parent() {
        Some(p) => p,
        None => {
            ctx.warnings
                .push(format!("Invalid media path: {}", job.src_media.display()));
            return false;
        }
    };
    let src_stem = match job.src_media.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s,
        None => {
            ctx.warnings.push(format!(
                "Invalid media file name: {}",
                job.src_media.display()
            ));
            return false;
        }
    };

    emit_progress(ctx, "copying", Some(&job.src_media), file_index);

    match copy_file_skip_if_exists(&job.src_media, &job.dest_media, ctx) {
        Ok(CopyOutcome::Copied) | Ok(CopyOutcome::Skipped) => {}
        Err(e) => {
            if is_destination_failure_display(&e) {
                ctx.warnings.push(e.clone());
                return false;
            }
            ctx.warnings
                .push(format!("Media {}: {}", job.src_media.display(), e));
            return false;
        }
    }

    let dest_parent = job.dest_media.parent().unwrap_or_else(|| Path::new(""));
    let final_stem = dest_stem(&job.dest_media);

    for sidecar in collect_sidecar_sources(src_parent, src_stem) {
        let dest = sidecar_dest_path(&job.dest_media, &sidecar);
        if let Err(e) = copy_file_skip_if_exists(&sidecar, &dest, ctx) {
            if is_destination_failure_display(&e) {
                ctx.warnings.push(e);
                return false;
            }
            ctx.warnings.push(format!(
                "Sidecar {}: {}",
                sidecar.display(),
                e
            ));
        }
    }

    for thumb_src in thumb_dir_candidates(src_parent, src_stem) {
        let thumb_dest = dest_parent
            .join(THUMB_DIR_NAME)
            .join(&final_stem);
        let thumb_root = dest_parent.join(THUMB_DIR_NAME);
        if let Err(e) = copy_dir_all(&thumb_src, &thumb_dest, ctx) {
            let msg = e.to_string();
            if is_destination_failure_display(&msg) {
                ctx.warnings.push(msg);
                return false;
            }
            ctx.warnings.push(format!("Thumbs {}: {}", thumb_src.display(), msg));
        } else {
            hide_thumb_root_if_new(&thumb_root);
        }
    }

    true
}

fn export_timestamp_folder_name() -> String {
    let now = Local::now();
    format!(
        "{}{}",
        EXPORT_SUBFOLDER_PREFIX,
        now.format("%Y-%m-%d %H%M%S")
    )
}

fn is_ruforge_export_bundle_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with(EXPORT_SUBFOLDER_PREFIX))
}

fn resolve_bundle_root(dest_parent: &Path) -> Result<PathBuf, String> {
    if is_ruforge_export_bundle_dir(dest_parent) {
        std::fs::create_dir_all(dest_parent).map_err(|e| {
            format!(
                "Could not access export folder: {} ({})",
                dest_parent.display(),
                e
            )
        })?;
        return Ok(dest_parent.to_path_buf());
    }

    let bundle_root = dest_parent.join(export_timestamp_folder_name());
    std::fs::create_dir_all(&bundle_root).map_err(|e| {
        format!(
            "Could not create export folder: {} ({})",
            bundle_root.display(),
            e
        )
    })?;
    Ok(bundle_root)
}

fn preflight_bytes(jobs: &[PlannedJob], extras: &[(PathBuf, PathBuf)]) -> u64 {
    let mut total = 0u64;
    for job in jobs {
        if let Ok(m) = std::fs::metadata(&job.src_media) {
            total = total.saturating_add(m.len());
        }
        if let Some(parent) = job.src_media.parent() {
            let stem = job
                .src_media
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            for p in collect_sidecar_sources(parent, stem) {
                if let Ok(m) = std::fs::metadata(&p) {
                    total = total.saturating_add(m.len());
                }
            }
        }
    }
    for (src, _) in extras {
        if let Ok(m) = std::fs::metadata(src) {
            total = total.saturating_add(m.len());
        }
    }
    total
}

fn cleanup_bundle_root(bundle_root: &Path) {
    if bundle_root.exists() {
        let _ = std::fs::remove_dir_all(bundle_root);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestFile {
    manifest_version: u32,
    exported_at: String,
    app_version: String,
    entries: Vec<ManifestEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    relative_path: String,
    playback_position_sec: f64,
    duration_sec: f64,
    watched: bool,
    source_path_hint: String,
}

fn write_manifest(
    bundle_root: &Path,
    app_version: &str,
    jobs: &[PlannedJob],
    playback_by_canonical: &HashMap<PathBuf, ExportPlaybackEntry>,
) -> Result<PathBuf, String> {
    let mut entries: Vec<ManifestEntry> = Vec::new();
    for job in jobs {
        let key = canonical_path_key(&job.src_media);
        let playback = playback_by_canonical.get(&key);
        entries.push(ManifestEntry {
            relative_path: job.relative_path.clone(),
            playback_position_sec: playback.map(|p| p.playback_position_sec).unwrap_or(0.0),
            duration_sec: playback.map(|p| p.duration_sec).unwrap_or(0.0),
            watched: playback.map(|p| p.watched).unwrap_or(false),
            source_path_hint: job.source_path_hint.clone(),
        });
    }

    let manifest = ManifestFile {
        manifest_version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        app_version: app_version.to_string(),
        entries,
    };

    let path = bundle_root.join(MANIFEST_FILENAME);
    let json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| {
        if is_destination_failure(&e) {
            e.to_string()
        } else {
            format!("Write manifest: {e}")
        }
    })?;
    Ok(path)
}

struct ExportBlockingArgs {
    app: Option<AppHandle>,
    options: ExportMediaBundleOptions,
    cancel: Arc<AtomicBool>,
    app_version: String,
}

fn run_export_blocking(args: ExportBlockingArgs) -> Result<ExportMediaBundleResult, String> {
    let ExportBlockingArgs {
        app,
        options,
        cancel,
        app_version,
    } = args;

    let dest_parent = PathBuf::from(&options.dest_dir);
    std::fs::create_dir_all(&dest_parent).map_err(|e| {
        format!(
            "Destination folder not writable: {} ({})",
            dest_parent.display(),
            e
        )
    })?;

    let bundle_root = resolve_bundle_root(&dest_parent)?;

    let selections: Vec<PathBuf> = options.paths.iter().map(PathBuf::from).collect();
    let deduped = canonical_path_dedup(selections);

    let mut warnings: Vec<String> = Vec::new();
    let (raw_jobs, extras) = expand_selections(&deduped, &mut warnings);

    if raw_jobs.is_empty() {
        cleanup_bundle_root(&bundle_root);
        return Err("No media files to export.".into());
    }

    let planned = plan_destination_jobs_v2(raw_jobs, &bundle_root);

    let playback_by_canonical: HashMap<PathBuf, ExportPlaybackEntry> = options
        .playback_entries
        .into_iter()
        .map(|e| (canonical_path_key(Path::new(&e.source_path)), e))
        .collect();

    let file_total = planned.len() as u32 + extras.len() as u32;
    let bytes_total = preflight_bytes(&planned, &extras);

    let mut ctx = ExportRunContext {
        app: app.clone(),
        _bundle_root: bundle_root.clone(),
        cancel,
        file_total,
        bytes_total,
        bytes_copied: 0,
        files_copied: 0,
        files_skipped: 0,
        warnings,
        last_percent_bucket: None,
        completed_jobs: Vec::new(),
    };

    emit_progress(&mut ctx, "preparing", None, 0);

    let mut successful = 0u32;
    let mut dest_failed = false;

    for extra in extras.iter() {
        if ctx.cancel.load(Ordering::SeqCst) {
            cleanup_bundle_root(&bundle_root);
            return Ok(ExportMediaBundleResult {
                dest_dir: bundle_root.to_string_lossy().to_string(),
                files_copied: ctx.files_copied,
                files_skipped: ctx.files_skipped,
                bytes_copied: ctx.bytes_copied,
                manifest_path: None,
                cancelled: true,
                warnings: ctx.warnings,
            });
        }
        let (src, rel) = extra;
        let dest = bundle_root.join(rel);
        match copy_file_skip_if_exists(src, &dest, &mut ctx) {
            Ok(_) => successful += 1,
            Err(e) => {
                if is_destination_failure_display(&e) {
                    dest_failed = true;
                    ctx.warnings.push(e);
                    break;
                }
                ctx.warnings
                    .push(format!("folder.jpg {}: {}", src.display(), e));
            }
        }
    }

    for (idx, job) in planned.iter().enumerate() {
        if ctx.cancel.load(Ordering::SeqCst) {
            cleanup_bundle_root(&bundle_root);
            return Ok(ExportMediaBundleResult {
                dest_dir: bundle_root.to_string_lossy().to_string(),
                files_copied: ctx.files_copied,
                files_skipped: ctx.files_skipped,
                bytes_copied: ctx.bytes_copied,
                manifest_path: None,
                cancelled: true,
                warnings: ctx.warnings,
            });
        }

        let file_index = extras.len() as u32 + idx as u32 + 1;
        if copy_media_bundle_for_job(job, &mut ctx, file_index) {
            successful += 1;
            ctx.completed_jobs.push(job.clone());
        } else if ctx
            .warnings
            .last()
            .is_some_and(|w| is_destination_failure_display(w))
        {
            dest_failed = true;
            break;
        }
    }

    if dest_failed {
        cleanup_bundle_root(&bundle_root);
        emit_progress(&mut ctx, "failed", None, file_total);
        let msg = ctx
            .warnings
            .last()
            .cloned()
            .unwrap_or_else(|| "Destination unavailable.".to_string());
        return Err(msg);
    }

    if successful == 0 {
        cleanup_bundle_root(&bundle_root);
        emit_progress(&mut ctx, "failed", None, file_total);
        return Err(
            ctx.warnings
                .first()
                .cloned()
                .unwrap_or_else(|| "Export failed: no files copied.".to_string()),
        );
    }

    let manifest_path = if options.include_manifest {
        emit_progress(&mut ctx, "writing_manifest", None, file_total);
        match write_manifest(
            &bundle_root,
            &app_version,
            &ctx.completed_jobs,
            &playback_by_canonical,
        ) {
            Ok(p) => Some(p.to_string_lossy().to_string()),
            Err(e) => {
                if is_destination_failure_display(&e) {
                    cleanup_bundle_root(&bundle_root);
                    emit_progress(&mut ctx, "failed", None, file_total);
                    return Err(e);
                }
                ctx.warnings.push(format!("Manifest: {e}"));
                None
            }
        }
    } else {
        None
    };

    emit_progress(&mut ctx, "done", None, file_total);

    Ok(ExportMediaBundleResult {
        dest_dir: bundle_root.to_string_lossy().to_string(),
        files_copied: ctx.files_copied,
        files_skipped: ctx.files_skipped,
        bytes_copied: ctx.bytes_copied,
        manifest_path,
        cancelled: false,
        warnings: ctx.warnings,
    })
}

#[tauri::command]
pub fn cancel_export_bundle(state: State<'_, ExportBundleState>) -> Result<(), String> {
    state.cancel.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn export_media_bundle(
    app: AppHandle,
    state: State<'_, ExportBundleState>,
    options: ExportMediaBundleOptions,
) -> Result<ExportMediaBundleResult, String> {
    state.cancel.store(false, Ordering::SeqCst);
    let cancel = state.cancel.clone();
    let app_version = app.package_info().version.to_string();

    let result = tauri::async_runtime::spawn_blocking(move || {
        run_export_blocking(ExportBlockingArgs {
            app: Some(app),
            options,
            cancel,
            app_version,
        })
    })
    .await
    .map_err(|e| format!("Export task join error: {e}"))?;

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_minimal_info_json(path: &Path, with_chapters: bool) {
        let chapters = if with_chapters {
            r#","chapters":[{"title":"Intro","start_time":0.0,"end_time":60.0}]"#
        } else {
            ""
        };
        let json = format!(
            r#"{{"id":"testvid","title":"Test Video","duration":120.0{chapters}}}"#
        );
        std::fs::File::create(path)
            .unwrap()
            .write_all(json.as_bytes())
            .unwrap();
    }

    fn setup_rich_media_fixture(root: &Path) -> PathBuf {
        let media_dir = root.join("My Playlist");
        std::fs::create_dir_all(&media_dir).unwrap();
        let stem = "Ep1";
        let media = media_dir.join(format!("{stem}.mp4"));
        std::fs::write(&media, b"fake-mp4-payload-for-export-test").unwrap();
        write_minimal_info_json(&media_dir.join(format!("{stem}.info.json")), true);
        std::fs::write(media_dir.join(format!("{stem}.jpg")), b"jpg").unwrap();
        std::fs::write(media_dir.join(format!("{stem}.vtt")), b"WEBVTT\n").unwrap();
        std::fs::write(media_dir.join(format!("{stem}.en.vtt")), b"WEBVTT\nen").unwrap();
        std::fs::write(
            media_dir.join(format!("{stem}.sponsorblock.json")),
            br#"{"segments":[]}"#,
        )
        .unwrap();
        std::fs::write(media_dir.join("folder.jpg"), b"stack").unwrap();
        let thumb_dir = media_dir.join(THUMB_DIR_NAME).join(stem);
        std::fs::create_dir_all(&thumb_dir).unwrap();
        std::fs::write(thumb_dir.join(crate::utils::POSTER_FILE), b"poster").unwrap();
        std::fs::write(thumb_dir.join("sprite_001.jpg"), b"sprite").unwrap();
        media
    }

    #[test]
    fn export_round_trip_scan_and_skip_if_exists() {
        let src_root = tempfile::tempdir().unwrap();
        let dest_parent = tempfile::tempdir().unwrap();
        let media = setup_rich_media_fixture(src_root.path());

        let options = ExportMediaBundleOptions {
            paths: vec![media.to_string_lossy().to_string()],
            dest_dir: dest_parent.path().to_string_lossy().to_string(),
            include_manifest: true,
            playback_entries: vec![ExportPlaybackEntry {
                source_path: media.to_string_lossy().to_string(),
                playback_position_sec: 42.0,
                duration_sec: 120.0,
                watched: false,
            }],
        };

        let first = run_export_blocking(ExportBlockingArgs {
            app: None,
            options: options.clone(),
            cancel: Arc::new(AtomicBool::new(false)),
            app_version: "0.1.8".into(),
        })
        .expect("first export");

        assert!(!first.cancelled);
        assert!(first.files_copied > 0);
        let bundle = PathBuf::from(&first.dest_dir);
        assert!(bundle.join("Ep1.mp4").is_file());
        assert!(bundle.join("Ep1.info.json").is_file());
        assert!(bundle.join("Ep1.vtt").is_file());
        assert!(bundle.join("Ep1.en.vtt").is_file());
        assert!(bundle.join("Ep1.sponsorblock.json").is_file());
        assert!(bundle
            .join(THUMB_DIR_NAME)
            .join("Ep1")
            .join(crate::utils::POSTER_FILE)
            .is_file());
        assert!(bundle.join(MANIFEST_FILENAME).is_file());

        let info_txt =
            std::fs::read_to_string(bundle.join("Ep1.info.json")).expect("info.json");
        assert!(info_txt.contains("chapters"));

        let mut ctx = ExportRunContext {
            app: None,
            _bundle_root: bundle.clone(),
            cancel: Arc::new(AtomicBool::new(false)),
            file_total: 1,
            bytes_total: 0,
            bytes_copied: 0,
            files_copied: 0,
            files_skipped: 0,
            warnings: vec![],
            last_percent_bucket: None,
            completed_jobs: vec![],
        };
        let dest_media = bundle.join("Ep1.mp4");
        copy_file_skip_if_exists(&media, &dest_media, &mut ctx).expect("copy");
        assert_eq!(ctx.files_copied, 1);
        copy_file_skip_if_exists(&media, &dest_media, &mut ctx).expect("skip");
        assert_eq!(ctx.files_skipped, 1);

        let second = run_export_blocking(ExportBlockingArgs {
            app: None,
            options: ExportMediaBundleOptions {
                paths: vec![media.to_string_lossy().to_string()],
                dest_dir: bundle.to_string_lossy().to_string(),
                include_manifest: true,
                playback_entries: vec![],
            },
            cancel: Arc::new(AtomicBool::new(false)),
            app_version: "0.1.8".into(),
        })
        .expect("re-export into same bundle");
        assert_eq!(second.dest_dir, bundle.to_string_lossy().to_string());
        assert!(second.files_skipped > 0);
    }

    #[test]
    fn export_playlist_folder_preserves_layout() {
        let src_root = tempfile::tempdir().unwrap();
        let dest_parent = tempfile::tempdir().unwrap();
        let _media = setup_rich_media_fixture(src_root.path());
        let playlist = src_root.path().join("My Playlist");

        let result = run_export_blocking(ExportBlockingArgs {
            app: None,
            options: ExportMediaBundleOptions {
                paths: vec![playlist.to_string_lossy().to_string()],
                dest_dir: dest_parent.path().to_string_lossy().to_string(),
                include_manifest: false,
                playback_entries: vec![],
            },
            cancel: Arc::new(AtomicBool::new(false)),
            app_version: "0.1.8".into(),
        })
        .expect("folder export");

        let bundle = PathBuf::from(&result.dest_dir);
        assert!(bundle.join("My Playlist").join("Ep1.mp4").is_file());
        assert!(bundle.join("My Playlist").join("folder.jpg").is_file());

        assert!(bundle.join("My Playlist").join("Ep1.mp4").is_file());
        assert!(bundle
            .join("My Playlist")
            .join(THUMB_DIR_NAME)
            .join("Ep1")
            .join("poster.jpg")
            .is_file());
    }

    #[test]
    fn skip_if_exists_counts_skipped_not_copied() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src.bin");
        let dest = dir.path().join("dest.bin");
        std::fs::write(&src, b"payload").unwrap();
        let mut ctx = ExportRunContext {
            app: None,
            _bundle_root: dir.path().to_path_buf(),
            cancel: Arc::new(AtomicBool::new(false)),
            file_total: 1,
            bytes_total: 0,
            bytes_copied: 0,
            files_copied: 0,
            files_skipped: 0,
            warnings: vec![],
            last_percent_bucket: None,
            completed_jobs: vec![],
        };
        copy_file_skip_if_exists(&src, &dest, &mut ctx).unwrap();
        assert_eq!(ctx.files_copied, 1);
        copy_file_skip_if_exists(&src, &dest, &mut ctx).unwrap();
        assert_eq!(ctx.files_skipped, 1);
        assert_eq!(ctx.files_copied, 1);
    }

    #[test]
    fn canonical_dedup_folder_wins_over_child_file() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("pl");
        std::fs::create_dir_all(&folder).unwrap();
        let file = folder.join("a.mp4");
        std::fs::write(&file, b"x").unwrap();
        let out = canonical_path_dedup(vec![file.clone(), folder.clone()]);
        assert_eq!(out.len(), 1);
        assert!(out[0].is_dir());
    }
}
