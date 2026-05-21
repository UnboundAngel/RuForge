//! Relabel WebView2 render sessions in the Windows volume mixer (sndvol).
//!
//! WebView2 plays audio in a child process, so Windows lists "Microsoft Edge WebView2"
//! instead of the host app. Core Audio lets us set display name and icon on those
//! sessions when they belong to our process tree (see WebView2Feedback #2236).

#![cfg(windows)]

use std::collections::HashMap;
use std::mem::size_of;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use windows::core::{Interface, PCWSTR};
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::Media::Audio::{
    eMultimedia, eRender, IAudioSessionControl2, IAudioSessionEnumerator,
    IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

static BRANDING_THREAD_STARTED: AtomicBool = AtomicBool::new(false);

/// Taskbar / toast identity; does not fix sndvol by itself but keeps Windows metadata consistent.
pub fn set_explicit_app_user_model_id(app_id: &str) {
    let wide = wide_null(app_id);
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(PCWSTR(wide.as_ptr()));
    }
}

/// Polls the default playback device and renames child WebView2 audio sessions.
pub fn spawn_mixer_branding_thread(display_name: String, icon_path: PathBuf) {
    if BRANDING_THREAD_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::Builder::new()
        .name("ruforge-audio-brand".into())
        .spawn(move || branding_loop(&display_name, &icon_path))
        .ok();
}

fn branding_loop(display_name: &str, icon_path: &PathBuf) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    loop {
        if let Err(e) = scan_and_brand(display_name, icon_path) {
            eprintln!("[ruforge] volume mixer branding: {e}");
        }
        thread::sleep(Duration::from_millis(1500));
    }
}

fn scan_and_brand(display_name: &str, icon_path: &PathBuf) -> Result<(), String> {
    let name_wide = wide_null(display_name);
    let icon_wide = wide_null(&icon_path.to_string_lossy());
    let our_pid = std::process::id();

    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("MMDeviceEnumerator: {e}"))?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|e| format!("default endpoint: {e}"))?;
        let session_manager: IAudioSessionManager2 = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| format!("IAudioSessionManager2: {e}"))?;
        let session_enum: IAudioSessionEnumerator = session_manager
            .GetSessionEnumerator()
            .map_err(|e| format!("session enumerator: {e}"))?;
        let count = session_enum
            .GetCount()
            .map_err(|e| format!("session count: {e}"))?;

        for i in 0..count {
            let Ok(control) = session_enum.GetSession(i) else {
                continue;
            };
            let Ok(control2) = control.cast::<IAudioSessionControl2>() else {
                continue;
            };

            // S_OK means this is the system-sounds pseudo-session, not app media.
            if control2.IsSystemSoundsSession().0 == 0 {
                continue;
            }

            let Ok(session_pid) = control2.GetProcessId() else {
                continue;
            };
            if session_pid == 0 || !is_descendant_of(our_pid, session_pid) {
                continue;
            }

            let _ = control2.SetDisplayName(PCWSTR(name_wide.as_ptr()), std::ptr::null());
            let _ = control2.SetIconPath(PCWSTR(icon_wide.as_ptr()), std::ptr::null());
        }
    }

    Ok(())
}

fn is_descendant_of(ancestor: u32, pid: u32) -> bool {
    if pid == ancestor {
        return true;
    }
    let Ok(parents) = build_parent_map() else {
        return false;
    };
    let mut current = pid;
    for _ in 0..256 {
        if current == 0 {
            return false;
        }
        if current == ancestor {
            return true;
        }
        current = parents.get(&current).copied().unwrap_or(0);
    }
    false
}

fn build_parent_map() -> Result<HashMap<u32, u32>, String> {
    let mut map = HashMap::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
            .map_err(|e| format!("toolhelp snapshot: {e}"))?;
        let mut entry = PROCESSENTRY32W {
            dwSize: size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                map.insert(entry.th32ProcessID, entry.th32ParentProcessID);
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }
    Ok(map)
}

fn wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}
