use axum::body::Body;
use axum::extract::{ConnectInfo, Path as AxumPath, Query, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use std::net::SocketAddr;
use tauri::{AppHandle, Manager};
use tower::ServiceExt;
use tower_http::services::ServeFile;

use crate::companion::auth::{self, SESSION_COOKIE};
use crate::companion::trace_log as companion_log;
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
        .layer(middleware::from_fn(request_log))
        .layer(middleware::from_fn(same_origin_guard))
        .with_state(state)
}

fn error_response(status: StatusCode, code: &str) -> Response {
    (status, Json(json!({ "error": code }))).into_response()
}

fn request_host(headers: &HeaderMap) -> String {
    headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("(none)")
        .to_string()
}

fn request_user_agent(headers: &HeaderMap) -> String {
    companion_log::shorten_user_agent(
        headers
            .get(header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .unwrap_or(""),
    )
}

fn remote_ip(req: &Request) -> String {
    req.extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip().to_string())
        .unwrap_or_else(|| "(unknown)".to_string())
}

async fn request_log(req: Request, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let host = request_host(req.headers());
    let ua = request_user_agent(req.headers());
    let ip = remote_ip(&req);

    if method == Method::OPTIONS {
        let origin = req
            .headers()
            .get(header::ORIGIN)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("(none)");
        companion_log::info(format!(
            "cors preflight method=OPTIONS path={path} remote={ip} host={host} origin={origin} ua={ua}"
        ));
    }

    let response = next.run(req).await;
    let status = response.status().as_u16();
    companion_log::info(format!(
        "request method={method} path={path} remote={ip} host={host} ua={ua} status={status} class={}",
        companion_log::status_class(status)
    ));
    response
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
        let host = request_host(req.headers());
        let origin_host = origin.split_once("://").map(|x| x.1).unwrap_or("");
        if origin_host != host {
            companion_log::warn(format!(
                "origin_mismatch origin_host={origin_host} host={host} path={}",
                req.uri().path()
            ));
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
    let token = match auth::parse_cookie(cookie_header, SESSION_COOKIE) {
        Some(t) => t,
        None => {
            companion_log::warn("session auth failed reason=no_session_cookie");
            return Err(error_response(StatusCode::UNAUTHORIZED, "no_session"));
        }
    };
    let mut sessions = state.sessions.write().await;
    match sessions.get_mut(&token) {
        Some(session) => {
            session.last_seen = now_unix();
            Ok(session.id.clone())
        }
        None => {
            companion_log::warn(format!(
                "session auth failed reason=invalid_session token={}",
                companion_log::redact_secret(&token)
            ));
            Err(error_response(StatusCode::UNAUTHORIZED, "invalid_session"))
        }
    }
}

async fn healthz() -> Response {
    Json(json!({ "ok": true, "version": env!("CARGO_PKG_VERSION") })).into_response()
}

#[derive(Deserialize)]
struct PairRequest {
    code: String,
}

fn pairing_failure_reason(
    pairing: &Option<crate::companion::PairingCode>,
    submitted: &str,
) -> &'static str {
    let Some(p) = pairing.as_ref() else {
        return "no_active_pairing_code";
    };
    if p.used {
        return "pairing_code_already_used";
    }
    if p.expires_at < now_unix() {
        return "pairing_code_expired";
    }
    if p.code != submitted {
        return "pairing_code_mismatch";
    }
    "invalid_pairing_code"
}

async fn pair(
    State(state): State<CompanionStateHandle>,
    headers: HeaderMap,
    Json(body): Json<PairRequest>,
) -> Response {
    let submitted = body.code.trim();
    let mut pairing = state.pairing.write().await;
    let valid = matches!(
        pairing.as_ref(),
        Some(p) if !p.used && p.expires_at >= now_unix() && p.code == submitted
    );
    if !valid {
        let reason = pairing_failure_reason(&pairing, submitted);
        companion_log::warn(format!(
            "pairing failed reason={reason} code={} remote={} ua={}",
            companion_log::redact_secret(submitted),
            remote_ip_from_headers(&headers),
            request_user_agent(&headers)
        ));
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
            id: sid.clone(),
            created_at: now,
            last_seen: now,
            label: label.clone(),
        },
    );

    companion_log::info(format!(
        "pairing ok session_id={sid} device_label={label} token={} remote={} ua={}",
        companion_log::redact_secret(&token),
        remote_ip_from_headers(&headers),
        companion_log::shorten_user_agent(ua)
    ));

    let cookie = format!("{SESSION_COOKIE}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400");
    let mut res = Json(json!({ "ok": true, "deviceLabel": label })).into_response();
    if let Ok(cookie_val) = HeaderValue::from_str(&cookie) {
        res.headers_mut().insert(header::SET_COOKIE, cookie_val);
        companion_log::info(format!(
            "session cookie set session_id={sid} token={}",
            companion_log::redact_secret(&token)
        ));
    } else {
        companion_log::warn(format!(
            "session cookie rejected by header parser session_id={sid}"
        ));
    }
    res
}

fn remote_ip_from_headers(_headers: &HeaderMap) -> String {
    "(see request log)".to_string()
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
                "mediaType": p.media_type,
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

    companion_log::info(format!(
        "library snapshot catalog_version={version} ready={ready} item_count={}",
        payload.len()
    ));

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
        companion_log::warn(format!("sidecar media_id={id} status=404 reason=unknown_id"));
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
        companion_log::warn(format!(
            "stream-token media_id={id} kind={kind} status=404 reason=unknown_id"
        ));
        return error_response(StatusCode::NOT_FOUND, "unknown_id");
    }
    if kind == "stream" && !resolver::is_playable(&lib, &id).await {
        companion_log::warn(format!(
            "stream-token media_id={id} kind={kind} status=403 reason=not_playable"
        ));
        return error_response(StatusCode::FORBIDDEN, "not_playable");
    }
    if kind == "thumb" && !resolver::has_thumb(&lib, &id).await {
        companion_log::warn(format!(
            "stream-token media_id={id} kind={kind} status=404 reason=no_thumb"
        ));
        return error_response(StatusCode::NOT_FOUND, "no_thumb");
    }

    let exp = now_unix() + 300;
    let secret = *state.session_secret.read().await;
    let sig = auth::sign_media(&secret, kind, &id, &sid, exp);
    let url = format!("/{kind}/{id}?sid={sid}&exp={exp}&sig={sig}");
    companion_log::info(format!(
        "stream-token ok media_id={id} kind={kind} session_id={sid} sig={} exp={exp}",
        companion_log::redact_secret(&sig)
    ));
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
    let has_range = req.headers().contains_key(header::RANGE);

    if q.exp < now_unix() {
        companion_log::warn(format!(
            "media kind={kind} media_id={id} session_id={} range={has_range} status=410 reason=signed_url_expired",
            q.sid
        ));
        return error_response(StatusCode::GONE, "signed_url_expired");
    }

    let secret = *state.session_secret.read().await;
    if !auth::verify_media_sig(&secret, kind, &id, &q.sid, q.exp, &q.sig) {
        companion_log::warn(format!(
            "media kind={kind} media_id={id} session_id={} range={has_range} status=403 reason=bad_signature sig={}",
            q.sid,
            companion_log::redact_secret(&q.sig)
        ));
        return error_response(StatusCode::FORBIDDEN, "bad_signature");
    }

    let sid_live = state.sessions.read().await.values().any(|s| s.id == q.sid);
    if !sid_live {
        companion_log::warn(format!(
            "media kind={kind} media_id={id} session_id={} range={has_range} status=403 reason=session_revoked",
            q.sid
        ));
        return error_response(StatusCode::FORBIDDEN, "session_revoked");
    }

    let app = match require_app_handle(&state).await {
        Ok(a) => a,
        Err(e) => return e,
    };
    let lib = app.state::<LibraryState>();

    let resolved_path = if kind == "stream" {
        resolver::resolve_stream_path(&app, &lib, &id).await
    } else {
        resolver::resolve_thumb_path(&lib, &id).await
    };
    let Some(_canonical) = resolved_path else {
        companion_log::warn(format!(
            "media kind={kind} media_id={id} session_id={} range={has_range} status=404 reason=file_missing",
            q.sid
        ));
        return error_response(StatusCode::NOT_FOUND, "file_missing");
    };

    let service = ServeFile::new(&_canonical);
    match service.oneshot(req).await {
        Ok(res) => {
            let status = res.status().as_u16();
            companion_log::info(format!(
                "media kind={kind} media_id={id} session_id={} range={has_range} status={status} class={}",
                q.sid,
                companion_log::status_class(status)
            ));
            let mut res = res.into_response();
            res.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("private, no-store"),
            );
            res
        }
        Err(_) => {
            companion_log::warn(format!(
                "media kind={kind} media_id={id} session_id={} range={has_range} status=404 reason=serve_file_error",
                q.sid
            ));
            error_response(StatusCode::NOT_FOUND, "file_missing")
        }
    }
}

#[cfg(test)]
mod security_tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{header, Request, StatusCode};
    use std::collections::HashMap;
    use std::sync::Arc;
    use tower::ServiceExt;

    use crate::companion::auth::{self, SESSION_COOKIE};
    use crate::companion::{CompanionInner, Session};

    fn test_state() -> CompanionStateHandle {
        Arc::new(CompanionInner {
            session_secret: tokio::sync::RwLock::new([7u8; 32]),
            sessions: tokio::sync::RwLock::new(HashMap::new()),
            pairing: tokio::sync::RwLock::new(None),
            app_handle: tokio::sync::RwLock::new(None),
            bind_port: tokio::sync::RwLock::new(8787),
            lan_ip: tokio::sync::RwLock::new(Some("127.0.0.1".to_string())),
            running: std::sync::atomic::AtomicBool::new(true),
        })
    }

    async fn insert_session(state: &CompanionStateHandle, token: &str, sid: &str) {
        let now = crate::companion::now_unix();
        state.sessions.write().await.insert(
            token.to_string(),
            Session {
                id: sid.to_string(),
                created_at: now,
                last_seen: now,
                label: "test".to_string(),
            },
        );
    }

    #[tokio::test]
    async fn library_requires_session_cookie() {
        let app = build_router(test_state());
        let req = Request::builder()
            .uri("/library")
            .body(Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn library_accepts_valid_session_cookie() {
        let state = test_state();
        insert_session(&state, "tok123", "sid-aaa").await;
        let app = build_router(state);
        let req = Request::builder()
            .uri("/library")
            .header(header::COOKIE, format!("{SESSION_COOKIE}=tok123"))
            .body(Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn stream_rejects_missing_signature() {
        let app = build_router(test_state());
        let req = Request::builder()
            .uri("/stream/abc?sid=x&exp=9999999999&sig=deadbeef")
            .body(Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn stream_rejects_expired_signature() {
        let state = test_state();
        let secret = *state.session_secret.read().await;
        let sid = "sid-exp";
        insert_session(&state, "t", sid).await;
        let exp = crate::companion::now_unix() - 10;
        let sig = auth::sign_media(&secret, "stream", "abc", sid, exp);
        let app = build_router(state);
        let req = Request::builder()
            .uri(format!("/stream/abc?sid={sid}&exp={exp}&sig={sig}"))
            .body(Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::GONE);
    }

    #[tokio::test]
    async fn stream_rejects_wrong_session_id() {
        let state = test_state();
        let secret = *state.session_secret.read().await;
        insert_session(&state, "t", "sid-live").await;
        let exp = crate::companion::now_unix() + 300;
        let sig = auth::sign_media(&secret, "stream", "abc", "sid-other", exp);
        let app = build_router(state);
        let req = Request::builder()
            .uri(format!("/stream/abc?sid=sid-other&exp={exp}&sig={sig}"))
            .body(Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn stream_rejects_path_traversal_id() {
        let state = test_state();
        let secret = *state.session_secret.read().await;
        let sid = "sid-trav";
        insert_session(&state, "t", sid).await;
        let id = "..%2F..%2Fwindows%2Fwin.ini";
        let exp = crate::companion::now_unix() + 300;
        let sig = auth::sign_media(&secret, "stream", id, sid, exp);
        let app = build_router(state);
        let req = Request::builder()
            .uri(format!("/stream/{id}?sid={sid}&exp={exp}&sig={sig}"))
            .body(Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert!(res.status() == StatusCode::NOT_FOUND || res.status() == StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn origin_guard_blocks_cross_origin_post() {
        let app = build_router(test_state());
        let req = Request::builder()
            .method(Method::POST)
            .uri("/pair")
            .header(header::HOST, "127.0.0.1:8787")
            .header(header::ORIGIN, "http://evil.example")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"code":"x"}"#))
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn origin_guard_allows_same_origin_get() {
        let app = build_router(test_state());
        let req = Request::builder()
            .uri("/healthz")
            .header(header::HOST, "127.0.0.1:8787")
            .header(header::ORIGIN, "http://127.0.0.1:8787")
            .body(Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }
}
