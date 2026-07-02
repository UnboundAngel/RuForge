use axum::body::Body;
use axum::extract::{Path as AxumPath, Query, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Manager};
use tower::ServiceExt;
use tower_http::services::ServeFile;

use crate::companion::auth::{self, SESSION_COOKIE};
use crate::companion::{now_unix, CompanionStateHandle};
use crate::library::{resolver, LibraryState};

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

/// Companion never holds its own copy of the library; every request that needs
/// media data resolves it fresh from `library::resolver` against the app handle
/// captured at `CompanionState::start()`.
async fn require_app_handle(state: &CompanionStateHandle) -> Result<AppHandle, Response> {
    state
        .app_handle
        .read()
        .await
        .clone()
        .ok_or_else(|| error_response(StatusCode::SERVICE_UNAVAILABLE, "companion_not_ready"))
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
    let app = match require_app_handle(&state).await {
        Ok(a) => a,
        Err(e) => return e,
    };
    let lib = app.state::<LibraryState>();
    let (version, ready, items) = resolver::snapshot(&lib).await;

    let payload: Vec<_> = items
        .into_iter()
        .map(|p| {
            json!({
                "id": p.id,
                "title": p.title,
                "durationSecs": p.duration_secs,
                "container": p.container,
                "videoCodec": p.video_codec,
                "audioCodec": p.audio_codec,
                "playable": p.playable,
                "hasThumb": p.has_thumb,
                "sizeBytes": p.size_bytes,
            })
        })
        .collect();

    let mut res = Json(json!({ "catalogVersion": version, "ready": ready, "items": payload })).into_response();
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
    let app = match require_app_handle(&state).await {
        Ok(a) => a,
        Err(e) => return e,
    };
    let lib = app.state::<LibraryState>();
    if !resolver::is_known_id(&lib, &id).await {
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

    let app = match require_app_handle(&state).await {
        Ok(a) => a,
        Err(e) => return e,
    };
    let lib = app.state::<LibraryState>();
    if !resolver::is_known_id(&lib, &id).await {
        return error_response(StatusCode::NOT_FOUND, "unknown_id");
    }
    if kind == "stream" && !resolver::is_playable(&lib, &id).await {
        return error_response(StatusCode::FORBIDDEN, "not_playable");
    }
    if kind == "thumb" && !resolver::has_thumb(&lib, &id).await {
        return error_response(StatusCode::NOT_FOUND, "no_thumb");
    }

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

    let app = match require_app_handle(&state).await {
        Ok(a) => a,
        Err(e) => return e,
    };
    let lib = app.state::<LibraryState>();

    // `resolver` already canonicalizes and allowlist-checks the resolved path;
    // routes never touch a raw path directly.
    let resolved_path = if kind == "stream" {
        resolver::resolve_stream_path(&app, &lib, &id).await
    } else {
        resolver::resolve_thumb_path(&lib, &id).await
    };
    let Some(canonical) = resolved_path else {
        return error_response(StatusCode::NOT_FOUND, "file_missing");
    };

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
