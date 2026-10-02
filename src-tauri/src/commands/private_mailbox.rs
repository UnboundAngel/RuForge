//! State handed between RuForge's own webviews. An `emitTo` payload reaches every webview that listens
//! with the `Any` target, so private payloads sit here and the event only carries a ping. Remote pages
//! can neither listen for events (see `capability_audit`) nor invoke app commands.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::State;

/// Latest-value slots: the receiver only ever needs the newest state.
const SLOT_KEYS: &[&str] = &["notify-overlay-state", "desktop-island-state"];
/// Queues: every record matters until the receiver drains it.
const QUEUE_KEYS: &[&str] = &[
    "notification-center-record",
    "notify-overlay-action",
    "desktop-island-control",
];
const QUEUE_CAP: usize = 64;

#[derive(Default)]
pub struct PrivateMailbox {
    slots: Mutex<HashMap<String, (u64, Value)>>,
    queues: Mutex<HashMap<String, Vec<Value>>>,
    version: Mutex<u64>,
}

#[derive(Serialize)]
pub struct MailboxSlot {
    version: u64,
    payload: Value,
}

fn check_key(key: &str, allowed: &[&str]) -> Result<(), String> {
    if allowed.contains(&key) {
        Ok(())
    } else {
        Err(format!("unknown mailbox key: {key}"))
    }
}

/// Returns the version the receiver uses to drop replies that arrive out of order.
#[tauri::command]
pub fn private_mailbox_put(
    state: State<'_, PrivateMailbox>,
    key: String,
    payload: Value,
) -> Result<u64, String> {
    check_key(&key, SLOT_KEYS)?;
    let version = {
        let mut v = state.version.lock().map_err(|e| e.to_string())?;
        *v += 1;
        *v
    };
    state
        .slots
        .lock()
        .map_err(|e| e.to_string())?
        .insert(key, (version, payload));
    Ok(version)
}

#[tauri::command]
pub fn private_mailbox_get(
    state: State<'_, PrivateMailbox>,
    key: String,
) -> Result<Option<MailboxSlot>, String> {
    check_key(&key, SLOT_KEYS)?;
    Ok(state
        .slots
        .lock()
        .map_err(|e| e.to_string())?
        .get(&key)
        .map(|(version, payload)| MailboxSlot { version: *version, payload: payload.clone() }))
}

#[tauri::command]
pub fn private_mailbox_push(
    state: State<'_, PrivateMailbox>,
    key: String,
    payload: Value,
) -> Result<(), String> {
    check_key(&key, QUEUE_KEYS)?;
    let mut queues = state.queues.lock().map_err(|e| e.to_string())?;
    let queue = queues.entry(key).or_default();
    queue.push(payload);
    if queue.len() > QUEUE_CAP {
        queue.drain(..queue.len() - QUEUE_CAP);
    }
    Ok(())
}

#[tauri::command]
pub fn private_mailbox_take(
    state: State<'_, PrivateMailbox>,
    key: String,
) -> Result<Vec<Value>, String> {
    check_key(&key, QUEUE_KEYS)?;
    Ok(state
        .queues
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&key)
        .unwrap_or_default())
}
