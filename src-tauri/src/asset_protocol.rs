//! Replaces Tauri's built-in `asset` protocol (registering the same scheme makes Tauri skip its
//! own). The built-in handler serves every webview, including the YouTube ones, and answers with
//! `Access-Control-Allow-Origin` set to the requesting page's origin, so a script on youtube.com
//! could `fetch("http://asset.localhost/C%3A%5C...")` and read any file in scope. This one only
//! serves RuForge's own webviews, pins CORS to the app origin, and never serves a document that
//! can run script.

use std::borrow::Cow;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

use http_range::HttpRange;
use tauri::http::{header::*, Method, Request, Response, StatusCode};
use tauri::path::SafePathBuf;
use tauri::utils::mime_type::MimeType;
use tauri::{AppHandle, Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use crate::cover_thumbs;
use crate::webview_trust::is_app_webview;

/// Media elements ask again for the next slice. Each ask is a custom-scheme round trip queued on the
/// UI thread, so a small cap (Tauri's is 1000 KiB) makes startup pay for several trips before the
/// first frame; 8 MiB covers the head of most files in one.
const MAX_RANGE_LEN: u64 = 8 * 1024 * 1024;

/// Custom-scheme requests queue on the UI thread, so a Music view switch firing hundreds of cover
/// requests stalls; caching is the only fix since the round trip itself is the cost. Only image
/// URLs carrying a `v` query get it: the frontend changes `v` whenever the bytes at that path can
/// change (`src/lib/localImageSrc.ts`). Unversioned URLs stay uncached because scrub sprites are
/// rewritten in place, and media and subtitles (edited in place) keep the old behavior.
const VERSIONED_IMAGE_CACHE_CONTROL: &str = "private, max-age=604800, immutable";

type AssetResponse = Response<Cow<'static, [u8]>>;

fn app_origin<R: Runtime>(app: &AppHandle<R>) -> String {
    if tauri::is_dev() {
        if let Some(url) = app.config().build.dev_url.as_ref() {
            return url.origin().ascii_serialization();
        }
    }
    if cfg!(windows) {
        "http://tauri.localhost".into()
    } else {
        "tauri://localhost".into()
    }
}

/// Unknown extensions fall back to octet-stream, and anything a browser would render as a
/// document is downgraded to plain text, so navigating to an asset URL never runs script.
fn safe_mime(magic: &[u8], path: &str) -> String {
    let mime = MimeType::parse_with_fallback(magic, path, MimeType::OctetStream);
    let essence = mime.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    if matches!(essence.as_str(), "text/html" | "application/xhtml+xml" | "text/xml" | "application/xml") {
        "text/plain".into()
    } else {
        mime
    }
}

fn base(origin: &str) -> tauri::http::response::Builder {
    Response::builder()
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, origin)
        .header(X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(CONTENT_SECURITY_POLICY, "default-src 'none'; sandbox")
}

fn has_version_query(query: Option<&str>) -> bool {
    query.is_some_and(|q| q.split('&').any(|kv| kv.strip_prefix("v=").is_some_and(|v| !v.is_empty())))
}

fn is_image_mime(mime: &str) -> bool {
    mime.trim_start().get(..6).is_some_and(|p| p.eq_ignore_ascii_case("image/"))
}

fn status(origin: &str, code: StatusCode) -> AssetResponse {
    base(origin).status(code).body(Cow::Borrowed(&[][..])).unwrap()
}

/// The decoded file path of a request, or the status to refuse it with. The query string is not
/// part of `uri().path()`, so `?v=` and `?thumb=` never reach the filesystem.
fn allowed_path(request: &Request<Vec<u8>>, scope: &tauri::scope::fs::Scope) -> Result<String, StatusCode> {
    let raw = request.uri().path().as_bytes();
    let path = percent_encoding::percent_decode(raw.get(1..).unwrap_or_default())
        .decode_utf8_lossy()
        .to_string();
    if SafePathBuf::new(path.clone().into()).is_err() || !scope.is_allowed(&path) {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(path)
}

fn serve(request: &Request<Vec<u8>>, scope: &tauri::scope::fs::Scope, origin: &str) -> Result<AssetResponse, Box<dyn std::error::Error>> {
    match allowed_path(request, scope) {
        Ok(path) => serve_path(request, &path, origin),
        Err(code) => Ok(status(origin, code)),
    }
}

/// `path` must come from [`allowed_path`] or be a thumbnail generated from such a path.
fn serve_path(request: &Request<Vec<u8>>, path: &str, origin: &str) -> Result<AssetResponse, Box<dyn std::error::Error>> {
    let path = path.to_string();
    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(status(origin, StatusCode::NOT_FOUND)),
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
            return Ok(status(origin, StatusCode::FORBIDDEN))
        }
        Err(e) => return Err(e.into()),
    };
    let len = file.metadata()?.len();
    let mut magic = Vec::with_capacity(len.min(8192) as usize);
    (&mut file).take(8192).read_to_end(&mut magic)?;
    file.rewind()?;
    let mime = safe_mime(&magic, &path);

    let resp = base(origin).header(CONTENT_TYPE, &mime);

    let range = request.headers().get(RANGE).and_then(|r| r.to_str().ok()).map(str::to_string);
    if let Some(range) = range {
        let not_satisfiable = || {
            base(origin)
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(CONTENT_RANGE, format!("bytes */{len}"))
                .body(Cow::Borrowed(&[][..]))
        };
        let Ok(ranges) = HttpRange::parse(&range, len) else {
            return Ok(not_satisfiable()?);
        };
        // Media elements only ever ask for one range; extra parts of a multi-range request are dropped.
        let Some(first) = ranges.first() else {
            return Ok(not_satisfiable()?);
        };
        let start = first.start;
        if first.length == 0 || start >= len {
            return Ok(not_satisfiable()?);
        }
        let end = start + (first.length - 1).min(len - 1 - start).min(MAX_RANGE_LEN - 1);
        let nbytes = end + 1 - start;
        let mut buf = Vec::with_capacity(nbytes as usize);
        file.seek(SeekFrom::Start(start))?;
        file.take(nbytes).read_to_end(&mut buf)?;
        return Ok(resp
            .status(StatusCode::PARTIAL_CONTENT)
            .header(ACCEPT_RANGES, "bytes")
            .header(ACCESS_CONTROL_EXPOSE_HEADERS, "content-range")
            .header(CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
            .header(CONTENT_LENGTH, nbytes)
            .body(Cow::Owned(buf))?);
    }

    let resp = if is_image_mime(&mime) && has_version_query(request.uri().query()) {
        resp.header(CACHE_CONTROL, VERSIONED_IMAGE_CACHE_CONTROL)
    } else {
        resp
    };
    if request.method() == Method::HEAD {
        return Ok(resp.header(CONTENT_LENGTH, len).body(Cow::Borrowed(&[][..]))?);
    }
    let buf = if len <= magic.len() as u64 {
        magic
    } else {
        let mut buf = Vec::with_capacity(len as usize);
        file.read_to_end(&mut buf)?;
        buf
    };
    Ok(resp.header(CONTENT_LENGTH, len).body(Cow::Owned(buf))?)
}

pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    let origin = app_origin(&app);
    let label = ctx.webview_label().to_string();
    if !is_app_webview(&label) {
        log::warn!("[asset] refused request from webview {label}");
        responder.respond(status(&origin, StatusCode::FORBIDDEN));
        return;
    }
    let thumb = cover_thumbs::wants_thumb(request.uri().query())
        && request.headers().get(RANGE).is_none()
        && matches!(*request.method(), Method::GET | Method::HEAD);
    if thumb {
        tauri::async_runtime::spawn(async move {
            let response = serve_thumb(app, request, origin).await;
            responder.respond(response);
        });
        return;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let scope = app.asset_protocol_scope();
        let response = serve(&request, &scope, &origin).unwrap_or_else(|e| {
            log::warn!("[asset] {e}");
            status(&origin, StatusCode::INTERNAL_SERVER_ERROR)
        });
        responder.respond(response);
    });
}

/// Waits for a missing thumb instead of answering with the original first: swapping a loaded
/// full-size image for its thumb later would pop, and the wait only happens once per cover.
async fn serve_thumb<R: Runtime>(app: AppHandle<R>, request: Request<Vec<u8>>, origin: String) -> AssetResponse {
    let request = std::sync::Arc::new(request);
    let dir = cover_thumbs::thumb_dir(&app);
    let probe = {
        let (app, request, dir) = (app.clone(), request.clone(), dir.clone());
        tauri::async_runtime::spawn_blocking(move || -> Result<(String, cover_thumbs::Lookup), StatusCode> {
            let path = allowed_path(&request, &app.asset_protocol_scope())?;
            let found = match &dir {
                Some(dir) if cover_thumbs::is_thumbable_ext(&path) => cover_thumbs::lookup(dir, &path),
                _ => cover_thumbs::Lookup::Skip,
            };
            Ok((path, found))
        })
        .await
    };
    let (src, found) = match probe {
        Ok(Ok(v)) => v,
        Ok(Err(code)) => return status(&origin, code),
        Err(_) => return status(&origin, StatusCode::INTERNAL_SERVER_ERROR),
    };
    let thumb = match (found, dir) {
        (cover_thumbs::Lookup::Ready(p), _) => Some(p),
        (cover_thumbs::Lookup::Missing(stem), Some(dir)) => cover_thumbs::ensure(dir, src.clone(), stem).await,
        _ => None,
    };
    let fail_origin = origin.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let from_thumb = thumb
            .and_then(|p| serve_path(&request, &p.to_string_lossy(), &origin).ok())
            .filter(|r| r.status() == StatusCode::OK);
        from_thumb.unwrap_or_else(|| {
            serve_path(&request, &src, &origin).unwrap_or_else(|e| {
                log::warn!("[asset] {e}");
                status(&origin, StatusCode::INTERNAL_SERVER_ERROR)
            })
        })
    })
    .await
    .unwrap_or_else(|_| status(&fail_origin, StatusCode::INTERNAL_SERVER_ERROR))
}
