pub mod auth;
pub mod catalog;
pub mod commands;
pub mod remux;
pub mod routes;
pub mod spa;

use std::collections::HashMap;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use rand::rngs::OsRng;
use rand::RngCore;
use tauri::AppHandle;
use tokio::sync::{oneshot, RwLock};

use crate::companion::catalog::CatalogEntry;

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
    pub catalog: RwLock<HashMap<String, CatalogEntry>>,
    pub catalog_version: RwLock<String>,
    pub media_roots: Vec<PathBuf>,
    pub cache_root: RwLock<Option<PathBuf>>,
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

pub async fn path_is_allowed(state: &CompanionInner, canonical: &PathBuf) -> bool {
    if state.media_roots.iter().any(|root| canonical.starts_with(root)) {
        return true;
    }
    if let Some(cache) = state.cache_root.read().await.as_ref() {
        if canonical.starts_with(cache) {
            return true;
        }
    }
    false
}

fn default_media_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(dir) = dirs::video_dir() {
        roots.push(dir.canonicalize().unwrap_or(dir));
    }
    if let Some(dir) = dirs::download_dir() {
        roots.push(dir.canonicalize().unwrap_or(dir));
    }
    roots
}

impl CompanionState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(CompanionInner {
                session_secret: RwLock::new(generate_secret()),
                sessions: RwLock::new(HashMap::new()),
                pairing: RwLock::new(None),
                catalog: RwLock::new(HashMap::new()),
                catalog_version: RwLock::new(String::from("empty")),
                media_roots: default_media_roots(),
                cache_root: RwLock::new(None),
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

        if let Ok(cache_dir) = tauri::Manager::path(&app).app_cache_dir() {
            let remux_dir = cache_dir.join("companion-remux");
            let _ = std::fs::create_dir_all(&remux_dir);
            if let Ok(canonical) = remux_dir.canonicalize() {
                *self.inner.cache_root.write().await = Some(canonical);
            }
        }

        catalog::rebuild(&app, &self.inner).await;

        let listener = match tokio::net::TcpListener::bind(("0.0.0.0", DEFAULT_PORT)).await {
            Ok(l) => l,
            Err(_) => match tokio::net::TcpListener::bind(("0.0.0.0", 0)).await {
                Ok(l) => l,
                Err(e) => {
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

        let running_flag = self.inner.clone();
        tauri::async_runtime::spawn(async move {
            let server = axum::serve(listener, router).with_graceful_shutdown(async {
                let _ = rx.await;
            });
            if let Err(e) = server.await {
                crate::rf_log!(
                    "companion.server",
                    log::Level::Warn,
                    "companion server exited: {e}"
                );
            }
            running_flag.running.store(false, Ordering::SeqCst);
        });

        crate::rf_log!(
            "companion.server",
            log::Level::Info,
            "companion server listening on 0.0.0.0:{bound_port}"
        );
    }

    pub fn stop(&self) {
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
