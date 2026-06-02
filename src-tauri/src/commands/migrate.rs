use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::utils::{
    is_any_bucket, is_audio_only_ext, is_media_ext, item_folder_name, vtt_sidecars_for_stem,
    AUDIO_ONLY_EXTS, THUMB_DIR_NAME,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveRecord {
    pub old_media_path: String,
    pub new_media_path: String,
    pub bucket: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateResult {
    pub moves: Vec<MoveRecord>,
    pub warnings: Vec<String>,
    pub dry_run: bool,
    pub bucket_dirs_created: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateOptions {
    pub root: String,
    pub dry_run: bool,
}

fn strip_ytdlp_stream_suffix(stem: &str) -> &str {
    let Some(dot_f) = stem.rfind(".f") else {
        return stem;
    };
    let tail = &stem[dot_f + 2..];
    if tail.is_empty() {
        return stem;
    }
    if tail.chars().all(|c| c.is_ascii_digit() || c == '-' || c == '.') {
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

/// Collect all flat sidecar files next to a media file (does not include the media file itself).
fn collect_sidecar_paths(parent: &Path, stem: &str) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();

    for candidate in stem_candidates(stem) {
        for name in [
            format!("{candidate}.jpg"),
            format!("{candidate}.webp"),
            format!("{candidate}.info.json"),
            format!("{candidate}..info.json"),
            format!("{candidate}.sponsorblock.json"),
            format!("{candidate}.musicmeta.json"),
            format!("{candidate}.comments.json"),
        ] {
            let p = parent.join(&name);
            if p.is_file() && seen.insert(p.clone()) {
                out.push(p);
            }
        }
    }

    if let Ok(vtts) = vtt_sidecars_for_stem(parent, stem) {
        for (p, _) in vtts {
            if seen.insert(p.clone()) {
                out.push(p);
            }
        }
    }

    out
}

/// Collect all .ruforge_thumbs subdirs belonging to this stem.
fn collect_thumb_dirs(parent: &Path, stem: &str) -> Vec<PathBuf> {
    stem_candidates(stem)
        .into_iter()
        .map(|s| parent.join(THUMB_DIR_NAME).join(s))
        .filter(|p| p.is_dir())
        .collect()
}

fn classify_bucket(ext: &str) -> &'static str {
    if is_audio_only_ext(ext) || AUDIO_ONLY_EXTS.contains(&ext.to_ascii_lowercase().as_str()) {
        "Music"
    } else if is_media_ext(ext) {
        "Videos"
    } else {
        "Unsorted"
    }
}

/// Move a directory tree from `src` to `dest` (same-volume rename, or recursive copy+delete).
fn move_dir(src: &Path, dest: &Path) -> Result<(), String> {
    if let Err(_) = std::fs::rename(src, dest) {
        // Cross-volume or other rename failure: copy then remove.
        copy_dir_all(src, dest)?;
        std::fs::remove_dir_all(src).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn copy_dir_all(src: &Path, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let Ok(entries) = std::fs::read_dir(src) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_all(&src_path, &dest_path)?;
        } else {
            std::fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn move_file(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if let Err(_) = std::fs::rename(src, dest) {
        std::fs::copy(src, dest).map_err(|e| format!("copy {}: {}", src.display(), e))?;
        std::fs::remove_file(src).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Move one media item (file + all sidecars + thumb dir) from `src_media` into `dest_item_dir`.
/// The media file and sidecars keep their original filenames.
fn move_item_bundle(
    src_media: &Path,
    dest_item_dir: &Path,
    warnings: &mut Vec<String>,
) {
    let parent = src_media.parent().unwrap_or(Path::new("."));
    let stem = src_media.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let filename = src_media.file_name().and_then(|n| n.to_str()).unwrap_or("");

    // Media file itself
    let dest_media = dest_item_dir.join(filename);
    if let Err(e) = move_file(src_media, &dest_media) {
        warnings.push(format!("move media {}: {}", src_media.display(), e));
        return;
    }

    // Flat sidecars
    for sidecar in collect_sidecar_paths(parent, stem) {
        if let Some(name) = sidecar.file_name() {
            let dest_sidecar = dest_item_dir.join(name);
            if let Err(e) = move_file(&sidecar, &dest_sidecar) {
                warnings.push(format!("move sidecar {}: {}", sidecar.display(), e));
            }
        }
    }

    // .ruforge_thumbs/{stem}/ directories
    for thumb_dir in collect_thumb_dirs(parent, stem) {
        let dir_name = thumb_dir.file_name().and_then(|n| n.to_str()).unwrap_or(stem);
        let dest_thumb = dest_item_dir.join(THUMB_DIR_NAME).join(dir_name);
        if let Err(e) = move_dir(&thumb_dir, &dest_thumb) {
            warnings.push(format!("move thumb dir {}: {}", thumb_dir.display(), e));
        }
    }
}

/// Plan moves for all flat media files at `root` (not already in a bucket dir).
fn plan_flat_items(
    root: &Path,
    moves: &mut Vec<MoveRecord>,
    warnings: &mut Vec<String>,
    used_item_dirs: &mut HashMap<String, HashSet<String>>,
) {
    let Ok(rd) = std::fs::read_dir(root) else {
        return;
    };
    for entry in rd.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
        let ext_str = ext.as_str();
        if !is_media_ext(ext_str) && !AUDIO_ONLY_EXTS.contains(&ext_str) {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        // Skip yt-dlp stream intermediates (e.g. Title.f399.mp4).
        if strip_ytdlp_stream_suffix(stem) != stem {
            warnings.push(format!("skipping stream intermediate: {}", path.display()));
            continue;
        }

        let bucket = classify_bucket(ext_str);
        let bucket_dir = root.join(bucket);
        let used = used_item_dirs.entry(bucket.to_string()).or_default();
        let safe_stem = item_folder_name(stem);
        let folder = unique_item_folder_from_set(&bucket_dir, &safe_stem, used);
        used.insert(folder.clone());

        let new_media_path = bucket_dir.join(&folder).join(
            path.file_name().unwrap_or_default(),
        );
        moves.push(MoveRecord {
            old_media_path: path.to_string_lossy().to_string(),
            new_media_path: new_media_path.to_string_lossy().to_string(),
            bucket: bucket.to_string(),
        });
    }
}

fn unique_item_folder_from_set(bucket_dir: &Path, preferred: &str, used: &HashSet<String>) -> String {
    if !used.contains(preferred) && !bucket_dir.join(preferred).exists() {
        return preferred.to_string();
    }
    let mut n = 2usize;
    loop {
        let candidate = format!("{} ({})", preferred, n);
        if !used.contains(&candidate) && !bucket_dir.join(&candidate).exists() {
            return candidate;
        }
        n += 1;
        if n > 9999 {
            return format!("{} ({})", preferred, n);
        }
    }
}

/// Plan moves for all existing playlist subdirs at `root` → Playlists/{name}/ with nested item dirs.
fn plan_playlist_dirs(
    root: &Path,
    moves: &mut Vec<MoveRecord>,
    warnings: &mut Vec<String>,
    used_playlist_dirs: &mut HashSet<String>,
) {
    let Ok(rd) = std::fs::read_dir(root) else {
        return;
    };
    let playlists_dir = root.join("Playlists");
    let mut entries: Vec<PathBuf> = rd.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entries.sort();

    for playlist_path in entries {
        if !playlist_path.is_dir() {
            continue;
        }
        let playlist_name = match playlist_path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        // Skip bucket dirs (already migrated or reserved), dot dirs, and .ruforge_thumbs.
        if is_any_bucket(playlist_name) || playlist_name.starts_with('.') {
            continue;
        }

        // Determine target playlist folder name (collision-safe under Playlists/).
        let target_playlist_name = {
            let mut name = playlist_name.to_string();
            let mut n = 2usize;
            while used_playlist_dirs.contains(&name) || playlists_dir.join(&name).exists() {
                name = format!("{} ({})", playlist_name, n);
                n += 1;
            }
            name
        };
        used_playlist_dirs.insert(target_playlist_name.clone());
        let target_playlist_dir = playlists_dir.join(&target_playlist_name);

        // Enumerate media files inside this playlist dir (flat + nested up to depth 5).
        let mut used_item_dirs: HashSet<String> = HashSet::new();
        plan_playlist_items(
            &playlist_path,
            &target_playlist_dir,
            moves,
            warnings,
            &mut used_item_dirs,
        );
    }
}

fn plan_playlist_items(
    playlist_src_dir: &Path,
    target_playlist_dir: &Path,
    moves: &mut Vec<MoveRecord>,
    warnings: &mut Vec<String>,
    used_item_dirs: &mut HashSet<String>,
) {
    let Ok(rd) = std::fs::read_dir(playlist_src_dir) else {
        return;
    };
    let mut entries: Vec<PathBuf> = rd.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entries.sort();

    for entry in entries {
        let fname = entry.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if fname.starts_with('.') || fname == THUMB_DIR_NAME {
            continue;
        }
        if entry.is_file() {
            let ext = entry.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
            let ext_str = ext.as_str();
            if !is_media_ext(ext_str) && !AUDIO_ONLY_EXTS.contains(&ext_str) {
                continue;
            }
            let stem = match entry.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s,
                None => continue,
            };
            if strip_ytdlp_stream_suffix(stem) != stem {
                warnings.push(format!("skipping stream intermediate: {}", entry.display()));
                continue;
            }
            let item_name =
                unique_item_folder_from_set(target_playlist_dir, &item_folder_name(stem), used_item_dirs);
            used_item_dirs.insert(item_name.clone());
            let new_media_path = target_playlist_dir
                .join(&item_name)
                .join(entry.file_name().unwrap_or_default());
            moves.push(MoveRecord {
                old_media_path: entry.to_string_lossy().to_string(),
                new_media_path: new_media_path.to_string_lossy().to_string(),
                bucket: "Playlists".to_string(),
            });
        } else if entry.is_dir() {
            // Nested existing subdir (unlikely but handle it recursively).
            plan_playlist_items(
                &entry,
                target_playlist_dir,
                moves,
                warnings,
                used_item_dirs,
            );
        }
    }
}

fn execute_moves(
    root: &Path,
    moves: &[MoveRecord],
    warnings: &mut Vec<String>,
    bucket_dirs_created: &mut Vec<String>,
) {
    let mut created_buckets: HashSet<String> = HashSet::new();

    for record in moves {
        let new_path = Path::new(&record.new_media_path);
        let bucket_dir = root.join(&record.bucket);

        // Create bucket dir if needed.
        if !created_buckets.contains(&record.bucket) && !bucket_dir.exists() {
            if let Err(e) = std::fs::create_dir_all(&bucket_dir) {
                warnings.push(format!("create bucket dir {}: {}", bucket_dir.display(), e));
                continue;
            }
            created_buckets.insert(record.bucket.clone());
            bucket_dirs_created.push(bucket_dir.to_string_lossy().to_string());
        }

        // Create item dir.
        let item_dir = match new_path.parent() {
            Some(p) => p,
            None => {
                warnings.push(format!("no parent for {}", new_path.display()));
                continue;
            }
        };
        if let Err(e) = std::fs::create_dir_all(item_dir) {
            warnings.push(format!("create item dir {}: {}", item_dir.display(), e));
            continue;
        }

        // Move media + sidecars + thumb dir.
        move_item_bundle(Path::new(&record.old_media_path), item_dir, warnings);

        // For Playlists: also move folder.jpg if the src playlist dir's folder.jpg exists.
        if record.bucket == "Playlists" {
            let src_media = Path::new(&record.old_media_path);
            // folder.jpg lives in the playlist-level dir (parent of item dir in target = playlist dir in src).
            if let Some(src_playlist_dir) = src_media.parent() {
                let src_folder_jpg = src_playlist_dir.join("folder.jpg");
                if src_folder_jpg.is_file() {
                    if let Some(target_playlist_dir) = item_dir.parent() {
                        let dest_folder_jpg = target_playlist_dir.join("folder.jpg");
                        if !dest_folder_jpg.exists() {
                            let _ = std::fs::copy(&src_folder_jpg, &dest_folder_jpg);
                        }
                    }
                }
            }
        }
    }

    // After all items moved, clean up empty source directories.
    cleanup_empty_source_dirs(root, moves, warnings);

    // Create reserved bucket dirs (Movies, Shows) so they exist for the user.
    for reserved in ["Movies", "Shows"] {
        let d = root.join(reserved);
        if !d.exists() {
            let _ = std::fs::create_dir_all(&d);
            bucket_dirs_created.push(d.to_string_lossy().to_string());
        }
    }
}

fn cleanup_empty_source_dirs(root: &Path, moves: &[MoveRecord], warnings: &mut Vec<String>) {
    // Collect unique source directories (original media parents, and their parents if playlist).
    let mut src_dirs: HashSet<PathBuf> = HashSet::new();
    for record in moves {
        let src = Path::new(&record.old_media_path);
        if let Some(parent) = src.parent() {
            src_dirs.insert(parent.to_path_buf());
            // Also collect the grandparent (playlist dir before migration).
            if let Some(grandparent) = parent.parent() {
                if grandparent != root {
                    src_dirs.insert(grandparent.to_path_buf());
                }
            }
        }
    }

    // Sort by depth (deepest first) so we can remove inner-empty dirs before their parents.
    let mut sorted: Vec<PathBuf> = src_dirs.into_iter().collect();
    sorted.sort_by(|a, b| {
        b.components().count().cmp(&a.components().count())
    });

    for dir in sorted {
        // Do not remove the root itself or bucket dirs.
        if dir == root {
            continue;
        }
        if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
            if is_any_bucket(name) {
                continue;
            }
        }
        if dir.is_dir() && is_dir_empty(&dir) {
            if let Err(e) = std::fs::remove_dir(&dir) {
                warnings.push(format!("remove empty dir {}: {}", dir.display(), e));
            }
        }
    }
}

fn is_dir_empty(dir: &Path) -> bool {
    std::fs::read_dir(dir)
        .map(|mut rd| rd.next().is_none())
        .unwrap_or(false)
}

#[tauri::command]
pub fn migrate_library_layout(options: MigrateOptions) -> Result<MigrateResult, String> {
    let root = Path::new(&options.root);
    if !root.is_dir() {
        return Err(format!("Library root does not exist: {}", root.display()));
    }

    let mut moves: Vec<MoveRecord> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut used_item_dirs: HashMap<String, HashSet<String>> = HashMap::new();
    let mut used_playlist_dirs: HashSet<String> = HashSet::new();

    plan_flat_items(root, &mut moves, &mut warnings, &mut used_item_dirs);
    plan_playlist_dirs(root, &mut moves, &mut warnings, &mut used_playlist_dirs);

    let mut bucket_dirs_created: Vec<String> = Vec::new();

    if !options.dry_run {
        execute_moves(root, &moves, &mut warnings, &mut bucket_dirs_created);
    }

    Ok(MigrateResult {
        moves,
        warnings,
        dry_run: options.dry_run,
        bucket_dirs_created,
    })
}
