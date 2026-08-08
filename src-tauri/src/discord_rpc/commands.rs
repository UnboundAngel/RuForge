use tauri::State;

use crate::discord_rpc::{
    DiscordActivityPayload, DiscordRpcState, DiscordRpcStatus,
};

#[tauri::command]
pub fn discord_rpc_set_enabled(
    state: State<'_, DiscordRpcState>,
    enabled: bool,
) -> Result<(), String> {
    state.set_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub fn discord_rpc_set_activity(
    state: State<'_, DiscordRpcState>,
    payload: DiscordActivityPayload,
) -> Result<(), String> {
    state.set_activity(payload);
    Ok(())
}

#[tauri::command]
pub fn discord_rpc_clear_activity(state: State<'_, DiscordRpcState>) -> Result<(), String> {
    state.clear_activity();
    Ok(())
}

#[tauri::command]
pub fn discord_rpc_status(state: State<'_, DiscordRpcState>) -> Result<DiscordRpcStatus, String> {
    Ok(state.status())
}
