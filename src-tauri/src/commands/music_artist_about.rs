use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::commands::musicmeta::{
    build_http_client, iso_now, load_or_fetch_artist_meta, normalize_artist_sidecar_stem,
    rate_gate_wait, read_json_sidecar, write_json_sidecar,
};

const MB_API_BASE: &str = "https://musicbrainz.org/ws/2";
const ABOUT_SCHEMA_VERSION: u32 = 1;
const MAX_BIO_PARAGRAPHS: usize = 4;
const LINK_ORDER: [&str; 8] = [
    "instagram", "x", "youtube", "tiktok", "facebook", "soundcloud", "bandcamp", "homepage",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistLinkDto {
    /// "instagram" | "x" | "facebook" | "youtube" | "bandcamp" | "soundcloud" | "tiktok" | "homepage"
    pub kind: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistAboutDto {
    pub schema_version: u32,
    pub fetched_at: String,
    pub mb_id: String,
    pub name: String,
    pub artist_type: Option<String>,
    pub disambiguation: Option<String>,
    pub area: Option<String>,
    pub begin_year: Option<String>,
    pub end_year: Option<String>,
    pub genres: Vec<String>,
    pub bio: Vec<String>,
    pub image_url: Option<String>,
    pub wikipedia_url: Option<String>,
    pub links: Vec<ArtistLinkDto>,
}

fn about_path(app: &AppHandle, artist_name: &str) -> Option<PathBuf> {
    let root = app.path().app_data_dir().ok()?;
    let stem = normalize_artist_sidecar_stem(artist_name);
    Some(
        root.join("musicmeta")
            .join("artists")
            .join(format!("{stem}.about.json")),
    )
}

fn link_kind(url: &str, rel_type: &str) -> Option<&'static str> {
    let lower = url.to_ascii_lowercase();
    let host_has = |needle: &str| lower.contains(needle);
    if host_has("instagram.com") {
        Some("instagram")
    } else if host_has("twitter.com") || host_has("//x.com") || host_has(".x.com") {
        Some("x")
    } else if host_has("facebook.com") {
        Some("facebook")
    } else if host_has("youtube.com") || host_has("youtu.be") {
        Some("youtube")
    } else if host_has("bandcamp.com") {
        Some("bandcamp")
    } else if host_has("soundcloud.com") {
        Some("soundcloud")
    } else if host_has("tiktok.com") {
        Some("tiktok")
    } else if rel_type == "official homepage" {
        Some("homepage")
    } else {
        None
    }
}

fn year_of(date: Option<&str>) -> Option<String> {
    let d = date?.trim();
    let y: String = d.chars().take(4).collect();
    (y.len() == 4 && y.chars().all(|c| c.is_ascii_digit())).then_some(y)
}

fn wiki_title_from_url(url: &str) -> Option<String> {
    let (_, rest) = url.split_once("en.wikipedia.org/wiki/")?;
    let title = rest.split(['#', '?']).next()?.trim();
    (!title.is_empty()).then(|| percent_decode(title))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(b) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

async fn enwiki_title_from_wikidata(client: &reqwest::Client, qid: &str) -> Option<String> {
    let json: serde_json::Value = client
        .get("https://www.wikidata.org/w/api.php")
        .query(&[
            ("action", "wbgetentities"),
            ("ids", qid),
            ("props", "sitelinks"),
            ("sitefilter", "enwiki"),
            ("format", "json"),
        ])
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    json["entities"][qid]["sitelinks"]["enwiki"]["title"]
        .as_str()
        .map(String::from)
}

struct WikiIntro {
    bio: Vec<String>,
    image_url: Option<String>,
    page_url: String,
}

async fn fetch_wiki_intro(client: &reqwest::Client, title: &str) -> Option<WikiIntro> {
    let json: serde_json::Value = client
        .get("https://en.wikipedia.org/w/api.php")
        .query(&[
            ("action", "query"),
            ("format", "json"),
            ("formatversion", "2"),
            ("prop", "extracts|pageimages|info"),
            ("exintro", "1"),
            ("explaintext", "1"),
            ("piprop", "original"),
            ("inprop", "url"),
            ("redirects", "1"),
            ("titles", title),
        ])
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    let page = json["query"]["pages"].as_array()?.first()?;
    let extract = page["extract"].as_str().unwrap_or("");
    let bio: Vec<String> = extract
        .split('\n')
        .map(str::trim)
        .filter(|p| p.len() > 1)
        .take(MAX_BIO_PARAGRAPHS)
        .map(String::from)
        .collect();
    let image_url = page["original"]["source"].as_str().map(String::from);
    let page_url = page["fullurl"]
        .as_str()
        .map(String::from)
        .unwrap_or_else(|| format!("https://en.wikipedia.org/wiki/{}", title.replace(' ', "_")));
    Some(WikiIntro { bio, image_url, page_url })
}

async fn fetch_artist_about(mb_id: &str, fallback_name: &str, genres: Vec<String>) -> Option<ArtistAboutDto> {
    let client = build_http_client()?;
    rate_gate_wait().await;
    let resp = client
        .get(format!("{MB_API_BASE}/artist/{mb_id}"))
        .query(&[("inc", "url-rels"), ("fmt", "json")])
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let artist: serde_json::Value = resp.json().await.ok()?;

    let mut links: Vec<ArtistLinkDto> = Vec::new();
    let mut wiki_title: Option<String> = None;
    let mut wikidata_qid: Option<String> = None;
    for rel in artist["relations"].as_array().into_iter().flatten() {
        let rel_type = rel["type"].as_str().unwrap_or("");
        let Some(url) = rel["url"]["resource"].as_str() else { continue };
        if rel["ended"].as_bool() == Some(true) {
            continue;
        }
        match rel_type {
            "wikipedia" => {
                if wiki_title.is_none() {
                    wiki_title = wiki_title_from_url(url);
                }
            }
            "wikidata" => {
                wikidata_qid = url.rsplit('/').next().filter(|q| q.starts_with('Q')).map(String::from);
            }
            _ => {
                if let Some(kind) = link_kind(url, rel_type) {
                    if !links.iter().any(|l| l.kind == kind) {
                        links.push(ArtistLinkDto { kind: kind.to_string(), url: url.to_string() });
                    }
                }
            }
        }
    }

    links.sort_by_key(|l| LINK_ORDER.iter().position(|k| *k == l.kind).unwrap_or(LINK_ORDER.len()));
    if wiki_title.is_none() {
        if let Some(qid) = wikidata_qid.as_deref() {
            wiki_title = enwiki_title_from_wikidata(&client, qid).await;
        }
    }
    let wiki = match wiki_title.as_deref() {
        Some(t) => fetch_wiki_intro(&client, t).await,
        None => None,
    };

    let opt_str = |v: &serde_json::Value| v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let area = opt_str(&artist["begin-area"]["name"]).or_else(|| opt_str(&artist["area"]["name"]));

    Some(ArtistAboutDto {
        schema_version: ABOUT_SCHEMA_VERSION,
        fetched_at: iso_now(),
        mb_id: mb_id.to_string(),
        name: opt_str(&artist["name"]).unwrap_or_else(|| fallback_name.to_string()),
        artist_type: opt_str(&artist["type"]),
        disambiguation: opt_str(&artist["disambiguation"]),
        area,
        begin_year: year_of(artist["life-span"]["begin"].as_str()),
        end_year: if artist["life-span"]["ended"].as_bool() == Some(true) {
            year_of(artist["life-span"]["end"].as_str())
        } else {
            None
        },
        genres,
        bio: wiki.as_ref().map(|w| w.bio.clone()).unwrap_or_default(),
        image_url: wiki.as_ref().and_then(|w| w.image_url.clone()),
        wikipedia_url: wiki.map(|w| w.page_url),
        links,
    })
}

/// Bio, photo and links for the About the artist sheet. Cached on disk after the first fetch;
/// a failed network call is not cached so the next open retries.
#[tauri::command]
pub async fn music_artist_about(app: AppHandle, artist_name: String) -> Option<ArtistAboutDto> {
    let name = artist_name.trim();
    if name.is_empty() {
        return None;
    }
    let path = about_path(&app, name)?;
    if let Some(cached) = read_json_sidecar::<ArtistAboutDto>(&path) {
        if cached.schema_version == ABOUT_SCHEMA_VERSION {
            return Some(cached);
        }
    }
    let meta = load_or_fetch_artist_meta(&app, name, false).await?;
    let about = fetch_artist_about(&meta.mb_id, &meta.name, meta.genres).await?;
    let _ = write_json_sidecar(&path, &about);
    Some(about)
}

#[cfg(test)]
mod tests {
    use super::{link_kind, wiki_title_from_url, year_of};

    #[test]
    fn classifies_links() {
        assert_eq!(link_kind("https://www.instagram.com/vola", "social network"), Some("instagram"));
        assert_eq!(link_kind("https://x.com/vola", "social network"), Some("x"));
        assert_eq!(link_kind("https://vola.dk", "official homepage"), Some("homepage"));
        assert_eq!(link_kind("https://example.org", "other databases"), None);
    }

    #[test]
    fn parses_wiki_title_and_year() {
        assert_eq!(
            wiki_title_from_url("https://en.wikipedia.org/wiki/Vola_(band)").as_deref(),
            Some("Vola_(band)")
        );
        assert_eq!(
            wiki_title_from_url("https://en.wikipedia.org/wiki/Sigur_R%C3%B3s").as_deref(),
            Some("Sigur_Rós")
        );
        assert_eq!(year_of(Some("2006-05")), Some("2006".to_string()));
        assert_eq!(year_of(Some("")), None);
    }
}
