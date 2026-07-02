use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::companion::CompanionState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionStatus {
    pub running: bool,
    pub port: u16,
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
    let lan_ip = inner.lan_ip.read().await.clone();
    Ok(CompanionStatus {
        running: inner.running.load(Ordering::SeqCst),
        port: *inner.bind_port.read().await,
        lan_reachable: lan_ip.is_some(),
        lan_ip,
        session_count: inner.sessions.read().await.len() as u32,
    })
}

#[tauri::command]
pub async fn companion_qr_payload(state: State<'_, CompanionState>) -> Result<QrPayload, String> {
    if !state.inner.running.load(Ordering::SeqCst) {
        return Err("companion_not_running".to_string());
    }
    let inner = &state.inner;
    let pairing = state.mint_pairing_code().await;
    let ip = inner
        .lan_ip
        .read()
        .await
        .clone()
        .ok_or_else(|| "lan_ip_unavailable".to_string())?;
    let port = *inner.bind_port.read().await;
    let url = format!("http://{ip}:{port}/?c={}", pairing.code);
    Ok(QrPayload {
        url,
        ip,
        port,
        code: pairing.code,
        exp_secs: pairing.expires_at,
    })
}

#[tauri::command]
pub async fn companion_sessions(state: State<'_, CompanionState>) -> Result<Vec<SessionInfo>, String> {
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