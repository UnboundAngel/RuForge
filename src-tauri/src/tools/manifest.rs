use std::time::Duration;

use serde::Deserialize;

const MANIFEST_URL: &str = "https://ruforge.app/tools.json";
const EMBEDDED: &str = include_str!("../../../website/public/tools.json");
const SUPPORTED_SCHEMA: u32 = 1;
// Our mirror first: BtbN prunes old autobuild tags, so the pinned URL points at our own release.
const TRUSTED_PATHS: [&str; 2] = [
    "/UnboundAngel/RuForge/releases/download/tools-ffmpeg-",
    "/BtbN/FFmpeg-Builds/releases/download/",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema: u32,
    pub ffmpeg: FfmpegEntry,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegEntry {
    pub url: String,
    pub sha256: String,
    pub archive: String,
    pub size: u64,
    pub ffmpeg_path: String,
    pub ffprobe_path: String,
}

pub fn parse(text: &str) -> Result<Manifest, String> {
    let mut m: Manifest = serde_json::from_str(text).map_err(|e| format!("tools manifest: {e}"))?;
    if m.schema != SUPPORTED_SCHEMA {
        return Err(format!("tools manifest: unsupported schema {}", m.schema));
    }
    let f = &mut m.ffmpeg;
    if f.archive != "zip" {
        return Err("tools manifest: unsupported archive type".into());
    }
    if f.sha256.len() != 64 || !f.sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("tools manifest: bad sha256".into());
    }
    f.sha256.make_ascii_lowercase();
    // Check the URL as reqwest will send it: the parser drops tabs and resolves dot segments,
    // so raw string checks can be walked out of the trusted repos.
    let untrusted = || String::from("tools manifest: untrusted ffmpeg url");
    if f.url.chars().any(|c| c.is_ascii_control() || c.is_whitespace() || c == '\\') {
        return Err(untrusted());
    }
    let u = reqwest::Url::parse(&f.url).map_err(|_| untrusted())?;
    let path = u.path().to_ascii_lowercase();
    if u.scheme() != "https"
        || u.host_str() != Some("github.com")
        || u.port().is_some()
        || !u.username().is_empty()
        || u.password().is_some()
        || !TRUSTED_PATHS.iter().any(|p| u.path().starts_with(p))
        || path.contains("%2e")
        || path.contains("%2f")
        || path.contains("%5c")
    {
        return Err(untrusted());
    }
    f.url = u.to_string();
    Ok(m)
}

pub fn embedded() -> Manifest {
    parse(EMBEDDED).expect("embedded tools.json is valid")
}

/// Remote manifest with a 10 s timeout; the embedded copy covers any failure.
pub async fn load() -> Manifest {
    match fetch_remote().await {
        Ok(m) => m,
        Err(e) => {
            crate::rf_log!("tools.install", log::Level::Warn, "tools manifest fallback: {}", e);
            embedded()
        }
    }
}

async fn fetch_remote() -> Result<Manifest, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(MANIFEST_URL).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    parse(&resp.text().await.map_err(|e| e.to_string())?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_parses() {
        let m = embedded();
        assert!(m.ffmpeg.size > 100_000_000);
        assert!(m.ffmpeg.ffmpeg_path.ends_with("ffmpeg.exe"));
    }

    #[test]
    fn rejects_bad_schema_hash_and_host() {
        assert!(parse(&EMBEDDED.replace("\"schema\": 1", "\"schema\": 2")).is_err());
        assert!(parse(&EMBEDDED.replace("186cb850", "zzzzzzzz")).is_err());
        assert!(parse(&EMBEDDED.replace("github.com/UnboundAngel", "evil.example/UnboundAngel")).is_err());
        assert!(parse(&EMBEDDED.replace("releases/download/tools-ffmpeg-", "releases/download/v")).is_err());
        assert!(parse("{}").is_err());
    }
}
