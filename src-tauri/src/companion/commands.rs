use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::companion::local_name::{
    friendly_browser_url, probe_friendly_host, LocalNameProbe, FRIENDLY_HOST, HOSTS_FILE_LINE,
};
use crate::companion::{browser_base_url, CompanionState};
use crate::dev_gate;

fn require_dev_gate(app: &AppHandle) -> Result<(), String> {
    if dev_gate::dev_gate_enabled(&app.config().identifier) {
        Ok(())
    } else {
        Err("companion_dev_gate_disabled".to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionStatus {
    pub running: bool,
    pub port: u16,
    /// Same-PC browser URL when the server is running (`http://localhost:<port>`).
    pub browser_url: Option<String>,
    /// Reserved for future LAN mode; not used by V1 Browser Companion UI.
    pub lan_ip: Option<String>,
    pub lan_reachable: bool,
    pub session_count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrPayload {
    pub url: String,
    pub ip: String,
    pub port: u16,
    pub code: String,
    pub exp_secs: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub label: String,
    pub created_at: i64,
    pub last_seen: i64,
}

#[tauri::command]
pub async fn companion_start(
    app: AppHandle,
    state: State<'_, CompanionState>,
) -> Result<CompanionStatus, String> {
    require_dev_gate(&app)?;
    state.start(app).await;
    companion_status(state).await
}

#[tauri::command]
pub async fn companion_stop(state: State<'_, CompanionState>) -> Result<(), String> {
    state.stop();
    Ok(())
}

#[tauri::command]
pub async fn companion_status(state: State<'_, CompanionState>) -> Result<CompanionStatus, String> {
    let inner = &state.inner;
    let running = inner.running.load(Ordering::SeqCst);
    let port = *inner.bind_port.read().await;
    let lan_ip = inner.lan_ip.read().await.clone();
    Ok(CompanionStatus {
        running,
        port,
        browser_url: running.then(|| browser_base_url(port)),
        lan_reachable: lan_ip.is_some(),
        lan_ip,
        session_count: inner.sessions.read().await.len() as u32,
    })
}

#[tauri::command]
pub async fn companion_qr_payload(
    app: AppHandle,
    state: State<'_, CompanionState>,
) -> Result<QrPayload, String> {
    require_dev_gate(&app)?;
    if !state.inner.running.load(Ordering::SeqCst) {
        return Err("companion_not_running".to_string());
    }
    let inner = &state.inner;
    let pairing = state.mint_pairing_code().await;
    let port = *inner.bind_port.read().await;
    let base = browser_base_url(port);
    let url = format!("{base}/?c={}", pairing.code);
    Ok(QrPayload {
        url,
        ip: "localhost".to_string(),
        port,
        code: pairing.code,
        exp_secs: pairing.expires_at,
    })
}

#[tauri::command]
pub async fn companion_sessions(
    state: State<'_, CompanionState>,
) -> Result<Vec<SessionInfo>, String> {
    let sessions = state.inner.sessions.read().await;
    Ok(sessions
        .values()
        .map(|s| SessionInfo {
            id: s.id.clone(),
            label: s.label.clone(),
            created_at: s.created_at,
            last_seen: s.last_seen,
        })
        .collect())
}

#[tauri::command]
pub async fn companion_revoke_all(state: State<'_, CompanionState>) -> Result<(), String> {
    state.revoke_all().await;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNameExperiment {
    pub host: String,
    pub resolvable: bool,
    pub loopback_ok: bool,
    pub resolved_ips: Vec<String>,
    pub hosts_file_line: String,
    /// Set only when loopback_ok and the companion server is running.
    pub friendly_browser_url: Option<String>,
}

/// Dev-gated same-PC probe for `ruforge.local` via OS resolver (hosts file or mDNS).
/// Does not register mDNS, edit hosts, or change the bind address.
#[tauri::command]
pub async fn companion_local_name_experiment(
    app: AppHandle,
    state: State<'_, CompanionState>,
) -> Result<LocalNameExperiment, String> {
    require_dev_gate(&app)?;
    let LocalNameProbe {
        resolvable,
        loopback_ok,
        resolved_ips,
    } = probe_friendly_host().await;
    let running = state.inner.running.load(Ordering::SeqCst);
    let port = *state.inner.bind_port.read().await;
    let friendly_browser_url = (loopback_ok && running).then(|| friendly_browser_url(port));
    Ok(LocalNameExperiment {
        host: FRIENDLY_HOST.to_string(),
        resolvable,
        loopback_ok,
        resolved_ips,
        hosts_file_line: HOSTS_FILE_LINE.to_string(),
        friendly_browser_url,
    })
}
