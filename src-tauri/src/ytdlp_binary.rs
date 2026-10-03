//! Resolved yt-dlp executable: AppData `bin/` install or bundled sidecar, whichever is newer.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{process::Command, ShellExt};

/// yt-dlp release asset basename for this OS (must match GitHub release filenames).
pub fn upstream_asset_basename() -> &'static str {
    #[cfg(windows)]
    {
        "yt-dlp.exe"
    }
    #[cfg(target_os = "macos")]
    {
        "yt-dlp_macos"
    }
    // The plain `yt-dlp` asset is a Python zipapp that needs a system python3; the
    // `_linux` builds are standalone.
    #[cfg(all(unix, not(target_os = "macos"), target_arch = "aarch64"))]
    {
        "yt-dlp_linux_aarch64"
    }
    #[cfg(all(unix, not(target_os = "macos"), not(target_arch = "aarch64")))]
    {
        "yt-dlp_linux"
    }
}

/// Local userdata filename under `app_data/bin/` (matches downloaded asset basename).
pub fn userdata_ytdlp_filename() -> &'static str {
    upstream_asset_basename()
}

pub fn userdata_ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("bin").join(userdata_ytdlp_filename()))
}

pub fn userdata_ytdlp_bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("bin"))
}

fn userdata_looks_present(path: &Path) -> bool {
    path.is_file()
        && std::fs::metadata(path)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
}

static BUNDLED_WINS: AtomicBool = AtomicBool::new(false);

pub fn set_bundled_wins(value: bool) {
    BUNDLED_WINS.store(value, Ordering::Relaxed);
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ReconcileGate {
    NotStarted,
    Pending,
    Done,
}

static GATE: Mutex<ReconcileGate> = Mutex::new(ReconcileGate::NotStarted);
static GATE_CV: Condvar = Condvar::new();
const GATE_WAIT: Duration = Duration::from_secs(20);

fn set_gate(state: ReconcileGate) {
    *GATE.lock().unwrap_or_else(|e| e.into_inner()) = state;
    GATE_CV.notify_all();
}

fn wait_for_gate() -> bool {
    let guard = GATE.lock().unwrap_or_else(|e| e.into_inner());
    let (guard, _) = GATE_CV
        .wait_timeout_while(guard, GATE_WAIT, |s| *s == ReconcileGate::Pending)
        .unwrap_or_else(|e| e.into_inner());
    *guard == ReconcileGate::Done
}

pub fn parse_ytdlp_version_parts(line: &str) -> Vec<u32> {
    let first = line.lines().next().unwrap_or(line).trim();
    first
        .strip_prefix('v')
        .unwrap_or(first)
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|x| x.parse::<u32>().ok())
        .collect()
}

fn bundled_ytdlp_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let name = format!("yt-dlp{}", std::env::consts::EXE_SUFFIX);
    Some(exe.parent()?.join(name))
}

fn probe_version_blocking(path: &Path) -> Option<Vec<u32>> {
    let mut cmd = std::process::Command::new(path);
    cmd.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let parts = parse_ytdlp_version_parts(&String::from_utf8_lossy(&out.stdout));
    (parts.len() >= 3).then_some(parts)
}

fn reconcile_userdata_ytdlp_blocking(app: &AppHandle) {
    let Ok(user_path) = userdata_ytdlp_path(app) else {
        return;
    };
    if !user_path.is_file() {
        return;
    }
    let bundled = bundled_ytdlp_path().and_then(|p| probe_version_blocking(&p));
    let user = probe_version_blocking(&user_path);
    match (&bundled, &user) {
        (Some(b), Some(u)) if u > b => return,
        (None, Some(_)) => return,
        _ => {}
    }

    crate::rf_log!(
        "download.binary",
        log::Level::Info,
        "yt-dlp: bundled {:?} is not older than userdata {:?}; removing {}",
        bundled,
        user,
        user_path.display()
    );
    if let Err(e) = std::fs::remove_file(&user_path) {
        crate::rf_log!("download.binary", log::Level::Warn, "yt-dlp: could not remove userdata copy: {}", e);
        set_bundled_wins(true);
    }
}

pub fn start_userdata_ytdlp_reconcile(app: &AppHandle) {
    set_gate(ReconcileGate::Pending);
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("ytdlp-reconcile".into())
        .spawn(move || {
            reconcile_userdata_ytdlp_blocking(&app);
            set_gate(ReconcileGate::Done);
        });
    if spawned.is_err() {
        set_bundled_wins(true);
        set_gate(ReconcileGate::Done);
    }
}

pub fn active_userdata_ytdlp_path(app: &AppHandle) -> Option<PathBuf> {
    if !wait_for_gate() || BUNDLED_WINS.load(Ordering::Relaxed) {
        return None;
    }
    userdata_ytdlp_path(app)
        .ok()
        .filter(|p| userdata_looks_present(p))
}

/// True when [`ytdlp_shell_command`] resolves to the AppData binary.
pub fn is_userdata_ytdlp_active(app: &AppHandle) -> bool {
    active_userdata_ytdlp_path(app).is_some()
}

/// Shell command for yt-dlp: AppData binary if active, else bundled sidecar.
pub fn ytdlp_shell_command(app: &AppHandle) -> Result<Command, String> {
    if let Some(user_path) = active_userdata_ytdlp_path(app) {
        crate::rf_log!(
            "download.binary",
            log::Level::Info,
            "yt-dlp: using userdata binary {}",
            user_path.display()
        );
        return Ok(app.shell().command(&user_path));
    }

    crate::rf_log!("download.binary", log::Level::Debug, "yt-dlp: using bundled sidecar");
    app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())
}

/// Always the bundled external binary (`--version` / baseline for "update available").
pub fn bundled_ytdlp_command(app: &AppHandle) -> Result<Command, String> {
    app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())
}

/// If the user has installed Deno into `app_data/bin/`, appends `--js-runtimes deno:<path>` to `args`.
///
/// Called immediately after [`ytdlp_push_politeness_args`] at every yt-dlp spawn site so YouTube's
/// n-challenge can be solved without the user having to install Deno manually.
pub fn ytdlp_push_js_runtime_args(app: &AppHandle, args: &mut Vec<String>) {
    if let Some(deno_path) = crate::deno_binary::resolved_deno_path_if_present(app) {
        crate::rf_log!(
            "download.binary",
            log::Level::Debug,
            "yt-dlp: injecting --js-runtimes deno:{}",
            deno_path.display()
        );
        args.push("--js-runtimes".into());
        args.push(format!("deno:{}", deno_path.display()));
    }
}
