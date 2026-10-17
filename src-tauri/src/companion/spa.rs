use axum::extract::Path as AxumPath;
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "companion-web/"]
struct CompanionWeb;

fn content_type_for(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".js") || path.ends_with(".mjs") {
        "application/javascript"
    } else if path.ends_with(".css") {
        "text/css"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else if path.ends_with(".woff") {
        "font/woff"
    } else if path.ends_with(".webmanifest") {
        "application/manifest+json"
    } else if path.ends_with(".json") {
        "application/json"
    } else {
        "application/octet-stream"
    }
}

fn serve_embedded(path: &str) -> Response {
    match CompanionWeb::get(path) {
        Some(file) => {
            let mut res = file.data.into_owned().into_response();
            res.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static(content_type_for(path)),
            );
            res
        }
        None => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

pub async fn index() -> Response {
    serve_embedded("index.html")
}

pub async fn asset(AxumPath(path): AxumPath<String>) -> Response {
    serve_embedded(&format!("assets/{path}"))
}

pub async fn manifest() -> Response {
    serve_embedded("manifest.webmanifest")
}

pub async fn service_worker() -> Response {
    let mut res = serve_embedded("sw.js");
    res.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    res
}

/// Imported by `sw.js`; the browser stores it with the worker, so it also works offline.
pub async fn art_cache_script() -> Response {
    let mut res = serve_embedded("art-cache.js");
    res.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    res
}

pub async fn apple_touch_icon() -> Response {
    serve_embedded("apple-touch-icon.png")
}

pub async fn icon_192() -> Response {
    serve_embedded("icon-192.png")
}

pub async fn icon_512() -> Response {
    serve_embedded("icon-512.png")
}
