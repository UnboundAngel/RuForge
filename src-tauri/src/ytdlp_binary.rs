//! Resolved yt-dlp executable: AppData `bin/` install or a legacy bundled copy, whichever is newer.

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

/// Legacy copy beside the exe (older installers) or in `src-tauri/binaries` in dev; none for new installs.
fn bundled_ytdlp_path() -> Option<PathBuf> {
    crate::tools::paths::resolve_bundled(crate::tools::paths::Tool::YtDlp)
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

/// Puts a verified download at `final_path`. Watchlist and metadata runs keep yt-dlp.exe open
/// outside the download queue, and Windows refuses to delete a running exe but lets it be renamed,
/// so the old copy is moved aside first and removed on a later launch.
pub fn swap_in_ytdlp(part_path: &Path, final_path: &Path) -> Result<(), String> {
    let mut retired: Option<PathBuf> = None;
    if final_path.exists() {
        if std::fs::remove_file(final_path).is_err() {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let aside = final_path.with_extension(format!("old-{stamp}"));
            std::fs::rename(final_path, &aside).map_err(|e| {
                format!("yt-dlp is in use and could not be replaced ({e}). Close RuForge's other tasks and try again.")
            })?;
            retired = Some(aside);
        }
    }
    if let Err(e) = std::fs::rename(part_path, final_path) {
        if let Some(aside) = &retired {
            let _ = std::fs::rename(aside, final_path);
        }
        return Err(format!("Could not install the new yt-dlp: {e}"));
    }
    Ok(())
}

/// Removes copies retired by [`swap_in_ytdlp`] and a stale `.download.part`, now that nothing runs them.
fn sweep_retired_ytdlp(app: &AppHandle) {
    let Ok(dir) = userdata_ytdlp_bin_dir(app) else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    let stem = Path::new(userdata_ytdlp_filename())
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("yt-dlp")
        .to_string();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let retired = name.starts_with(&format!("{stem}.old-"));
        let stale_part = name == format!("{stem}.download.part");
        if retired || stale_part {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

fn reconcile_userdata_ytdlp_blocking(app: &AppHandle) {
    sweep_retired_ytdlp(app);
    let Ok(user_path) = userdata_ytdlp_path(app) else {
        return;
    };
    if !user_path.is_file() {
        return;
    }
    // Nothing bundled to compare against: the downloaded copy is the only one there is.
    let Some(bundled_path) = bundled_ytdlp_path() else {
        return;
    };
    let bundled = probe_version_blocking(&bundled_path);
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

/// Executable yt-dlp should run: the AppData binary if active, else a legacy bundled copy.
pub fn resolved_ytdlp_path(app: &AppHandle) -> Option<PathBuf> {
    active_userdata_ytdlp_path(app).or_else(bundled_ytdlp_path)
}

/// Shell command for yt-dlp, with `--ffmpeg-location` when ffmpeg is installed.
pub fn ytdlp_shell_command(app: &AppHandle) -> Result<Command, String> {
    let path = resolved_ytdlp_path(app).ok_or_else(crate::tools::missing_message)?;
    crate::rf_log!("download.binary", log::Level::Debug, "yt-dlp: using {}", path.display());
    let cmd = app.shell().command(&path);
    let ffmpeg_dir = crate::tools::paths::resolve(app, crate::tools::paths::Tool::Ffmpeg)
        .and_then(|p| p.parent().map(Path::to_path_buf));
    Ok(match ffmpeg_dir {
        Some(dir) => cmd.args(["--ffmpeg-location".into(), dir.display().to_string()]),
        None => cmd,
    })
}

/// Legacy bundled yt-dlp only (`--version` / baseline for "update available").
pub fn bundled_ytdlp_command(app: &AppHandle) -> Result<Command, String> {
    let path = bundled_ytdlp_path().ok_or_else(|| "No bundled yt-dlp".to_string())?;
    Ok(app.shell().command(path))
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
