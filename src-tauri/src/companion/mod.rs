pub mod art;
pub mod auth;
pub mod commands;
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
use tauri::{AppHandle, Listener, Manager};
use tokio::sync::{oneshot, RwLock};

use crate::library::LibraryState;

pub const DEFAULT_PORT: u16 = 8787;

/// V1 Browser Companion binds loopback only. LAN bind (`0.0.0.0`) stays deferred
/// behind the V2 threat-model gate; `detect_lan_ip` is kept for future status UI.
pub const LOOPBACK_BIND: &str = "127.0.0.1";

pub fn browser_base_url(port: u16) -> String {
    format!("http://localhost:{port}")
}

pub fn tailnet_base_url(host: &str) -> String {
    format!("https://{host}")
}

/// A wrong guess burns the code after this many tries, so the 8-char code never meets brute force.
pub const PAIRING_MAX_FAILURES: u32 = 5;

/// This machine's MagicDNS name from the Tailscale CLI, or None when Tailscale is absent or logged out.
pub fn detect_tailnet_host() -> Option<String> {
    let candidates = [
        "tailscale".to_string(),
        r"C:\Program Files\Tailscale\tailscale.exe".to_string(),
    ];
    for bin in candidates {
        let mut cmd = std::process::Command::new(&bin);
        cmd.args(["status", "--json"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let Ok(out) = cmd.output() else { continue };
        if !out.status.success() {
            return None;
        }
        let json: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
        if json.get("BackendState").and_then(|v| v.as_str()) != Some("Running") {
            return None;
        }
        let name = json
            .get("Self")?
            .get("DNSName")?
            .as_str()?
            .trim_end_matches('.')
            .to_ascii_lowercase();
        return auth::is_tailnet_name(&name).then_some(name);
    }
    None
}

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

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    hash: String,
    id: String,
    label: String,
    created_at: i64,
    last_seen: i64,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct StoredDevices {
    secret: String,
    sessions: Vec<StoredSession>,
}

pub struct PairingCode {
    pub code: String,
    pub created_at: i64,
    pub expires_at: i64,
    pub used: bool,
    pub failures: u32,
}

#[derive(Clone, Debug)]
pub struct ProgressSnapshot {
    pub position_secs: f64,
    pub duration_secs: f64,
    pub playback_state: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressQueryResult {
    pub request_id: String,
    pub position_secs: f64,
    pub duration_secs: f64,
}

pub struct CompanionInner {
    pub session_secret: RwLock<[u8; 32]>,
    /// Keyed by `auth::hash_token(cookie)`; mirrored to `companion-devices.json`.
    pub sessions: RwLock<HashMap<String, Session>>,
    pub devices_path: RwLock<Option<PathBuf>>,
    pub pairing: RwLock<Option<PairingCode>>,
    /// In-memory mirror for companion resume reads; never serialized with paths.
    pub progress_cache: RwLock<HashMap<String, ProgressSnapshot>>,
    pub progress_read_pending: RwLock<HashMap<String, oneshot::Sender<(f64, f64)>>>,
    /// Set once at `start()`. Companion routes resolve media exclusively through
    /// `library::resolver` against this handle; the companion never scans disk or
    /// holds its own notion of "what exists."
    pub app_handle: RwLock<Option<AppHandle>>,
    pub bind_port: RwLock<u16>,
    pub lan_ip: RwLock<Option<String>>,
    pub tailnet_host: RwLock<Option<String>>,
    pub running: AtomicBool,
}

impl CompanionInner {
    pub async fn load_devices(&self, path: PathBuf) {
        let stored = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<StoredDevices>(&raw).ok());
        if let Some(stored) = stored {
            if let Some(secret) = auth::secret_from_hex(&stored.secret) {
                let now = now_unix();
                *self.session_secret.write().await = secret;
                let mut sessions = self.sessions.write().await;
                for s in stored.sessions {
                    if auth::session_expired(s.created_at, s.last_seen, now) {
                        continue;
                    }
                    sessions.insert(
                        s.hash,
                        Session {
                            id: s.id,
                            created_at: s.created_at,
                            last_seen: s.last_seen,
                            label: s.label,
                        },
                    );
                }
            }
        }
        *self.devices_path.write().await = Some(path);
        self.persist().await;
    }

    pub async fn persist(&self) {
        let Some(path) = self.devices_path.read().await.clone() else {
            return;
        };
        let stored = StoredDevices {
            secret: auth::secret_to_hex(&*self.session_secret.read().await),
            sessions: self
                .sessions
                .read()
                .await
                .iter()
                .map(|(hash, s)| StoredSession {
                    hash: hash.clone(),
                    id: s.id.clone(),
                    label: s.label.clone(),
                    created_at: s.created_at,
                    last_seen: s.last_seen,
                })
                .collect(),
        };
        let Ok(json) = serde_json::to_string(&stored) else {
            return;
        };
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, json).is_err() || std::fs::rename(&tmp, &path).is_err() {
            let _ = std::fs::remove_file(&tmp);
            crate::rf_log!(
                "companion.server",
                log::Level::Warn,
                "companion devices file write failed"
            );
        }
    }
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
                devices_path: RwLock::new(None),
                pairing: RwLock::new(None),
                progress_cache: RwLock::new(HashMap::new()),
                progress_read_pending: RwLock::new(HashMap::new()),
                app_handle: RwLock::new(None),
                bind_port: RwLock::new(DEFAULT_PORT),
                lan_ip: RwLock::new(detect_lan_ip()),
                tailnet_host: RwLock::new(None),
                running: AtomicBool::new(false),
            }),
            shutdown_tx: std::sync::Mutex::new(None),
        }
    }

    pub async fn start(&self, app: AppHandle) {
        if self.inner.running.load(Ordering::SeqCst) {
            return;
        }

        if let Ok(data_dir) = app.path().app_data_dir() {
            let _ = std::fs::create_dir_all(&data_dir);
            self.inner
                .load_devices(data_dir.join("companion-devices.json"))
                .await;
        }

        if let Ok(cache_dir) = app.path().app_cache_dir() {
            let remux_dir = cache_dir.join("library-remux");
            let _ = std::fs::create_dir_all(&remux_dir);
            let lib = app.state::<LibraryState>();
            lib.set_remux_cache_dir(remux_dir).await;
            match lib.load_companion_catalog_cache(cache_dir).await {
                Ok(true) => crate::rf_log!(
                    "companion.server",
                    log::Level::Info,
                    "companion catalog cache loaded"
                ),
                Ok(false) => {}
                Err(e) => crate::rf_log!(
                    "companion.server",
                    log::Level::Warn,
                    "companion catalog cache load failed: {e}"
                ),
            }
        }

        *self.inner.app_handle.write().await = Some(app.clone());
        self.refresh_tailnet_host().await;

        let listener = match tokio::net::TcpListener::bind((LOOPBACK_BIND, DEFAULT_PORT)).await {
            Ok(l) => l,
            Err(_) => match tokio::net::TcpListener::bind((LOOPBACK_BIND, 0)).await {
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
            "companion server listening on {LOOPBACK_BIND}:{bound_port}"
        );

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
        if let Some(tx) = self.shutdown_tx.lock().unwrap().take() {
            let _ = tx.send(());
        }
    }

    pub async fn refresh_tailnet_host(&self) -> Option<String> {
        let host = tokio::task::spawn_blocking(detect_tailnet_host)
            .await
            .ok()
            .flatten();
        *self.inner.tailnet_host.write().await = host.clone();
        host
    }

    pub async fn mint_pairing_code(&self) -> PairingCode {
        let code = auth::random_pairing_code();
        let now = now_unix();
        let pairing = PairingCode {
            code: code.clone(),
            created_at: now,
            expires_at: now + 120,
            used: false,
            failures: 0,
        };
        *self.inner.pairing.write().await = Some(PairingCode {
            code: pairing.code.clone(),
            created_at: pairing.created_at,
            expires_at: pairing.expires_at,
            used: pairing.used,
            failures: 0,
        });
        pairing
    }

    pub async fn revoke_all(&self) {
        *self.inner.session_secret.write().await = generate_secret();
        self.inner.sessions.write().await.clear();
        *self.inner.pairing.write().await = None;
        self.inner.progress_cache.write().await.clear();
        self.inner.persist().await;
    }
}

/// Main window answers desktop `localStorage` reads for companion GET /progress.
pub fn register_progress_query_listener(app: &AppHandle) {
    let inner = app.state::<CompanionState>().inner.clone();
    app.listen("companion-progress-query-result", move |event| {
        let Ok(payload) = serde_json::from_str::<ProgressQueryResult>(event.payload()) else {
            return;
        };
        let inner = inner.clone();
        tauri::async_runtime::spawn(async move {
            if let Some(tx) = inner
                .progress_read_pending
                .write()
                .await
                .remove(&payload.request_id)
            {
                let _ = tx.send((payload.position_secs, payload.duration_secs));
            }
        });
    });
}

impl Default for CompanionState {
    fn default() -> Self {
        Self::new()
    }
}
