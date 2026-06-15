use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::media_bundle::strip_ytdlp_stream_suffix;
use crate::utils::{is_audio_only_ext, resolve_info_json_path, THUMB_DIR_NAME};

const MB_API_BASE: &str = "https://musicbrainz.org/ws/2";
const MB_SCORE_FLOOR: u32 = 90;
const SIDECAR_SCHEMA_VERSION: u32 = 2;
const ARTIST_META_SCHEMA_VERSION: u32 = 1;
const RATE_LIMIT_MS: u64 = 1100;

static MB_RATE_GATE: OnceLock<tokio::sync::Mutex<Instant>> = OnceLock::new();

fn mb_rate_gate() -> &'static tokio::sync::Mutex<Instant> {
    MB_RATE_GATE.get_or_init(|| {
        tokio::sync::Mutex::new(Instant::now() - Duration::from_secs(2))
    })
}

fn user_agent() -> String {
    format!(
        "RuForge/{} ( https://ruforge.app )",
        env!("CARGO_PKG_VERSION")
    )
}

// ---- Sidecar types -------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMetaYoutubeDto {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub like_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMetaSidecarDto {
    pub schema_version: u32,
    pub enriched_at: String,
    pub identity_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mb_recording_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mb_release_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mb_release_group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_confidence: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube: Option<MusicMetaYoutubeDto>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_mb_id: Option<String>,
}

pub fn sidecar_needs_artist_tags(dto: &MusicMetaSidecarDto) -> bool {
    dto.genres.is_empty() && dto.artist_mb_id.is_none()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMetaBackfillProgress {
    pub done: u32,
    pub total: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_title: Option<String>,
}

// ---- Internal helpers ----------------------------------------------------

struct TagMeta {
    artist: Option<String>,
    album: Option<String>,
    title: Option<String>,
    has_embedded_cover: bool,
}

struct YtMeta {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    snapshot: MusicMetaYoutubeDto,
}

struct MbResult {
    recording_id: String,
    release_id: String,
    release_group_id: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    title: Option<String>,
    year: Option<u32>,
    score: u32,
}

fn iso_now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn sidecar_path_for(parent: &Path, stem: &str) -> PathBuf {
    parent.join(format!("{stem}.musicmeta.json"))
}

fn read_sidecar(path: &Path) -> Option<MusicMetaSidecarDto> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_sidecar(path: &Path, dto: &MusicMetaSidecarDto) -> bool {
    let Ok(json) = serde_json::to_string_pretty(dto) else {
        return false;
    };
    std::fs::write(path, json).is_ok()
}

fn read_json_sidecar<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_json_sidecar<T: Serialize>(path: &Path, dto: &T) -> bool {
    let Ok(json) = serde_json::to_string_pretty(dto) else {
        return false;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(path, json).is_ok()
}

// ---- Title cleaning -------------------------------------------------------

/// Strip YouTube noise so the raw title matches MusicBrainz canonical form.
/// Operates on suffixes only; do not mutate artist-feat patterns mid-string.
pub fn clean_music_title(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    if s.is_empty() {
        return s;
    }

    // Strip prod. ... suffix (everything from "prod." to end, across case)
    if let Some(idx) = s.to_lowercase().find("prod.") {
        s = s[..idx].trim_end_matches('-').trim_end().to_string();
    }

    // Strip known noise tokens that appear as trailing bracketed/parenthetical suffixes.
    // We loop because there may be multiple stacked: "Title (Official Video) [HD]".
    const NOISE: &[&str] = &[
        "official music video",
        "official video",
        "official audio",
        "official lyric video",
        "official visualizer",
        "lyric video",
        "lyrics",
        "audio",
        "visualizer",
        "hd",
        "4k",
        "8k",
    ];

    loop {
        let lower = s.to_lowercase();
        let mut hit = false;

        for noise in NOISE {
            // Match "(...noise...)" or "[...noise...]" at end, with optional extra words inside
            for (open, close) in [('(', ')'), ('[', ']')] {
                if let Some(end) = lower.rfind(close) {
                    if end + 1 == lower.len() {
                        if let Some(start) = lower[..end].rfind(open) {
                            let inner = lower[start + 1..end].trim();
                            if inner == *noise || inner.starts_with(&format!("{noise} ")) || inner.ends_with(&format!(" {noise}")) || inner.contains(noise) {
                                s = s[..start].trim_end_matches('-').trim_end().to_string();
                                hit = true;
                                break;
                            }
                        }
                    }
                }
                if hit {
                    break;
                }
            }
            if hit {
                break;
            }
        }

        // Also strip bare suffix after " - " separator: "Title - Official Video"
        if !hit {
            let lower2 = s.to_lowercase();
            for noise in NOISE {
                if lower2.ends_with(noise) {
                    let candidate = &s[..s.len() - noise.len()];
                    let candidate = candidate.trim_end_matches('-').trim_end();
                    if candidate.len() < s.len() {
                        s = candidate.to_string();
                        hit = true;
                        break;
                    }
                }
            }
        }

        if !hit {
            break;
        }
    }

    // Collapse whitespace
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

// ---- Tag reading ---------------------------------------------------------

fn read_tags(file_path: &Path) -> TagMeta {
    use lofty::prelude::*;
    use lofty::probe::Probe;

    let mut artist = None;
    let mut album = None;
    let mut title = None;
    let mut has_embedded_cover = false;

    if let Ok(tagged) = Probe::open(file_path).and_then(|p| p.read()) {
        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            use lofty::tag::Accessor;
            if let Some(v) = tag.artist().map(|s| s.to_string()).filter(|s| !s.is_empty()) {
                artist = Some(v);
            }
            if let Some(v) = tag.album().map(|s| s.to_string()).filter(|s| !s.is_empty()) {
                album = Some(v);
            }
            if let Some(v) = tag.title().map(|s| s.to_string()).filter(|s| !s.is_empty()) {
                title = Some(v);
            }
            has_embedded_cover = tag.pictures().first().is_some();
        }
    }

    TagMeta { artist, album, title, has_embedded_cover }
}

// ---- .info.json reading --------------------------------------------------

fn read_yt_meta(info_json: Option<&serde_json::Value>) -> YtMeta {
    let empty_snapshot = MusicMetaYoutubeDto {
        view_count: None,
        like_count: None,
        upload_date: None,
        description: None,
        source_url: None,
        source_id: None,
    };

    let Some(j) = info_json else {
        return YtMeta { title: None, artist: None, album: None, snapshot: empty_snapshot };
    };

    let title = j["title"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| clean_music_title(s));

    let artist = j["artist"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| j["uploader"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from))
        .or_else(|| j["creator"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from));

    let album = j["album"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);

    let snapshot = MusicMetaYoutubeDto {
        view_count: j["view_count"].as_u64()
            .or_else(|| j["view_count"].as_i64().map(|v| v.max(0) as u64)),
        like_count: j["like_count"].as_u64()
            .or_else(|| j["like_count"].as_i64().map(|v| v.max(0) as u64)),
        upload_date: j["upload_date"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from),
        description: j["description"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from),
        source_url: j["webpage_url"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from),
        source_id: j["id"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from),
    };

    YtMeta { title, artist, album, snapshot }
}

// ---- Stem heuristics -----------------------------------------------------

fn artist_from_stem(stem: &str) -> Option<String> {
    stem.find(" - ").map(|i| stem[..i].trim().to_string()).filter(|s| !s.is_empty())
}

fn title_from_stem(stem: &str) -> String {
    if let Some(i) = stem.find(" - ") {
        let t = stem[i + 3..].trim();
        if !t.is_empty() {
            return clean_music_title(t);
        }
    }
    clean_music_title(stem)
}

fn normalize_identity_token(raw: &str) -> String {
    raw.trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Topic/single uploads often repeat the track title as the album name.
fn drop_single_track_pseudo_album(album: Option<String>, title: &Option<String>) -> Option<String> {
    let album = album?;
    let title = title.as_ref()?.trim();
    if title.is_empty() {
        return Some(album);
    }
    if normalize_identity_token(&album) == normalize_identity_token(title) {
        return None;
    }
    Some(album)
}

// ---- Cover existence check -----------------------------------------------

fn local_cover_exists(parent: &Path, stem: &str, has_embedded_cover: bool) -> bool {
    if has_embedded_cover {
        return true;
    }
    // Lofty already extracted to this path if there was embedded art
    if parent.join(THUMB_DIR_NAME).join(stem).join("music_cover.jpg").is_file() {
        return true;
    }
    // yt-dlp thumbnail sidecar
    parent.join(format!("{stem}.jpg")).is_file() || parent.join(format!("{stem}.webp")).is_file()
}

// ---- Rate gate -----------------------------------------------------------

async fn rate_gate_wait() {
    let gate = mb_rate_gate();
    let mut last = gate.lock().await;
    let elapsed = last.elapsed();
    if elapsed < Duration::from_millis(RATE_LIMIT_MS) {
        tokio::time::sleep(Duration::from_millis(RATE_LIMIT_MS) - elapsed).await;
    }
    *last = Instant::now();
}

fn build_http_client() -> Option<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(user_agent())
        .build()
        .ok()
}

// ---- MusicBrainz lookup --------------------------------------------------

fn parse_year(date_str: &str) -> Option<u32> {
    let digits: String = date_str.chars().take(4).filter(|c| c.is_ascii_digit()).collect();
    if digits.len() == 4 { digits.parse().ok() } else { None }
}

async fn search_mb_recording(title: &str, artist: &str) -> Option<MbResult> {
    let client = build_http_client()?;
    let query = format!(r#"recording:"{title}" AND artist:"{artist}""#);

    rate_gate_wait().await;

    let resp = client
        .get(format!("{MB_API_BASE}/recording"))
        .query(&[("query", query.as_str()), ("fmt", "json")])
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let json: serde_json::Value = resp.json().await.ok()?;
    let rec = json["recordings"].as_array()?.first()?;

    let score = rec["score"].as_u64().unwrap_or(0) as u32;
    if score < MB_SCORE_FLOOR {
        return None;
    }

    let recording_id = rec["id"].as_str()?.to_string();
    let mb_title = rec["title"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from);

    let mb_artist = rec["artist-credit"]
        .as_array()
        .and_then(|credits| credits.first())
        .and_then(|c| c["name"].as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);

    let release = rec["releases"].as_array()?.first()?;
    let release_id = release["id"].as_str()?.to_string();
    let release_group_id = release["release-group"]["id"].as_str().map(String::from);
    let mb_album = release["title"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let year = release["date"].as_str().and_then(parse_year);

    Some(MbResult {
        recording_id,
        release_id,
        release_group_id,
        artist: mb_artist,
        album: mb_album,
        title: mb_title,
        year,
        score,
    })
}

// ---- Cover Art Archive fetch ---------------------------------------------

async fn fetch_caa_cover(release_id: &str) -> Option<Vec<u8>> {
    let client = build_http_client()?;

    rate_gate_wait().await;

    let resp = client
        .get(format!("https://coverartarchive.org/release/{release_id}/front-500"))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    resp.bytes().await.ok().map(|b| b.to_vec())
}

// ---- Identity resolution -------------------------------------------------

/// Returns (value, from_tags, from_mb, from_yt) for one field.
fn resolve_field(
    tag: Option<String>,
    mb: Option<String>,
    yt: Option<String>,
    fallback: Option<String>,
) -> (Option<String>, bool, bool, bool) {
    if let Some(v) = tag.filter(|s| !s.is_empty()) {
        return (Some(v), true, false, false);
    }
    if let Some(v) = mb.filter(|s| !s.is_empty()) {
        return (Some(v), false, true, false);
    }
    if let Some(v) = yt.filter(|s| !s.is_empty()) {
        return (Some(v), false, false, true);
    }
    (fallback.filter(|s| !s.is_empty()), false, false, false)
}

fn identity_source(from_tag: bool, from_mb: bool, from_yt: bool) -> &'static str {
    if from_tag { "tags" }
    else if from_mb { "musicbrainz" }
    else if from_yt { "youtube" }
    else { "filename" }
}

// ---- Core enrichment logic -----------------------------------------------

/// Enrich a single audio file. Returns true if a sidecar was written (new or updated).
/// Idempotent: skips immediately when sidecar exists and `force` is false.
pub async fn enrich_music_meta_path(media: &Path, force: bool) -> bool {
    let ext = media.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    if !is_audio_only_ext(&ext) {
        return false;
    }

    let Some(parent) = media.parent() else { return false; };
    let Some(stem) = media.file_stem().and_then(|s| s.to_str()) else { return false; };

    let sidecar = sidecar_path_for(parent, stem);
    if !force && sidecar.is_file() {
        return false;
    }

    // Read .info.json for YouTube snapshot
    let info_path = resolve_info_json_path(parent, stem);
    let info_json = info_path
        .as_ref()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());

    let tags = read_tags(media);
    let yt = read_yt_meta(info_json.as_ref());

    // MB lookup: only when we have something meaningful to query
    let mb_match = {
        let lookup_title = tags.title.clone()
            .or_else(|| yt.title.clone())
            .unwrap_or_else(|| title_from_stem(stem));
        let lookup_artist = tags.artist.clone()
            .or_else(|| yt.artist.clone())
            .or_else(|| artist_from_stem(stem));

        if lookup_title.is_empty() {
            None
        } else if let Some(artist) = lookup_artist {
            search_mb_recording(&lookup_title, &artist).await
        } else {
            None
        }
    };

    // Resolve identity: tags > MB > YouTube > filename
    let (canonical_title, t_tag, t_mb, t_yt) = resolve_field(
        tags.title.clone(),
        mb_match.as_ref().and_then(|m| m.title.clone()),
        yt.title.clone(),
        Some(title_from_stem(stem)),
    );
    let (canonical_artist, a_tag, a_mb, a_yt) = resolve_field(
        tags.artist.clone(),
        mb_match.as_ref().and_then(|m| m.artist.clone()),
        yt.artist.clone(),
        artist_from_stem(stem),
    );
    let (canonical_album, al_tag, al_mb, al_yt) = resolve_field(
        tags.album.clone(),
        mb_match.as_ref().and_then(|m| m.album.clone()),
        yt.album.clone(),
        None,
    );
    let canonical_album = drop_single_track_pseudo_album(canonical_album, &canonical_title);

    let src = identity_source(
        t_tag || a_tag || al_tag,
        t_mb || a_mb || al_mb,
        t_yt || a_yt || al_yt,
    );

    // Cover art: fetch from CAA only when no local cover exists and we have a release MBID
    if !local_cover_exists(parent, stem, tags.has_embedded_cover) {
        if let Some(release_id) = mb_match.as_ref().map(|m| m.release_id.clone()) {
            if let Some(bytes) = fetch_caa_cover(&release_id).await {
                let cover_path = parent.join(THUMB_DIR_NAME).join(stem).join("music_cover.jpg");
                if let Some(cover_parent) = cover_path.parent() {
                    let _ = std::fs::create_dir_all(cover_parent);
                }
                let _ = std::fs::write(&cover_path, bytes);
            }
        }
    }

    let dto = MusicMetaSidecarDto {
        schema_version: SIDECAR_SCHEMA_VERSION,
        enriched_at: iso_now(),
        identity_source: src.to_string(),
        canonical_artist,
        canonical_album,
        canonical_title,
        year: mb_match.as_ref().and_then(|m| m.year),
        mb_recording_id: mb_match.as_ref().map(|m| m.recording_id.clone()),
        mb_release_id: mb_match.as_ref().map(|m| m.release_id.clone()),
        mb_release_group_id: mb_match.as_ref().and_then(|m| m.release_group_id.clone()),
        match_confidence: mb_match.as_ref().map(|m| m.score),
        youtube: Some(yt.snapshot),
        genres: Vec::new(),
        artist_mb_id: None,
    };

    write_sidecar(&sidecar, &dto)
}

// ---- Library traversal for backfill --------------------------------------

fn push_if_audio(path: PathBuf, out: &mut Vec<PathBuf>) {
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    if !is_audio_only_ext(&ext) {
        return;
    }
    let stem = match path.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s.to_string(),
        None => return,
    };
    if strip_ytdlp_stream_suffix(&stem) != stem.as_str() {
        return;
    }
    out.push(path);
}

fn collect_audio_files(dir: &Path, depth: u32, max_depth: u32, out: &mut Vec<PathBuf>) {
    if depth > max_depth || !dir.is_dir() {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return; };
    let mut entries: Vec<PathBuf> = rd.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entries.sort();

    for p in entries {
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with('.') || name == THUMB_DIR_NAME {
            continue;
        }
        if p.is_file() {
            push_if_audio(p, out);
        } else if p.is_dir() {
            collect_audio_files(&p, depth + 1, max_depth, out);
        }
    }
}

fn library_audio_files(roots: &[String]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for root in roots {
        let p = PathBuf::from(root.trim());
        if p.is_dir() {
            collect_audio_files(&p, 0, 12, &mut out);
        }
    }
    out.sort();
    out.dedup();
    out
}

/// Find audio files modified after `since` under `dir` (used for post-download hook).
pub fn find_recent_audio_files(dir: &Path, since: SystemTime) -> Vec<PathBuf> {
    const SLACK: u64 = 15;
    let cutoff = since.checked_sub(Duration::from_secs(SLACK)).unwrap_or(since);
    let mut out = Vec::new();
    walk_recent_audio(dir, cutoff, 0, 6, &mut out);
    out
}

fn walk_recent_audio(dir: &Path, cutoff: SystemTime, depth: u32, max: u32, out: &mut Vec<PathBuf>) {
    if depth > max || !dir.is_dir() {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return; };
    for e in rd.flatten() {
        let p = e.path();
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with('.') || name == THUMB_DIR_NAME {
            continue;
        }
        if p.is_dir() {
            walk_recent_audio(&p, cutoff, depth + 1, max, out);
        } else if p.is_file() {
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
            if !is_audio_only_ext(&ext) {
                continue;
            }
            let recent = std::fs::metadata(&p)
                .and_then(|m| m.modified())
                .map(|t| t >= cutoff)
                .unwrap_or(true);
            if recent {
                out.push(p);
            }
        }
    }
}

// ---- Tauri commands ------------------------------------------------------

/// Enrich a single audio file. Idempotent; skips if sidecar exists unless force=true.
#[tauri::command]
pub async fn ensure_music_meta(media_path: String, force: Option<bool>) -> bool {
    enrich_music_meta_path(Path::new(&media_path), force.unwrap_or(false)).await
}

/// Read the enrichment sidecar for a file (for the song detail page).
#[tauri::command]
pub async fn read_music_meta(media_path: String) -> Option<MusicMetaSidecarDto> {
    let media = PathBuf::from(&media_path);
    let parent = media.parent()?;
    let stem = media.file_stem()?.to_str()?;
    let sidecar = sidecar_path_for(parent, stem);
    read_sidecar(&sidecar)
}

/// Scan `roots` for audio files missing a sidecar and enrich them.
/// Emits `music-meta-backfill-progress` events with {done, total, currentTitle}.
/// Rate-limited to <= 1 MB request/sec via the shared gate.
#[tauri::command]
pub async fn backfill_music_meta(app: AppHandle, roots: Vec<String>) -> Result<u32, String> {
    let all = library_audio_files(&roots);
    let pending: Vec<PathBuf> = all
        .into_iter()
        .filter(|p| {
            p.parent()
                .and_then(|par| p.file_stem()?.to_str().map(|s| sidecar_path_for(par, s)))
                .map(|sp| !sp.is_file())
                .unwrap_or(false)
        })
        .collect();

    let total = pending.len() as u32;
    let mut done: u32 = 0;
    let mut enriched: u32 = 0;

    let _ = app.emit(
        "music-meta-backfill-progress",
        MusicMetaBackfillProgress { done, total, current_title: None },
    );

    for path in &pending {
        let title = path.file_stem().and_then(|s| s.to_str()).map(String::from);
        if enrich_music_meta_path(path, false).await {
            enriched += 1;
        }
        done += 1;
        let _ = app.emit(
            "music-meta-backfill-progress",
            MusicMetaBackfillProgress { done, total, current_title: title },
        );
    }

    Ok(enriched)
}

// ---- Artist info (ephemeral, display-only) --------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistInfoDto {
    pub mb_id: String,
    pub name: String,
    /// e.g. "Person" / "Group" / "Orchestra"
    pub artist_type: Option<String>,
    /// Short disambiguation from MB, e.g. "American rapper"
    pub disambiguation: Option<String>,
    /// begin-area name, e.g. "Chicago"
    pub origin_city: Option<String>,
    /// Two-letter country code, e.g. "US"
    pub country: Option<String>,
    /// Up to 5 top genre/tag names
    pub genres: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistMetaSidecarDto {
    pub schema_version: u32,
    pub fetched_at: String,
    pub mb_id: String,
    pub name: String,
    pub artist_type: Option<String>,
    pub disambiguation: Option<String>,
    pub origin_city: Option<String>,
    pub country: Option<String>,
    pub genres: Vec<String>,
}

fn normalize_artist_sidecar_stem(artist_name: &str) -> String {
    let mut out = String::with_capacity(artist_name.len());
    let mut prev_sep = false;
    for ch in artist_name.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_sep = false;
        } else if !prev_sep {
            out.push('_');
            prev_sep = true;
        }
    }
    let stem = out.trim_matches('_');
    if stem.is_empty() {
        "unknown_artist".to_string()
    } else {
        stem.to_string()
    }
}

fn artist_meta_sidecar_path_in(app_data_root: &Path, artist_name: &str) -> PathBuf {
    let stem = normalize_artist_sidecar_stem(artist_name);
    app_data_root
        .join("musicmeta")
        .join("artists")
        .join(format!("{stem}.artistmeta.json"))
}

fn artist_meta_sidecar_path(app: &AppHandle, artist_name: &str) -> Option<PathBuf> {
    let root = app.path().app_data_dir().ok()?;
    Some(artist_meta_sidecar_path_in(&root, artist_name))
}

async fn load_or_fetch_artist_meta_in(
    app_data_root: &Path,
    artist_name: &str,
    force: bool,
) -> Option<ArtistMetaSidecarDto> {
    let path = artist_meta_sidecar_path_in(app_data_root, artist_name);
    if !force && path.is_file() {
        return read_json_sidecar(&path);
    }
    let info = fetch_artist_info_from_mb(artist_name).await?;
    let dto = artist_meta_sidecar_from_info(info);
    let _ = write_json_sidecar(&path, &dto);
    Some(dto)
}

async fn load_or_fetch_artist_meta(
    app: &AppHandle,
    artist_name: &str,
    force: bool,
) -> Option<ArtistMetaSidecarDto> {
    let root = app.path().app_data_dir().ok()?;
    load_or_fetch_artist_meta_in(&root, artist_name, force).await
}

async fn fetch_artist_info_from_mb(artist_name: &str) -> Option<ArtistInfoDto> {
    if artist_name.trim().is_empty() {
        return None;
    }

    let client = build_http_client()?;
    let query = format!(r#"artist:"{}""#, artist_name.trim());

    rate_gate_wait().await;

    let resp = client
        .get(format!("{MB_API_BASE}/artist"))
        .query(&[("query", query.as_str()), ("fmt", "json"), ("limit", "3")])
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let json: serde_json::Value = resp.json().await.ok()?;
    let artists = json["artists"].as_array()?;

    // Prefer an exact case-insensitive name match; fall back to first result.
    let query_lower = artist_name.trim().to_lowercase();
    let artist = artists
        .iter()
        .find(|a| a["name"].as_str().map(|n| n.to_lowercase() == query_lower).unwrap_or(false))
        .or_else(|| artists.first())?;

    let mb_id = artist["id"].as_str()?.to_string();
    let name = artist["name"].as_str().unwrap_or(artist_name.trim()).to_string();
    let artist_type = artist["type"].as_str().map(String::from);
    let disambiguation = artist["disambiguation"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let origin_city = artist["begin-area"]["name"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let country = artist["country"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from);

    let genres: Vec<String> = artist["tags"]
        .as_array()
        .map(|tags| {
            let mut sorted: Vec<(i64, String)> = tags
                .iter()
                .filter_map(|t| {
                    let name = t["name"].as_str()?.to_string();
                    let count = t["count"].as_i64().unwrap_or(0);
                    Some((count, name))
                })
                .collect();
            sorted.sort_by(|a, b| b.0.cmp(&a.0));
            sorted.into_iter().take(5).map(|(_, n)| n).collect()
        })
        .unwrap_or_default();

    Some(ArtistInfoDto { mb_id, name, artist_type, disambiguation, origin_city, country, genres })
}

fn artist_meta_sidecar_from_info(info: ArtistInfoDto) -> ArtistMetaSidecarDto {
    ArtistMetaSidecarDto {
        schema_version: ARTIST_META_SCHEMA_VERSION,
        fetched_at: iso_now(),
        mb_id: info.mb_id,
        name: info.name,
        artist_type: info.artist_type,
        disambiguation: info.disambiguation,
        origin_city: info.origin_city,
        country: info.country,
        genres: info.genres,
    }
}

/// Fetch artist metadata from MusicBrainz by display name.
/// Uses the shared rate gate. Returns None when no match is found.
#[tauri::command]
pub async fn get_artist_info(artist_name: String) -> Option<ArtistInfoDto> {
    fetch_artist_info_from_mb(&artist_name).await
}

/// Read artist metadata sidecar by artist display name.
#[tauri::command]
pub async fn read_artist_meta_sidecar(
    app: AppHandle,
    artist_name: String,
) -> Option<ArtistMetaSidecarDto> {
    let path = artist_meta_sidecar_path(&app, &artist_name)?;
    read_json_sidecar(&path)
}

/// Ensure artist metadata sidecar exists; fetches once and writes if missing.
#[tauri::command]
pub async fn ensure_artist_meta_sidecar(
    app: AppHandle,
    artist_name: String,
    force: Option<bool>,
) -> bool {
    let force = force.unwrap_or(false);
    let Some(path) = artist_meta_sidecar_path(&app, &artist_name) else {
        return false;
    };
    if !force && path.is_file() {
        return false;
    }
    load_or_fetch_artist_meta(&app, &artist_name, force)
        .await
        .is_some()
}

// ---- Tests ---------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{clean_music_title, read_sidecar, sidecar_needs_artist_tags};

    macro_rules! clean_eq {
        ($input:expr, $expected:expr) => {
            assert_eq!(
                clean_music_title($input),
                $expected,
                "input: {:?}",
                $input
            );
        };
    }

    #[test]
    fn strips_official_video_paren() {
        clean_eq!("Lucid Dreams (Official Video)", "Lucid Dreams");
    }

    #[test]
    fn strips_official_music_video() {
        clean_eq!("Rockstar (Official Music Video)", "Rockstar");
    }

    #[test]
    fn strips_hd_bracket() {
        clean_eq!("Circles [HD]", "Circles");
    }

    #[test]
    fn strips_lyrics_paren() {
        clean_eq!("Sunflower (Lyrics)", "Sunflower");
    }

    #[test]
    fn strips_stacked_noise() {
        clean_eq!("Track Name (Official Video) [HD]", "Track Name");
    }

    #[test]
    fn strips_prod_suffix() {
        clean_eq!("Beat prod. Some Producer", "Beat");
    }

    #[test]
    fn preserves_core_title() {
        clean_eq!("  Blinding Lights  ", "Blinding Lights");
    }

    #[test]
    fn empty_input() {
        clean_eq!("", "");
    }

    #[test]
    fn title_without_noise_unchanged() {
        clean_eq!("Bohemian Rhapsody", "Bohemian Rhapsody");
    }

    #[test]
    fn strips_4k_bracket() {
        clean_eq!("Song [4K]", "Song");
    }

    #[test]
    fn strips_audio_paren() {
        clean_eq!("Track (Audio)", "Track");
    }

    #[test]
    fn v1_sidecar_deserializes_with_empty_artist_tag_fields() {
        let json = r#"{
            "schemaVersion": 1,
            "enrichedAt": "2024-01-01T00:00:00Z",
            "identitySource": "youtube",
            "canonicalArtist": "Artist",
            "canonicalTitle": "Song"
        }"#;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("track.musicmeta.json");
        std::fs::write(&path, json).unwrap();
        let dto = read_sidecar(&path).expect("parse v1 sidecar");
        assert_eq!(dto.schema_version, 1);
        assert!(dto.genres.is_empty());
        assert!(dto.artist_mb_id.is_none());
        assert!(sidecar_needs_artist_tags(&dto));
    }
}
