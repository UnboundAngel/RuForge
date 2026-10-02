use std::path::{Path, PathBuf};

use crate::commands::gallery::strip_ytdlp_stream_suffix;

/// Paths one yt-dlp process named on its own stdout. Cleanup and the post-processing
/// heartbeat only look at these, so files from other downloads or the user are never touched.
#[derive(Debug, Clone, Default)]
pub struct JobArtifacts {
    output_dir: PathBuf,
    downloads: Vec<PathBuf>,
    already_downloaded: Vec<PathBuf>,
    merges: Vec<PathBuf>,
    extractions: Vec<PathBuf>,
    /// Same-base siblings already on disk when a source was first named; never this run's output.
    preexisting: Vec<PathBuf>,
    post_processing: bool,
}

const POST_PROCESS_TAGS: &[&str] = &[
    "[ExtractAudio]",
    "[Merger]",
    "[ffmpeg]",
    "[Fixup",
    "[VideoConvertor]",
    "[VideoRemuxer]",
    "[EmbedSubtitle]",
    "[Metadata]",
    "[SubtitlesConvertor]",
    "[Concat]",
];

impl JobArtifacts {
    pub fn new(output_dir: &Path) -> Self {
        Self {
            output_dir: output_dir.to_path_buf(),
            ..Self::default()
        }
    }

    pub fn post_processing(&self) -> bool {
        self.post_processing
    }

    pub fn observe_line(&mut self, line: &str) {
        let line = line.trim();
        if POST_PROCESS_TAGS.iter().any(|t| line.starts_with(t)) {
            self.post_processing = true;
        }
        if let Some(rest) = line.strip_prefix("[download] Destination:") {
            if let Some(p) = self.resolve(rest) {
                self.snapshot_siblings(&p);
                push_unique(&mut self.downloads, p);
            }
        } else if let Some(rest) = line
            .strip_prefix("[download] ")
            .and_then(|r| r.strip_suffix(" has already been downloaded"))
        {
            if let Some(p) = self.resolve(rest) {
                self.snapshot_siblings(&p);
                push_unique(&mut self.already_downloaded, p);
            }
        } else if let Some(rest) = line.strip_prefix("[ExtractAudio] Destination:") {
            if let Some(p) = self.resolve(rest) {
                push_unique(&mut self.extractions, p);
            }
        } else if let Some(rest) = line.strip_prefix("[Merger] Merging formats into") {
            if let Some(p) = self.resolve(rest) {
                push_unique(&mut self.merges, p);
            }
        }
    }

    fn resolve(&self, raw: &str) -> Option<PathBuf> {
        let raw = raw.trim().trim_matches('"').trim();
        if raw.is_empty() {
            return None;
        }
        let p = PathBuf::from(raw);
        Some(if p.is_absolute() { p } else { self.output_dir.join(p) })
    }

    fn snapshot_siblings(&mut self, source: &Path) {
        let (Some(parent), Some(base)) = (source.parent(), base_stem(source)) else {
            return;
        };
        let Ok(rd) = std::fs::read_dir(parent) else {
            return;
        };
        for entry in rd.flatten() {
            let p = entry.path();
            let same_base = p
                .file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|s| s.eq_ignore_ascii_case(base));
            if same_base && p.is_file() {
                push_unique(&mut self.preexisting, p);
            }
        }
    }

    fn sources(&self) -> impl Iterator<Item = &PathBuf> {
        self.downloads.iter().chain(self.already_downloaded.iter())
    }

    fn named(&self) -> impl Iterator<Item = &PathBuf> {
        self.sources()
            .chain(self.merges.iter())
            .chain(self.extractions.iter())
    }

    /// Bytes currently on disk for this job's outputs, including ffmpeg's `.temp` files.
    pub fn output_bytes(&self) -> u64 {
        let mut paths: Vec<PathBuf> = Vec::new();
        for p in self.named() {
            push_unique(&mut paths, p.clone());
            push_unique(&mut paths, temp_variant(p));
        }
        paths
            .into_iter()
            .filter_map(|p| std::fs::metadata(p).ok())
            .filter(|m| m.is_file())
            .map(|m| m.len())
            .sum()
    }

    /// Audio extraction writes straight to the final name, so a killed extraction leaves a
    /// truncated file that looks complete. yt-dlp removes the source only after extraction
    /// succeeds, so a surviving source marks the output as unfinished.
    pub fn partial_extractions(&self, finals: &[PathBuf]) -> Vec<PathBuf> {
        self.extractions
            .iter()
            .filter(|p| !contains_path(finals, p) && !contains_path(&self.preexisting, p))
            .filter(|p| !self.sources().any(|src| path_key(src) == path_key(p)))
            .filter(|p| {
                self.sources()
                    .any(|src| src.is_file() && matches_final_base(src, std::slice::from_ref(p)))
            })
            .filter(|p| p.is_file())
            .cloned()
            .collect()
    }

    /// Leftover partials, `.fNNN` streams and `.temp` merges from this run whose base name
    /// matches a final file this run reported in the same folder.
    pub fn leftover_intermediates(&self, finals: &[PathBuf]) -> Vec<PathBuf> {
        if finals.is_empty() {
            return Vec::new();
        }
        let mut out: Vec<PathBuf> = Vec::new();
        for named in self.downloads.iter().chain(self.merges.iter()) {
            if !matches_final_base(named, finals) {
                continue;
            }
            let mut candidates = vec![
                with_appended_ext(named, "part"),
                with_appended_ext(named, "ytdl"),
                temp_variant(named),
            ];
            if is_stream_intermediate(named) {
                candidates.push(named.clone());
            }
            for c in candidates {
                if c.is_file() && !contains_path(finals, &c) && !contains_path(&out, &c) {
                    out.push(c);
                }
            }
        }
        out
    }
}

/// Moves files to the recycle bin. Failures are logged and the file is left alone.
pub fn trash_job_files(paths: &[PathBuf], reason: &str) {
    for path in paths {
        match trash::delete(path) {
            Ok(()) => crate::rf_log!(
                "download.jobs",
                log::Level::Info,
                "trashed {reason} {:?}",
                path
            ),
            Err(e) => crate::rf_log!(
                "download.jobs",
                log::Level::Warn,
                "could not trash {reason} {:?}: {e}",
                path
            ),
        }
    }
}

fn push_unique(list: &mut Vec<PathBuf>, p: PathBuf) {
    if !contains_path(list, &p) {
        list.push(p);
    }
}

fn path_key(p: &Path) -> String {
    p.to_string_lossy().replace('/', "\\").to_lowercase()
}

fn contains_path(list: &[PathBuf], p: &Path) -> bool {
    let key = path_key(p);
    list.iter().any(|q| path_key(q) == key)
}

fn base_stem(p: &Path) -> Option<&str> {
    p.file_stem()
        .and_then(|s| s.to_str())
        .map(strip_ytdlp_stream_suffix)
}

fn is_stream_intermediate(p: &Path) -> bool {
    p.file_stem()
        .and_then(|s| s.to_str())
        .is_some_and(|stem| strip_ytdlp_stream_suffix(stem) != stem)
}

fn matches_final_base(named: &Path, finals: &[PathBuf]) -> bool {
    let (Some(parent), Some(base)) = (named.parent(), base_stem(named)) else {
        return false;
    };
    finals.iter().any(|f| {
        f.parent().is_some_and(|fp| path_key(fp) == path_key(parent))
            && f.file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|s| s.eq_ignore_ascii_case(base))
    })
}

fn with_appended_ext(p: &Path, ext: &str) -> PathBuf {
    let mut s = p.as_os_str().to_os_string();
    s.push(".");
    s.push(ext);
    PathBuf::from(s)
}

/// yt-dlp's `prepend_extension(path, "temp")`: `X.mp4` becomes `X.temp.mp4`.
fn temp_variant(p: &Path) -> PathBuf {
    match (p.file_stem(), p.extension()) {
        (Some(stem), Some(ext)) => {
            let mut name = stem.to_os_string();
            name.push(".temp.");
            name.push(ext);
            p.with_file_name(name)
        }
        _ => with_appended_ext(p, "temp"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ruforge_artifacts_{tag}_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn touch(p: &Path) {
        std::fs::write(p, b"x").unwrap();
    }

    #[test]
    fn sweep_never_touches_user_files_sharing_a_title() {
        let dir = scratch("clip");
        let clip_mp4 = dir.join("Clip.mp4");
        let clip_mkv = dir.join("Clip.mkv");
        let clip_stream = dir.join("Clip.f137.mp4");
        let final_mp4 = dir.join("New.mp4");
        let stream_v = dir.join("New.f137.mp4");
        let stream_a = dir.join("New.f251.webm");
        let merge_temp = dir.join("New.temp.mp4");
        for p in [&clip_mp4, &clip_mkv, &clip_stream, &final_mp4, &stream_v, &stream_a, &merge_temp] {
            touch(p);
        }

        let mut job = JobArtifacts::new(&dir);
        job.observe_line(&format!("[download] Destination: {}", stream_v.display()));
        job.observe_line(&format!("[download] Destination: {}", stream_a.display()));
        job.observe_line(&format!("[Merger] Merging formats into \"{}\"", final_mp4.display()));

        let doomed = job.leftover_intermediates(&[final_mp4.clone()]);
        assert!(contains_path(&doomed, &stream_v));
        assert!(contains_path(&doomed, &stream_a));
        assert!(contains_path(&doomed, &merge_temp));
        for kept in [&clip_mp4, &clip_mkv, &clip_stream, &final_mp4] {
            assert!(!contains_path(&doomed, kept), "{kept:?} must survive");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sweep_does_nothing_without_a_reported_final() {
        let dir = scratch("nofinal");
        let stream_v = dir.join("New.f137.mp4");
        touch(&stream_v);
        let mut job = JobArtifacts::new(&dir);
        job.observe_line(&format!("[download] Destination: {}", stream_v.display()));
        assert!(job.leftover_intermediates(&[]).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sweep_ignores_streams_of_a_different_final() {
        let dir = scratch("otherfinal");
        let stream_v = dir.join("Old.f137.mp4");
        touch(&stream_v);
        let mut job = JobArtifacts::new(&dir);
        job.observe_line(&format!("[download] Destination: {}", stream_v.display()));
        assert!(job.leftover_intermediates(&[dir.join("New.mp4")]).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn relative_destinations_resolve_against_output_dir() {
        let dir = scratch("relative");
        let mut job = JobArtifacts::new(&dir);
        job.observe_line("[download] Destination: Videos/New.f137.mp4");
        assert_eq!(job.downloads, vec![dir.join("Videos/New.f137.mp4")]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn partial_extraction_flagged_only_when_not_reported_and_not_the_source() {
        let dir = scratch("extract");
        let source = dir.join("Song.webm");
        let mp3 = dir.join("Song.mp3");
        touch(&source);
        let mut job = JobArtifacts::new(&dir);
        job.observe_line(&format!("[download] Destination: {}", source.display()));
        touch(&mp3);
        job.observe_line(&format!("[ExtractAudio] Destination: {}", mp3.display()));

        assert_eq!(job.partial_extractions(&[]), vec![mp3.clone()]);
        assert!(job.partial_extractions(&[mp3.clone()]).is_empty());

        std::fs::remove_file(&source).unwrap();
        assert!(job.partial_extractions(&[]).is_empty(), "finished extraction must stay");
        touch(&source);

        let mut same = JobArtifacts::new(&dir);
        same.observe_line(&format!("[download] Destination: {}", source.display()));
        same.observe_line(&format!("[ExtractAudio] Destination: {}", source.display()));
        assert!(same.partial_extractions(&[]).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn output_bytes_counts_temp_merge_file() {
        let dir = scratch("bytes");
        let final_mp4 = dir.join("New.mp4");
        std::fs::write(dir.join("New.temp.mp4"), vec![0u8; 10]).unwrap();
        let mut job = JobArtifacts::new(&dir);
        job.observe_line(&format!("[Merger] Merging formats into \"{}\"", final_mp4.display()));
        assert_eq!(job.output_bytes(), 10);
        std::fs::write(dir.join("New.temp.mp4"), vec![0u8; 25]).unwrap();
        assert_eq!(job.output_bytes(), 25);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pause_never_recycles_a_song_that_existed_before_the_run() {
        let dir = scratch("preexisting");
        let source = dir.join("Café 日本.webm");
        let mp3 = dir.join("Café 日本.mp3");
        std::fs::write(&mp3, vec![7u8; 64]).unwrap();
        touch(&source);
        let mut job = JobArtifacts::new(&dir);
        job.observe_line(&format!("[download] Destination: {}", source.display()));
        job.observe_line(&format!("[ExtractAudio] Destination: {}", mp3.display()));
        assert!(job.partial_extractions(&[]).is_empty());

        let mut resumed = JobArtifacts::new(&dir);
        resumed.observe_line(&format!("[download] {} has already been downloaded", source.display()));
        resumed.observe_line(&format!("[ExtractAudio] Destination: {}", mp3.display()));
        assert!(resumed.partial_extractions(&[]).is_empty());
        assert_eq!(std::fs::read(&mp3).unwrap().len(), 64);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resumed_run_flags_only_its_own_new_extraction() {
        let dir = scratch("resumed");
        let source = dir.join("Song.webm");
        let mp3 = dir.join("Song.mp3");
        touch(&source);
        let mut job = JobArtifacts::new(&dir);
        job.observe_line(&format!("[download] {} has already been downloaded", source.display()));
        job.observe_line("[download] 100% of   10.00MiB");
        job.observe_line(&format!("[ExtractAudio] Destination: {}", mp3.display()));
        touch(&mp3);
        assert_eq!(job.partial_extractions(&[]), vec![mp3.clone()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn assert_watches_growth(job: &JobArtifacts, written: &Path) {
        assert!(job.post_processing());
        std::fs::write(written, vec![0u8; 100]).unwrap();
        let before = job.output_bytes();
        std::fs::write(written, vec![0u8; 300]).unwrap();
        assert_eq!(job.output_bytes(), before + 200, "{written:?} growth must be seen");
    }

    #[test]
    fn heartbeat_watches_ffmpeg_output_for_every_audio_format() {
        for (src_ext, fmt) in [
            ("webm", "m4a"),
            ("webm", "mp3"),
            ("webm", "opus"),
            ("m4a", "mp3"),
            ("m4a", "opus"),
        ] {
            let dir = scratch(&format!("hb_{src_ext}_{fmt}"));
            let source = dir.join(format!("Café 日本.{src_ext}"));
            let out = dir.join(format!("Café 日本.{fmt}"));
            touch(&source);
            let mut job = JobArtifacts::new(&dir);
            job.observe_line(&format!("[download] Destination: {}", source.display()));
            assert!(!job.post_processing());
            job.observe_line(&format!("[ExtractAudio] Destination: {}", out.display()));
            assert_watches_growth(&job, &out);
            let _ = std::fs::remove_dir_all(&dir);
        }
    }

    #[test]
    fn heartbeat_watches_temp_name_for_same_extension_and_fixups() {
        let dir = scratch("hb_temp");
        let source = dir.join("Song.m4a");
        touch(&source);
        let mut job = JobArtifacts::new(&dir);
        job.observe_line(&format!("[download] Destination: {}", source.display()));
        job.observe_line(&format!("[FixupM4a] Correcting container of \"{}\"", source.display()));
        assert_watches_growth(&job, &dir.join("Song.temp.m4a"));

        let mut resumed = JobArtifacts::new(&dir);
        resumed.observe_line(&format!("[download] {} has already been downloaded", source.display()));
        resumed.observe_line(&format!("[ExtractAudio] Destination: {}", source.display()));
        assert_watches_growth(&resumed, &dir.join("Song.temp.m4a"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn heartbeat_starts_on_resumed_extraction_without_progress_line() {
        let dir = scratch("hb_resume");
        let source = dir.join("Song.webm");
        let out = dir.join("Song.mp3");
        touch(&source);
        let mut job = JobArtifacts::new(&dir);
        job.observe_line(&format!("[download] {} has already been downloaded", source.display()));
        job.observe_line(&format!("[ExtractAudio] Destination: {}", out.display()));
        assert_watches_growth(&job, &out);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
