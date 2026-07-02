use axum::body::Body;
use axum::extract::{Path as AxumPath, Query, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use tower::ServiceExt;
use tower_http::services::ServeFile;

use crate::companion::auth::{self, SESSION_COOKIE};
use crate::companion::{now_unix, CompanionStateHandle};

pub fn build_router(state: CompanionStateHandle) -> Router {
    Router::new()
        .route("/", get(crate::companion::spa::index))
        .route("/assets/*path", get(crate::companion::spa::asset))
        .route("/healthz", get(healthz))
        .route("/pair", post(pair))
        .route("/library", get(library))
        .route("/sidecar/:id", get(sidecar))
        .route("/stream-token/:id", post(stream_token))
        .route("/stream/:id", get(stream_media))
        .route("/thumb/:id", get(thumb_media))
        .layer(middleware::from_fn(same_origin_guard))
        .with_state(state)
}

fn error_response(status: StatusCode, code: &str) -> Response {
    (status, Json(json!({ "error": code }))).into_response()
}

async fn same_origin_guard(req: Request, next: Next) -> Response {
    if let Some(origin) = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    {
        let host = req
            .headers()
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let origin_host = origin.split_once("://").map(|x| x.1).unwrap_or("");
        if origin_host != host {
            return error_response(StatusCode::FORBIDDEN, "origin_mismatch");
        }
    }
    next.run(req).await
}

async fn require_session(state: &CompanionStateHandle, headers: &HeaderMap) -> Result<String, Response> {
    let cookie_header = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let token = auth::parse_cookie(cookie_header, SESSION_COOKIE)
        .ok_or_else(|| error_response(StatusCode::UNAUTHORIZED, "no_session"))?;
    let mut sessions = state.sessions.write().await;
    match sessions.get_mut(&token) {
        Some(session) => {
            session.last_seen = now_unix();
            Ok(session.id.clone())
        }
        None => Err(error_response(StatusCode::UNAUTHORIZED, "invalid_session")),
    }
}

async fn healthz() -> Response {
    Json(json!({ "ok": true, "version": env!("CARGO_PKG_VERSION") })).into_response()
}

#[derive(Deserialize)]
struct PairRequest {
    code: String,
}

async fn pair(
    State(state): State<CompanionStateHandle>,
    headers: HeaderMap,
    Json(body): Json<PairRequest>,
) -> Response {
    let mut pairing = state.pairing.write().await;
    let valid = matches!(
        pairing.as_ref(),
        Some(p) if !p.used && p.expires_at >= now_unix() && p.code == body.code
    );
    if !valid {
        return error_response(StatusCode::UNAUTHORIZED, "invalid_pairing_code");
    }
    if let Some(p) = pairing.as_mut() {
        p.used = true;
    }
    drop(pairing);

    let ua = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let label = auth::device_label_from_user_agent(ua);

    let token = auth::random_token(32);
    let sid = uuid::Uuid::new_v4().to_string();
    let now = now_unix();
    state.sessions.write().await.insert(
        token.clone(),
        crate::companion::Session {
            id: sid,
            created_at: now,
            last_seen: now,
            label: label.clone(),
        },
    );

    let cookie = format!("{SESSION_COOKIE}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400");
    let mut res = Json(json!({ "ok": true, "deviceLabel": label })).into_response();
    if let Ok(cookie_val) = HeaderValue::from_str(&cookie) {
        res.headers_mut().insert(header::SET_COOKIE, cookie_val);
    }
    res
}

async fn library(State(state): State<CompanionStateHandle>, headers: HeaderMap) -> Response {
    if let Err(e) = require_session(&state, &headers).await {
        return e;
    }
    let catalog = state.catalog.read().await;
    let version = state.catalog_version.read().await.clone();
    let items: Vec<_> = catalog
        .values()
        .map(|e| {
            json!({
                "id": e.id,
                "title": e.title,
                "durationSecs": e.duration_secs,
                "container": e.container,
                "videoCodec": e.video_codec,
                "audioCodec": e.audio_codec,
                "playable": e.playable,
                "hasThumb": e.thumb_path.is_some(),
                "sizeBytes": e.size_bytes,
            })
        })
        .collect();

    let mut res = Json(json!({ "catalogVersion": version, "items": items })).into_response();
    res.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=30"),
    );
    if let Ok(etag) = HeaderValue::from_str(&format!("\"{version}\"")) {
        res.headers_mut().insert(header::ETAG, etag);
    }
    res
}

async fn sidecar(
    State(state): State<CompanionStateHandle>,
    headers: HeaderMap,
    AxumPath(id): AxumPath<String>,
) -> Response {
    if let Err(e) = require_session(&state, &headers).await {
        return e;
    }
    let catalog = state.catalog.read().await;
    if !catalog.contains_key(&id) {
        return error_response(StatusCode::NOT_FOUND, "unknown_id");
    }
    Json(json!({ "id": id, "chapters": [], "subtitles": [], "comments": null })).into_response()
}

#[derive(Deserialize)]
struct StreamTokenQuery {
    kind: Option<String>,
}

async fn stream_token(
    State(state): State<CompanionStateHandle>,
    headers: HeaderMap,
    AxumPath(id): AxumPath<String>,
    Query(q): Query<StreamTokenQuery>,
) -> Response {
    let sid = match require_session(&state, &headers).await {
        Ok(s) => s,
        Err(e) => return e,
    };
    let kind = match q.kind.as_deref() {
        Some("thumb") => "thumb",
        _ => "stream",
    };

    let catalog = state.catalog.read().await;
    let entry = match catalog.get(&id) {
        Some(e) => e,
        None => return error_response(StatusCode::NOT_FOUND, "unknown_id"),
    };
    if kind == "stream" && !entry.playable {
        return error_response(StatusCode::FORBIDDEN, "not_playable");
    }
    if kind == "thumb" && entry.thumb_path.is_none() {
        return error_response(StatusCode::NOT_FOUND, "no_thumb");
    }
    drop(catalog);

    let exp = now_unix() + 300;
    let secret = *state.session_secret.read().await;
    let sig = auth::sign_media(&secret, kind, &id, &sid, exp);
    let url = format!("/{kind}/{id}?sid={sid}&exp={exp}&sig={sig}");
    Json(json!({ "url": url, "expSecs": exp })).into_response()
}

#[derive(Deserialize)]
struct SignedMediaQuery {
    sid: String,
    exp: i64,
    sig: String,
}

async fn stream_media(
    State(state): State<CompanionStateHandle>,
    Query(q): Query<SignedMediaQuery>,
    AxumPath(id): AxumPath<String>,
    req: Request,
) -> Response {
    serve_signed_media("stream", state, id, q, req).await
}

async fn thumb_media(
    State(state): State<CompanionStateHandle>,
    Query(q): Query<SignedMediaQuery>,
    AxumPath(id): AxumPath<String>,
    req: Request,
) -> Response {
    serve_signed_media("thumb", state, id, q, req).await
}

async fn serve_signed_media(
    kind: &str,
    state: CompanionStateHandle,
    id: String,
    q: SignedMediaQuery,
    req: Request<Body>,
) -> Response {
    if q.exp < now_unix() {
        return error_response(StatusCode::GONE, "signed_url_expired");
    }

    let secret = *state.session_secret.read().await;
    if !auth::verify_media_sig(&secret, kind, &id, &q.sid, q.exp, &q.sig) {
        return error_response(StatusCode::FORBIDDEN, "bad_signature");
    }

    let sid_live = state.sessions.read().await.values().any(|s| s.id == q.sid);
    if !sid_live {
        return error_response(StatusCode::FORBIDDEN, "session_revoked");
    }

    let resolved_path = {
        let catalog = state.catalog.read().await;
        match catalog.get(&id) {
            Some(entry) if kind == "stream" => Some(entry.serve_path.clone()),
            Some(entry) if kind == "thumb" => entry.thumb_path.clone(),
            _ => None,
        }
    };
    let Some(path) = resolved_path else {
        return error_response(StatusCode::NOT_FOUND, "unknown_id");
    };

    let canonical = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            state.catalog.write().await.remove(&id);
            return error_response(StatusCode::NOT_FOUND, "file_missing");
        }
    };

    let within_root = crate::companion::path_is_allowed(&state, &canonical).await;
    if !within_root {
        return error_response(StatusCode::FORBIDDEN, "path_escape");
    }

    let service = ServeFile::new(&canonical);
    match service.oneshot(req).await {
        Ok(res) => {
            let mut res = res.into_response();
            res.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("private, no-store"),
            );
            res
        }
        Err(_) => error_response(StatusCode::NOT_FOUND, "file_missing"),
    }
}
