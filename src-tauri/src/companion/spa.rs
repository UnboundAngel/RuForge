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
    } else if path.ends_with(".js") {
        "application/javascript"
    } else if path.ends_with(".css") {
        "text/css"
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
    serve_embedded(&path)
}
