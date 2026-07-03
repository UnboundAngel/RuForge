pub mod auth;
pub mod commands;
pub mod trace_log;
pub mod routes;
pub mod spa;

use std::collections::HashMap;
use std::net::{SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use rand::rngs::OsRng;
use rand::RngCore;
use tauri::{AppHandle, Manager};
use tokio::sync::{oneshot, RwLock};

use crate::companion::trace_log as companion_log;
use crate::library::LibraryState;

pub const DEFAULT_PORT: u16 = 8787;

pub fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub struct Session {
    pub id: String,
    pub created_at: i64,
    pub last_seen: i64,
    pub label: String,
}

pub struct PairingCode {
    pub code: String,
    pub created_at: i64,
    pub expires_at: i64,
    pub used: bool,
}

pub struct CompanionInner {
    pub session_secret: RwLock<[u8; 32]>,
    pub sessions: RwLock<HashMap<String, Session>>,
    pub pairing: RwLock<Option<PairingCode>>,
    /// Set once at `start()`. Companion routes resolve media exclusively through
    /// `library::resolver` against this handle; the companion never scans disk or
    /// holds its own notion of "what exists."
    pub app_handle: RwLock<Option<AppHandle>>,
    pub bind_port: RwLock<u16>,
    pub lan_ip: RwLock<Option<String>>,
    pub running: AtomicBool,
}

pub type CompanionStateHandle = Arc<CompanionInner>;

pub struct CompanionState {
    pub inner: CompanionStateHandle,
    shutdown_tx: std::sync::Mutex<Option<oneshot::Sender<()>>>,
}

fn generate_secret() -> [u8; 32] {
    let mut secret = [0u8; 32];
    OsRng.fill_bytes(&mut secret);
    secret
}

pub fn detect_lan_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|addr| addr.ip().to_string())
}

impl CompanionState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(CompanionInner {
                session_secret: RwLock::new(generate_secret()),
                sessions: RwLock::new(HashMap::new()),
                pairing: RwLock::new(None),
                app_handle: RwLock::new(None),
                bind_port: RwLock::new(DEFAULT_PORT),
                lan_ip: RwLock::new(detect_lan_ip()),
                running: AtomicBool::new(false),
            }),
            shutdown_tx: std::sync::Mutex::new(None),
        }
    }

    pub async fn start(&self, app: AppHandle) {
        if self.inner.running.load(Ordering::SeqCst) {
            return;
        }

        *self.inner.lan_ip.write().await = detect_lan_ip();

        if let Ok(cache_dir) = app.path().app_cache_dir() {
            let remux_dir = cache_dir.join("library-remux");
            let _ = std::fs::create_dir_all(&remux_dir);
            app.state::<LibraryState>().set_remux_cache_dir(remux_dir).await;
        }

        *self.inner.app_handle.write().await = Some(app.clone());

        let listener = match tokio::net::TcpListener::bind(("0.0.0.0", DEFAULT_PORT)).await {
            Ok(l) => l,
            Err(_) => match tokio::net::TcpListener::bind(("0.0.0.0", 0)).await {
                Ok(l) => l,
                Err(e) => {
                    companion_log::error(format!("server failed to bind: {e}"));
                    crate::rf_log!(
                        "companion.server",
                        log::Level::Warn,
                        "companion server failed to bind: {e}"
                    );
                    return;
                }
            },
        };

        let bound_port = listener
            .local_addr()
            .map(|a| a.port())
            .unwrap_or(DEFAULT_PORT);
        *self.inner.bind_port.write().await = bound_port;

        let router = routes::build_router(self.inner.clone());
        let (tx, rx) = oneshot::channel::<()>();
        *self.shutdown_tx.lock().unwrap() = Some(tx);
        self.inner.running.store(true, Ordering::SeqCst);

        let lan_ip = self.inner.lan_ip.read().await.clone();
        let display_url = lan_ip
            .as_ref()
            .map(|ip| format!("http://{ip}:{bound_port}/"))
            .unwrap_or_else(|| format!("http://<lan-ip-unavailable>:{bound_port}/"));
        companion_log::info(format!(
            "server start bind=0.0.0.0:{bound_port} display_url={display_url} pairing=enabled trace_logs={}",
            companion_log::instrumentation_enabled()
        ));

        let running_flag = self.inner.clone();
        tauri::async_runtime::spawn(async move {
            let server = axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .with_graceful_shutdown(async {
                let _ = rx.await;
            });
            if let Err(e) = server.await {
                companion_log::error(format!("server exited: {e}"));
                crate::rf_log!(
                    "companion.server",
                    log::Level::Warn,
                    "companion server exited: {e}"
                );
            }
            running_flag.running.store(false, Ordering::SeqCst);
            companion_log::info("server stopped");
        });

        let app_reindex = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Some(lib) = app_reindex.try_state::<LibraryState>() {
                crate::rf_log!(
                    "companion.server",
                    log::Level::Info,
                    "companion library index build started (background)"
                );
                if let Err(e) = lib.reindex(&app_reindex).await {
                    crate::rf_log!(
                        "companion.server",
                        log::Level::Warn,
                        "companion background reindex failed: {e}"
                    );
                } else {
                    crate::rf_log!(
                        "companion.server",
                        log::Level::Info,
                        "companion library index ready"
                    );
                }
            }
        });
    }

    pub fn stop(&self) {
        companion_log::info("server stop requested");
        if let Some(tx) = self.shutdown_tx.lock().unwrap().take() {
            let _ = tx.send(());
        }
    }

    pub async fn mint_pairing_code(&self) -> PairingCode {
        let code = auth::random_token(16);
        let now = now_unix();
        let pairing = PairingCode {
            code: code.clone(),
            created_at: now,
            expires_at: now + 120,
            used: false,
        };
        *self.inner.pairing.write().await = Some(PairingCode {
            code: pairing.code.clone(),
            created_at: pairing.created_at,
            expires_at: pairing.expires_at,
            used: pairing.used,
        });
        pairing
    }

    pub async fn revoke_all(&self) {
        *self.inner.session_secret.write().await = generate_secret();
        self.inner.sessions.write().await.clear();
        *self.inner.pairing.write().await = None;
    }
}

impl Default for CompanionState {
    fn default() -> Self {
        Self::new()
    }
}
