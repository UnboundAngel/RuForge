use std::path::{Path, PathBuf};

pub const THUMB_DIR_NAME: &str = ".ruforge_thumbs";
pub const POSTER_FILE: &str = "poster.jpg";
pub const MEDIA_EXTS: &[&str] = &["mp4", "mkv", "webm", "mp3", "m4a", "flac", "opus", "ogg"];

#[inline]
pub fn is_media_ext(ext: &str) -> bool {
    MEDIA_EXTS.contains(&ext)
}

/// Sidecar WebVTT next to a media file: `{stem}.vtt` (lang `und`) or `{stem}.{lang}.vtt`.
pub fn vtt_sidecars_for_stem(parent: &Path, stem: &str) -> std::io::Result<Vec<(PathBuf, String)>> {
    let prefix = format!("{stem}.");
    let mut out = Vec::new();
    let read_dir = match std::fs::read_dir(parent) {
        Ok(rd) => rd,
        Err(e) => return Err(e),
    };
    for entry in read_dir {
        let entry = entry?;
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        if p.extension().and_then(|e| e.to_str()) != Some("vtt") {
            continue;
        }
        let fname = match p.file_name().and_then(|n| n.to_str()) {
            Some(f) => f.to_string(),
            None => continue,
        };
        if fname == format!("{stem}.vtt") {
            out.push((p, "und".to_string()));
            continue;
        }
        if !fname.starts_with(&prefix) || !fname.ends_with(".vtt") {
            continue;
        }
        let lang_part = &fname[prefix.len()..fname.len() - 4];
        if lang_part.is_empty() {
            continue;
        }
        out.push((p, lang_part.to_ascii_lowercase()));
    }
    Ok(out)
}

/// Same ordering as subtitle track pickers: `und` first, then language tag.
pub fn sort_vtt_sidecars_lang_first(pairs: &mut Vec<(PathBuf, String)>) {
    pairs.sort_by(|a, b| {
        let rank = |l: &str| -> u8 {
            if l == "und" {
                0
            } else {
                1
            }
        };
        rank(a.1.as_str())
            .cmp(&rank(b.1.as_str()))
            .then_with(|| a.1.cmp(&b.1))
    });
}

/// One representative path for gallery metadata (matches first track order from [`vtt_sidecars_for_stem`]).
pub fn primary_vtt_sidecar(parent: &Path, stem: &str) -> Option<PathBuf> {
    let mut pairs = vtt_sidecars_for_stem(parent, stem).ok()?;
    if pairs.is_empty() {
        return None;
    }
    sort_vtt_sidecars_lang_first(&mut pairs);
    pairs.into_iter().next().map(|(p, _)| p)
}
