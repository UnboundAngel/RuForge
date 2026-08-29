use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::commands::musicmeta::{
    build_http_client, clean_music_title, normalize_identity_token,
    read_sidecar as read_musicmeta_sidecar, sidecar_path_for as musicmeta_sidecar_path,
    MusicMetaSidecarDto,
};
use crate::utils::{duration_from_ytdlp_info_json, is_audio_only_ext, resolve_info_json_path};

const LRCLIB_API_BASE: &str = "https://lrclib.net";
const SIDECAR_SCHEMA_VERSION: u32 = 1;
const SOURCE_TAG: &str = "lrclib";
/// Negative-cache TTL: miss sidecars are retryable after this window.
const NEGATIVE_CACHE_SECS: i64 = 7 * 24 * 60 * 60;
/// Docs: /api/get only matches when duration differs by at most ±2 seconds.
const DURATION_TOLERANCE_SECS: f64 = 2.0;
const BACKFILL_GAP_MS: u64 = 250;

// ---- Sidecar -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsSidecarDto {
    pub schema_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synced_lyrics: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plain_lyrics: Option<String>,
    pub fetched_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub matched_track_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub matched_artist_name: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsEnsureResult {
    pub sidecar: LyricsSidecarDto,
    pub from_cache: bool,
    pub match_step: String,
    /// Duration sent to LRCLIB, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<f64>,
    /// Which probe produced `duration_secs`: `info.json`, `lofty`, or `none`.
    pub duration_source: String,
    /// LRCLIB record duration when a match returned one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_duration: Option<f64>,
    /// Which query-candidate index produced the hit (None on miss/cache).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate_index: Option<usize>,
}

#[derive(Debug, Clone, Copy)]
pub struct DurationProbe {
    pub secs: Option<f64>,
    /// `info.json` | `lofty` | `none`
    pub source: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsBackfillProgress {
    pub done: u32,
    pub total: u32,
    pub current_title: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LyricsQuery {
    pub artist: String,
    pub title: String,
    pub album: Option<String>,
    pub duration: Option<f64>,
    /// `canonical` when musicmeta fields drove the query; `fallback` for artist+name.
    pub identity: &'static str,
    /// Index in the query-candidate chain (0 = raw pair, 1 = strip artist prefix, 2 = title split, …).
    pub candidate_index: usize,
}

#[derive(Debug, Clone)]
pub struct LyricsMatchOutcome {
    pub sidecar: LyricsSidecarDto,
    pub match_step: String,
    pub query_duration: Option<f64>,
    pub matched_duration: Option<f64>,
    pub candidate_index: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibTrack {
    #[serde(default)]
    track_name: Option<String>,
    #[serde(default)]
    artist_name: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    plain_lyrics: Option<String>,
    #[serde(default)]
    synced_lyrics: Option<String>,
    #[serde(default)]
    instrumental: Option<bool>,
}

pub fn sidecar_path_for(parent: &Path, stem: &str) -> PathBuf {
    parent.join(format!("{stem}.lyrics.json"))
}

pub fn read_sidecar(path: &Path) -> Option<LyricsSidecarDto> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_sidecar(path: &Path, dto: &LyricsSidecarDto) -> bool {
    let Ok(json) = serde_json::to_string_pretty(dto) else {
        return false;
    };
    std::fs::write(path, json).is_ok()
}

fn iso_now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn non_empty(s: Option<&str>) -> Option<String> {
    s.map(str::trim).filter(|t| !t.is_empty()).map(String::from)
}

/// Undo common yt-dlp Windows filename sanitization before LRCLIB query strings.
/// `normalize_identity_token` only strips non-ascii-alnum to spaces; it does not fold.
fn fold_query_text(raw: &str) -> String {
    raw.chars()
        .map(|c| match c {
            '\u{FF02}' | '\u{201C}' | '\u{201D}' => '"',
            '\u{FF07}' | '\u{2018}' | '\u{2019}' => '\'',
            '\u{29F8}' | '\u{FF0F}' => '/',
            '\u{29F9}' | '\u{FF3C}' => '\\',
            '\u{FF1A}' => ':',
            '\u{FF1F}' => '?',
            '\u{FF0A}' => '*',
            '\u{FF5C}' => '|',
            '\u{FF1C}' => '<',
            '\u{FF1E}' => '>',
            c => c,
        })
        .collect()
}

fn duration_usable(d: Option<f64>) -> Option<f64> {
    d.filter(|v| v.is_finite() && *v >= 1.0 && *v <= 3600.0)
}

fn within_duration_tolerance(local: f64, remote: f64) -> bool {
    (local - remote).abs() <= DURATION_TOLERANCE_SECS
}

fn has_lyrics(dto: &LyricsSidecarDto) -> bool {
    dto.synced_lyrics
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
        || dto
            .plain_lyrics
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
}

fn negative_cache_fresh(dto: &LyricsSidecarDto) -> bool {
    if has_lyrics(dto) {
        return false;
    }
    let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(&dto.fetched_at) else {
        return false;
    };
    let age = chrono::Utc::now().signed_duration_since(parsed.with_timezone(&chrono::Utc));
    age.num_seconds() < NEGATIVE_CACHE_SECS
}

fn miss_sidecar() -> LyricsSidecarDto {
    LyricsSidecarDto {
        schema_version: SIDECAR_SCHEMA_VERSION,
        synced_lyrics: None,
        plain_lyrics: None,
        fetched_at: iso_now(),
        matched_track_name: None,
        matched_artist_name: None,
        source: SOURCE_TAG.to_string(),
    }
}

fn hit_sidecar(track: &LrclibTrack) -> LyricsSidecarDto {
    let synced = non_empty(track.synced_lyrics.as_deref());
    let plain = non_empty(track.plain_lyrics.as_deref());
    LyricsSidecarDto {
        schema_version: SIDECAR_SCHEMA_VERSION,
        synced_lyrics: synced,
        plain_lyrics: plain,
        fetched_at: iso_now(),
        matched_track_name: non_empty(track.track_name.as_deref()),
        matched_artist_name: non_empty(track.artist_name.as_deref()),
        source: SOURCE_TAG.to_string(),
    }
}

fn track_is_usable(track: &LrclibTrack) -> bool {
    if track.instrumental == Some(true) {
        return true;
    }
    non_empty(track.synced_lyrics.as_deref()).is_some()
        || non_empty(track.plain_lyrics.as_deref()).is_some()
}

// ---- Duration / identity -------------------------------------------------

fn lofty_duration_secs(media: &Path) -> Option<f64> {
    use lofty::file::AudioFile;
    use lofty::probe::Probe;

    let tagged = Probe::open(media).ok()?.read().ok()?;
    let secs = tagged.properties().duration().as_secs_f64();
    duration_usable(Some(secs))
}

/// Same order for music: Lofty (file) first, then yt-dlp info.json as fallback.
pub fn probe_duration(media: &Path) -> DurationProbe {
    if media.is_file() {
        if let Some(secs) = lofty_duration_secs(media) {
            return DurationProbe {
                secs: Some(secs),
                source: "lofty",
            };
        }
    }
    let from_info = duration_usable(Some(duration_from_ytdlp_info_json(media)).filter(|&d| d > 0.0));
    if from_info.is_some() {
        return DurationProbe {
            secs: from_info,
            source: "info.json",
        };
    }
    DurationProbe {
        secs: None,
        source: "none",
    }
}

fn resolve_duration(media: &Path) -> Option<f64> {
    probe_duration(media).secs
}

/// Canonical artist/title from `{stem}.musicmeta.json`, for report tables.
pub fn probe_canonical_identity(media: &Path) -> (Option<String>, Option<String>) {
    let Some(parent) = media.parent() else {
        return (None, None);
    };
    let Some(stem) = media.file_stem().and_then(|s| s.to_str()) else {
        return (None, None);
    };
    let Some(meta) = read_musicmeta_sidecar(&musicmeta_sidecar_path(parent, stem)) else {
        return (None, None);
    };
    (
        non_empty(meta.canonical_artist.as_deref()),
        non_empty(meta.canonical_title.as_deref()),
    )
}

/// Walk audio files under roots (same rules as backfill). Cap with `limit` when set.
pub const LIBRARY_SAMPLE_SEED: u64 = 0x4C52_434C_4942; // "LRCLIB"

#[derive(Debug, Clone, Copy)]
pub enum LibraryAudioSample {
    /// First N paths after a full recursive sort (legacy / reproducible prefix).
    SortedPrefix,
    /// Shuffle with a fixed seed, then take N.
    Random { seed: u64 },
}

pub fn collect_library_audio_limited(
    roots: &[String],
    limit: Option<usize>,
    sample: LibraryAudioSample,
) -> Vec<PathBuf> {
    let mut all = library_audio_files(roots);
    match sample {
        LibraryAudioSample::SortedPrefix => {
            if let Some(n) = limit {
                all.truncate(n.min(all.len()));
            }
        }
        LibraryAudioSample::Random { seed } => {
            use rand::rngs::StdRng;
            use rand::{Rng, SeedableRng};
            let mut rng = StdRng::seed_from_u64(seed);
            for i in (1..all.len()).rev() {
                let j = rng.gen_range(0..=i);
                all.swap(i, j);
            }
            if let Some(n) = limit {
                all.truncate(n.min(all.len()));
            }
        }
    }
    all
}

fn artist_from_stem(stem: &str) -> Option<String> {
    stem.find(" - ")
        .map(|i| stem[..i].trim().to_string())
        .filter(|s| !s.is_empty())
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

fn read_info_identity(parent: &Path, stem: &str) -> (Option<String>, Option<String>, Option<String>) {
    let Some(info_path) = resolve_info_json_path(parent, stem) else {
        return (None, None, None);
    };
    let Ok(txt) = std::fs::read_to_string(&info_path) else {
        return (None, None, None);
    };
    let Ok(j) = serde_json::from_str::<serde_json::Value>(&txt) else {
        return (None, None, None);
    };
    let title = j["title"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(clean_music_title);
    let artist = j["artist"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| {
            j["uploader"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
        })
        .or_else(|| {
            j["creator"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
        });
    let album = j["album"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);
    (artist, title, album)
}

fn read_tag_identity(media: &Path) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
    if !media.is_file() {
        return (None, None, None, None);
    }
    use lofty::prelude::*;
    use lofty::probe::Probe;

    let Ok(tagged) = Probe::open(media).and_then(|p| p.read()) else {
        return (None, None, None, None);
    };
    let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else {
        return (None, None, None, None);
    };
    let artist = tag
        .artist()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());
    let album_artist = tag
        .get_string(&lofty::tag::ItemKey::AlbumArtist)
        .map(String::from)
        .filter(|s| !s.is_empty());
    let title = tag
        .title()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .map(|s| clean_music_title(&s));
    let album = tag.album().map(|s| s.to_string()).filter(|s| !s.is_empty());
    (artist, album_artist, title, album)
}

fn read_info_album_artist(parent: &Path, stem: &str) -> Option<String> {
    let info_path = resolve_info_json_path(parent, stem)?;
    let txt = std::fs::read_to_string(&info_path).ok()?;
    let j: serde_json::Value = serde_json::from_str(&txt).ok()?;
    j["album_artist"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| {
            j["channel"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
        })
}

/// Same resolution order as gallery `MediaFile.artist` / `albumArtist` (tags → info → stem).
fn media_file_artist_fields(
    media: &Path,
    parent: &Path,
    stem: &str,
) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
    let (tag_artist, tag_album_artist, tag_title, tag_album) = read_tag_identity(media);
    let (yt_artist, yt_title, yt_album) = read_info_identity(parent, stem);
    let yt_album_artist = read_info_album_artist(parent, stem);

    let artist = tag_artist
        .clone()
        .or(yt_artist)
        .or_else(|| artist_from_stem(stem));
    let album_artist = tag_album_artist.or(yt_album_artist);
    let title = tag_title
        .or(yt_title)
        .or_else(|| {
            let t = title_from_stem(stem);
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        });
    let album = tag_album.or(yt_album);
    (artist, album_artist, title, album)
}

fn query_from_musicmeta(meta: &MusicMetaSidecarDto) -> Option<(String, String, Option<String>)> {
    let artist = non_empty(meta.canonical_artist.as_deref())?;
    let title = non_empty(meta.canonical_title.as_deref())?;
    let album = non_empty(meta.canonical_album.as_deref());
    Some((artist, title, album))
}

fn query_fallback_pair(
    media: &Path,
    parent: &Path,
    stem: &str,
) -> Option<(String, String, Option<String>)> {
    let (artist, _album_artist, title, album) = media_file_artist_fields(media, parent, stem);
    let artist = artist?;
    let title = title.filter(|t| !t.is_empty())?;
    Some((artist, title, album))
}

/// Strip a leading `Artist - ` from title when the prefix matches `artist` under
/// `normalize_identity_token`.
fn strip_matching_artist_prefix(title: &str, artist: &str) -> Option<String> {
    let Some(i) = title.find(" - ") else {
        return None;
    };
    let prefix = title[..i].trim();
    let rest = title[i + 3..].trim();
    if rest.is_empty() {
        return None;
    }
    if normalize_identity_token(prefix) != normalize_identity_token(artist) {
        return None;
    }
    Some(rest.to_string())
}

/// Split title on the first ` - ` into (artist, title), ignoring any prior artist field.
fn split_title_artist_pair(title: &str) -> Option<(String, String)> {
    let Some(i) = title.find(" - ") else {
        return None;
    };
    let artist = title[..i].trim();
    let rest = title[i + 3..].trim();
    if artist.is_empty() || rest.is_empty() {
        return None;
    }
    Some((artist.to_string(), rest.to_string()))
}

fn push_unique_query(out: &mut Vec<LyricsQuery>, q: LyricsQuery) {
    let dup = out.iter().any(|existing| {
        existing.artist.eq_ignore_ascii_case(&q.artist)
            && existing.title.eq_ignore_ascii_case(&q.title)
    });
    if !dup {
        out.push(q);
    }
}

/// Expand one artist/title pair into the LRCLIB candidate chain:
/// 0 raw pair, 1 strip matching artist prefix, 2 title-split artist/title.
fn expand_query_candidates(
    artist: String,
    title: String,
    album: Option<String>,
    duration: Option<f64>,
    identity: &'static str,
    start_index: usize,
) -> Vec<LyricsQuery> {
    let artist = fold_query_text(&artist);
    let title = fold_query_text(&title);
    let album = album.map(|a| fold_query_text(&a));
    let mut out = Vec::new();
    let mut idx = start_index;

    push_unique_query(
        &mut out,
        LyricsQuery {
            artist: artist.clone(),
            title: title.clone(),
            album: album.clone(),
            duration,
            identity,
            candidate_index: idx,
        },
    );
    idx = start_index + out.len();

    if let Some(stripped) = strip_matching_artist_prefix(&title, &artist) {
        let before = out.len();
        push_unique_query(
            &mut out,
            LyricsQuery {
                artist: artist.clone(),
                title: stripped,
                album: album.clone(),
                duration,
                identity,
                candidate_index: idx,
            },
        );
        if out.len() > before {
            idx += 1;
        }
    }

    if let Some((split_artist, split_title)) = split_title_artist_pair(&title) {
        push_unique_query(
            &mut out,
            LyricsQuery {
                artist: split_artist,
                title: split_title,
                album: album.clone(),
                duration,
                identity,
                candidate_index: idx,
            },
        );
    }

    for (i, q) in out.iter_mut().enumerate() {
        q.candidate_index = start_index + i;
    }
    out
}

fn build_queries(media: &Path) -> Vec<LyricsQuery> {
    let Some(parent) = media.parent() else {
        return Vec::new();
    };
    let Some(stem) = media.file_stem().and_then(|s| s.to_str()) else {
        return Vec::new();
    };

    let duration = resolve_duration(media);
    let mut out = Vec::new();

    let musicmeta_path = musicmeta_sidecar_path(parent, stem);
    let meta = read_musicmeta_sidecar(&musicmeta_path);
    let canonical_pair = meta.as_ref().and_then(|m| query_from_musicmeta(m));

    if let Some((artist, title, album)) = canonical_pair.clone() {
        out.extend(expand_query_candidates(
            artist,
            title,
            album,
            duration,
            "canonical",
            0,
        ));
    }

    let (file_artist, file_album_artist, file_title, file_album) =
        media_file_artist_fields(media, parent, stem);
    let tag_title = canonical_pair
        .as_ref()
        .map(|(_, t, _)| t.clone())
        .or(file_title);
    let tag_album = canonical_pair
        .as_ref()
        .and_then(|(_, _, a)| a.clone())
        .or(file_album);

    if let (Some(artist), Some(title)) = (file_artist, tag_title.clone()) {
        let start = out.len();
        for q in expand_query_candidates(
            artist,
            title,
            tag_album.clone(),
            duration,
            "artist",
            start,
        ) {
            push_unique_query(&mut out, q);
        }
    }

    if let (Some(artist), Some(title)) = (file_album_artist, tag_title) {
        let start = out.len();
        for q in expand_query_candidates(
            artist,
            title,
            tag_album,
            duration,
            "album-artist",
            start,
        ) {
            push_unique_query(&mut out, q);
        }
    }

    if let Some((artist, title, album)) = query_fallback_pair(media, parent, stem) {
        let start = out.len();
        for q in expand_query_candidates(artist, title, album, duration, "fallback", start) {
            push_unique_query(&mut out, q);
        }
    }

    for (i, q) in out.iter_mut().enumerate() {
        q.candidate_index = i;
    }

    out
}

// ---- LRCLIB HTTP ---------------------------------------------------------

async fn honor_retry_after(resp: &reqwest::Response) {
    if resp.status().as_u16() != 429 {
        return;
    }
    let secs = resp
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(1)
        .clamp(1, 30);
    tokio::time::sleep(Duration::from_secs(secs)).await;
}

async fn lrclib_get(query: &LyricsQuery) -> Option<LrclibTrack> {
    let client = build_http_client()?;
    let mut req = client.get(format!("{LRCLIB_API_BASE}/api/get")).query(&[
        ("track_name", query.title.as_str()),
        ("artist_name", query.artist.as_str()),
    ]);
    if let Some(album) = query.album.as_deref() {
        req = req.query(&[("album_name", album)]);
    }
    if let Some(dur) = duration_usable(query.duration) {
        req = req.query(&[("duration", format!("{dur:.0}"))]);
    }

    let resp = req.send().await.ok()?;
    if resp.status().as_u16() == 429 {
        honor_retry_after(&resp).await;
        return None;
    }
    if resp.status().as_u16() == 404 {
        return None;
    }
    if !resp.status().is_success() {
        return None;
    }
    let track: LrclibTrack = resp.json().await.ok()?;
    if track_is_usable(&track) {
        Some(track)
    } else {
        None
    }
}

async fn lrclib_search(query: &LyricsQuery) -> Option<LrclibTrack> {
    let client = build_http_client()?;
    let mut req = client
        .get(format!("{LRCLIB_API_BASE}/api/search"))
        .query(&[
            ("track_name", query.title.as_str()),
            ("artist_name", query.artist.as_str()),
        ]);
    if let Some(album) = query.album.as_deref() {
        req = req.query(&[("album_name", album)]);
    }

    let resp = req.send().await.ok()?;
    if resp.status().as_u16() == 429 {
        honor_retry_after(&resp).await;
        return None;
    }
    if !resp.status().is_success() {
        return None;
    }
    let tracks: Vec<LrclibTrack> = resp.json().await.ok()?;
    pick_search_match(query, tracks)
}

fn identity_agrees(query: &str, candidate: Option<&str>) -> bool {
    let Some(candidate) = candidate.map(str::trim).filter(|s| !s.is_empty()) else {
        return false;
    };
    let q = normalize_identity_token(query);
    let c = normalize_identity_token(candidate);
    if q.is_empty() || c.is_empty() {
        return false;
    }
    q == c
}

fn pick_search_match(query: &LyricsQuery, tracks: Vec<LrclibTrack>) -> Option<LrclibTrack> {
    let usable: Vec<LrclibTrack> = tracks.into_iter().filter(track_is_usable).collect();
    if usable.is_empty() {
        return None;
    }

    let Some(local) = duration_usable(query.duration) else {
        return usable.into_iter().find(|track| {
            identity_agrees(&query.artist, track.artist_name.as_deref())
                && identity_agrees(&query.title, track.track_name.as_deref())
        });
    };

    let mut best: Option<(f64, LrclibTrack)> = None;
    for track in usable {
        let remote = track.duration.unwrap_or(0.0);
        if !remote.is_finite() || remote <= 0.0 {
            continue;
        }
        if !within_duration_tolerance(local, remote) {
            continue;
        }
        let delta = (local - remote).abs();
        match &best {
            Some((best_delta, _)) if delta >= *best_delta => {}
            _ => best = Some((delta, track)),
        }
    }
    best.map(|(_, t)| t)
}

/// Shared fetch: /api/get then /api/search by duration delta, across query identities.
pub async fn fetch_lyrics_for_queries(queries: &[LyricsQuery]) -> LyricsMatchOutcome {
    for query in queries {
        let step_get = format!("get:{}", query.identity);
        if let Some(track) = lrclib_get(query).await {
            return LyricsMatchOutcome {
                sidecar: hit_sidecar(&track),
                match_step: step_get,
                query_duration: query.duration,
                matched_duration: duration_usable(track.duration),
                candidate_index: Some(query.candidate_index),
            };
        }

        let step_search = format!("search:{}", query.identity);
        if let Some(track) = lrclib_search(query).await {
            return LyricsMatchOutcome {
                sidecar: hit_sidecar(&track),
                match_step: step_search,
                query_duration: query.duration,
                matched_duration: duration_usable(track.duration),
                candidate_index: Some(query.candidate_index),
            };
        }
    }

    LyricsMatchOutcome {
        sidecar: miss_sidecar(),
        match_step: "miss".to_string(),
        query_duration: queries.first().and_then(|q| q.duration),
        matched_duration: None,
        candidate_index: None,
    }
}

/// One shared ensure path used by download, backfill, and manual refetch.
pub async fn ensure_lyrics_for_path(media: &Path, force: bool) -> Option<LyricsEnsureResult> {
    ensure_lyrics_for_path_with_write(media, force, true).await
}

/// Same match chain as ensure; when `write` is false, never touches the sidecar.
pub async fn ensure_lyrics_for_path_with_write(
    media: &Path,
    force: bool,
    write: bool,
) -> Option<LyricsEnsureResult> {
    let ext = media
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !ext.is_empty() && !is_audio_only_ext(&ext) {
        return None;
    }

    let parent = media.parent()?;
    let stem = media.file_stem()?.to_str()?;
    let sidecar_path = sidecar_path_for(parent, stem);

    let dur = probe_duration(media);

    if !force {
        if let Some(cached) = read_sidecar(&sidecar_path) {
            if has_lyrics(&cached) || negative_cache_fresh(&cached) {
                return Some(LyricsEnsureResult {
                    sidecar: cached,
                    from_cache: true,
                    match_step: "cache".to_string(),
                    duration_secs: dur.secs,
                    duration_source: dur.source.to_string(),
                    matched_duration: None,
                    candidate_index: None,
                });
            }
        }
    }

    let queries = build_queries(media);
    if queries.is_empty() {
        let miss = miss_sidecar();
        if write {
            let _ = write_sidecar(&sidecar_path, &miss);
        }
        return Some(LyricsEnsureResult {
            sidecar: miss,
            from_cache: false,
            match_step: "miss:no-identity".to_string(),
            duration_secs: dur.secs,
            duration_source: dur.source.to_string(),
            matched_duration: None,
            candidate_index: None,
        });
    }

    let outcome = fetch_lyrics_for_queries(&queries).await;
    if write {
        let _ = write_sidecar(&sidecar_path, &outcome.sidecar);
    }
    Some(LyricsEnsureResult {
        sidecar: outcome.sidecar,
        from_cache: false,
        match_step: outcome.match_step,
        duration_secs: outcome.query_duration.or(dur.secs),
        duration_source: dur.source.to_string(),
        matched_duration: outcome.matched_duration,
        candidate_index: outcome.candidate_index,
    })
}

/// Exercise no-duration search: first usable hit is wrong identity; must refuse or
/// skip to an agreeing later hit. Returns (skipped_wrong_first, accepted_or_none).
pub fn verify_no_duration_search_guard() -> (bool, Option<String>) {
    let query = LyricsQuery {
        artist: "Radiohead".into(),
        title: "Karma Police".into(),
        album: None,
        duration: None,
        identity: "canonical",
        candidate_index: 0,
    };
    let tracks = vec![
        LrclibTrack {
            track_name: Some("Creep".into()),
            artist_name: Some("Radiohead".into()),
            duration: Some(238.0),
            plain_lyrics: Some("wrong first hit".into()),
            synced_lyrics: None,
            instrumental: None,
        },
        LrclibTrack {
            track_name: Some("Karma Police".into()),
            artist_name: Some("Radiohead".into()),
            duration: Some(264.0),
            plain_lyrics: Some("right".into()),
            synced_lyrics: None,
            instrumental: None,
        },
    ];
    let picked = pick_search_match(&query, tracks);
    let name = picked.and_then(|t| t.track_name);
    let skipped_wrong = name.as_deref() != Some("Creep");
    (skipped_wrong, name)
}

/// No agreeing record at all with duration stripped: must miss.
pub fn verify_no_duration_search_miss_when_no_agree() -> bool {
    let query = LyricsQuery {
        artist: "Radiohead".into(),
        title: "Karma Police".into(),
        album: None,
        duration: None,
        identity: "canonical",
        candidate_index: 0,
    };
    let tracks = vec![LrclibTrack {
        track_name: Some("Creep".into()),
        artist_name: Some("Radiohead".into()),
        duration: Some(238.0),
        plain_lyrics: Some("wrong only".into()),
        synced_lyrics: None,
        instrumental: None,
    }];
    pick_search_match(&query, tracks).is_none()
}

// ---- Library walk / callers ---------------------------------------------

fn push_if_audio(path: PathBuf, out: &mut Vec<PathBuf>) {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !is_audio_only_ext(&ext) {
        return;
    }
    out.push(path);
}

fn collect_audio_files(dir: &Path, depth: u32, max_depth: u32, out: &mut Vec<PathBuf>) {
    if depth > max_depth || !dir.is_dir() {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<PathBuf> = rd.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entries.sort();
    for p in entries {
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with('.') || name == crate::utils::THUMB_DIR_NAME {
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

fn needs_fetch(path: &Path, force: bool) -> bool {
    if force {
        return true;
    }
    let Some(parent) = path.parent() else {
        return false;
    };
    let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
        return false;
    };
    let sidecar = sidecar_path_for(parent, stem);
    match read_sidecar(&sidecar) {
        None => true,
        Some(dto) => !has_lyrics(&dto) && !negative_cache_fresh(&dto),
    }
}

/// Post-download hook: write lyrics next to a finished audio path (after musicmeta when possible).
pub async fn ensure_lyrics_after_download(media: &Path) {
    let _ = ensure_lyrics_for_path(media, false).await;
}

#[tauri::command]
pub async fn ensure_lyrics(
    media_path: String,
    force: Option<bool>,
) -> Option<LyricsEnsureResult> {
    ensure_lyrics_for_path(Path::new(&media_path), force.unwrap_or(false)).await
}

#[tauri::command]
pub async fn read_lyrics(media_path: String) -> Option<LyricsSidecarDto> {
    let media = PathBuf::from(&media_path);
    let parent = media.parent()?;
    let stem = media.file_stem()?.to_str()?;
    read_sidecar(&sidecar_path_for(parent, stem))
}

#[tauri::command]
pub async fn backfill_lyrics(
    app: AppHandle,
    roots: Vec<String>,
    force: Option<bool>,
) -> Result<u32, String> {
    let force = force.unwrap_or(false);
    let all = library_audio_files(&roots);
    let targets: Vec<PathBuf> = all
        .into_iter()
        .filter(|p| needs_fetch(p, force))
        .collect();
    let total = targets.len() as u32;
    let mut done: u32 = 0;
    let mut wrote: u32 = 0;

    let _ = app.emit(
        "lyrics-backfill-progress",
        LyricsBackfillProgress {
            done,
            total,
            current_title: None,
        },
    );

    for path in targets {
        let title = path.file_stem().and_then(|s| s.to_str()).map(String::from);
        if let Some(result) = ensure_lyrics_for_path(&path, force).await {
            if !result.from_cache {
                wrote += 1;
            }
        }
        done += 1;
        let _ = app.emit(
            "lyrics-backfill-progress",
            LyricsBackfillProgress {
                done,
                total,
                current_title: title,
            },
        );
        if done < total {
            tokio::time::sleep(Duration::from_millis(BACKFILL_GAP_MS)).await;
        }
    }

    Ok(wrote)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(duration: Option<f64>) -> LyricsQuery {
        LyricsQuery {
            artist: "X".into(),
            title: "Wanted".into(),
            album: None,
            duration,
            identity: "canonical",
            candidate_index: 0,
        }
    }

    #[test]
    fn expand_strips_matching_artist_prefix() {
        let qs = expand_query_candidates(
            "Juice WRLD".into(),
            "Juice WRLD - Relocate".into(),
            None,
            Some(208.0),
            "canonical",
            0,
        );
        assert_eq!(qs.len(), 2);
        assert_eq!(qs[0].title, "Juice WRLD - Relocate");
        assert_eq!(qs[0].candidate_index, 0);
        assert_eq!(qs[1].artist, "Juice WRLD");
        assert_eq!(qs[1].title, "Relocate");
        assert_eq!(qs[1].candidate_index, 1);
    }

    #[test]
    fn expand_title_split_for_reupload_channel() {
        let qs = expand_query_candidates(
            "SUMERIAN".into(),
            "BAD OMENS - THE DEATH OF PEACE OF MIND".into(),
            None,
            Some(240.0),
            "canonical",
            0,
        );
        assert_eq!(qs.len(), 2);
        assert_eq!(qs[0].artist, "SUMERIAN");
        assert_eq!(qs[1].artist, "BAD OMENS");
        assert_eq!(qs[1].title, "THE DEATH OF PEACE OF MIND");
        assert_eq!(qs[1].candidate_index, 1);
    }

    #[test]
    fn fold_query_text_undoes_ytdlp_windows_sanitization() {
        assert_eq!(
            fold_query_text("Dax - \u{FF02}Dear Santa\u{FF02}"),
            "Dax - \"Dear Santa\""
        );
        assert_eq!(
            fold_query_text("Five Degrees \u{29F8} Cut Lil Peep"),
            "Five Degrees / Cut Lil Peep"
        );
    }

    #[test]
    fn identity_agrees_refuses_when_normalize_wipes_cjk() {
        assert!(!identity_agrees("照井順政", Some("照井順政")));
        assert!(!identity_agrees("Radiohead", Some("照井順政")));
        assert!(identity_agrees("Radiohead", Some("Radiohead")));
    }

    #[test]
    fn pick_search_prefers_closest_duration_within_tolerance() {
        let tracks = vec![
            LrclibTrack {
                track_name: Some("A".into()),
                artist_name: Some("X".into()),
                duration: Some(200.0),
                plain_lyrics: Some("far".into()),
                synced_lyrics: None,
                instrumental: None,
            },
            LrclibTrack {
                track_name: Some("B".into()),
                artist_name: Some("X".into()),
                duration: Some(232.0),
                plain_lyrics: Some("near".into()),
                synced_lyrics: None,
                instrumental: None,
            },
            LrclibTrack {
                track_name: Some("C".into()),
                artist_name: Some("X".into()),
                duration: Some(250.0),
                plain_lyrics: Some("out".into()),
                synced_lyrics: None,
                instrumental: None,
            },
        ];
        let picked = pick_search_match(&q(Some(233.0)), tracks).expect("pick");
        assert_eq!(picked.track_name.as_deref(), Some("B"));
    }

    #[test]
    fn pick_search_rejects_outside_tolerance() {
        let tracks = vec![LrclibTrack {
            track_name: Some("A".into()),
            artist_name: Some("X".into()),
            duration: Some(200.0),
            plain_lyrics: Some("x".into()),
            synced_lyrics: None,
            instrumental: None,
        }];
        assert!(pick_search_match(&q(Some(233.0)), tracks).is_none());
    }

    #[test]
    fn no_duration_skips_wrong_first_hit() {
        let (skipped, name) = verify_no_duration_search_guard();
        assert!(skipped);
        assert_eq!(name.as_deref(), Some("Karma Police"));
    }

    #[test]
    fn no_duration_misses_without_identity_agree() {
        assert!(verify_no_duration_search_miss_when_no_agree());
    }
}
