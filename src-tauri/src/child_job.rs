//! Each yt-dlp / ffmpeg / ffprobe child gets its own kill-on-close job object. Dropping the
//! guard kills the whole tree (PyInstaller's second interpreter, yt-dlp's ffmpeg), and if
//! RuForge dies by any means the OS closes the handle and does the same.

use std::process::{Command, Output, Stdio};

pub struct ChildJob {
    #[cfg(windows)]
    handle: windows::Win32::Foundation::HANDLE,
}

// SAFETY: a job handle is a kernel object reference usable from any thread.
unsafe impl Send for ChildJob {}
unsafe impl Sync for ChildJob {}

impl ChildJob {
    #[cfg(windows)]
    pub fn adopt(pid: u32) -> Option<ChildJob> {
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

        // SAFETY: every handle opened here is either owned by the returned guard or closed
        // before returning.
        unsafe {
            let job = ChildJob {
                handle: CreateJobObjectW(None, PCWSTR::null()).ok()?,
            };
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                job.handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
            .ok()?;
            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid).ok()?;
            let assigned = AssignProcessToJobObject(job.handle, process);
            let _ = CloseHandle(process);
            assigned.ok()?;
            Some(job)
        }
    }

    #[cfg(not(windows))]
    pub fn adopt(_pid: u32) -> Option<ChildJob> {
        None
    }
}

#[cfg(windows)]
impl Drop for ChildJob {
    fn drop(&mut self) {
        // SAFETY: the handle is owned by this guard and closed exactly once.
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.handle);
        }
    }
}

/// Like `tauri_plugin_shell::process::Command::output`, but the child tree dies if this future
/// is dropped (a timeout abandoning it) or RuForge exits.
pub async fn output(cmd: impl Into<Command>) -> std::io::Result<Output> {
    let mut cmd = tokio::process::Command::from(cmd.into());
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let child = cmd.spawn()?;
    let _job = child.id().and_then(ChildJob::adopt);
    child.wait_with_output().await
}

/// `output` on its own task: a caller that goes away (an HTTP client hanging up) no longer
/// stops the child. Only RuForge exiting does.
pub async fn output_detached(cmd: impl Into<Command>) -> std::io::Result<Output> {
    tokio::spawn(output(cmd.into()))
        .await
        .map_err(std::io::Error::other)?
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use std::time::Duration;

    static SERIAL: Mutex<()> = Mutex::new(());
    const OWNER_ENV: &str = "RF_CHILD_JOB_OWNER";

    fn child_pids(parent: u32) -> Vec<u32> {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        };
        let mut out = Vec::new();
        unsafe {
            let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
                return out;
            };
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            let mut ok = Process32FirstW(snap, &mut entry).is_ok();
            while ok {
                if entry.th32ParentProcessID == parent {
                    out.push(entry.th32ProcessID);
                }
                ok = Process32NextW(snap, &mut entry).is_ok();
            }
            let _ = CloseHandle(snap);
        }
        out
    }

    fn exits_within(pid: u32, wait: Duration) -> bool {
        use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
        use windows::Win32::System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE};
        unsafe {
            let Ok(h) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) else {
                return true;
            };
            let r = WaitForSingleObject(h, wait.as_millis() as u32);
            let _ = CloseHandle(h);
            r == WAIT_OBJECT_0
        }
    }

    fn wait_for_children(parent: u32) -> Vec<u32> {
        for _ in 0..50 {
            let kids = child_pids(parent);
            if !kids.is_empty() {
                return kids;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        panic!("no child processes appeared under {parent}");
    }

    fn pinger() -> Command {
        let mut cmd = Command::new("cmd");
        cmd.args(["/c", "ping -n 60 127.0.0.1 >nul"]);
        cmd
    }

    #[test]
    fn dropping_the_guard_kills_child_and_grandchild() {
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let mut child = pinger().spawn().unwrap();
        let job = ChildJob::adopt(child.id()).expect("adopt");
        let grandchildren = wait_for_children(child.id());

        drop(job);

        assert!(exits_within(child.id(), Duration::from_secs(5)));
        for pid in grandchildren {
            assert!(exits_within(pid, Duration::from_secs(5)), "grandchild {pid} survived");
        }
        let _ = child.wait();
    }

    #[test]
    fn timed_out_output_kills_the_tree() {
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let me = std::process::id();
        let before = child_pids(me);
        let (result, tree) = rt.block_on(async {
            let probe = async {
                for _ in 0..25 {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    let kids: Vec<u32> =
                        child_pids(me).into_iter().filter(|p| !before.contains(p)).collect();
                    if let Some(&cmd) = kids.first() {
                        let grand = child_pids(cmd);
                        if !grand.is_empty() {
                            return [vec![cmd], grand].concat();
                        }
                    }
                }
                Vec::new()
            };
            tokio::join!(tokio::time::timeout(Duration::from_secs(3), output(pinger())), probe)
        });
        assert!(result.is_err(), "pinger should have hit the timeout");
        assert!(tree.len() >= 2, "expected cmd and ping, saw {tree:?}");
        for pid in tree {
            assert!(exits_within(pid, Duration::from_secs(5)), "{pid} survived the abandoned output");
        }
    }

    fn slow_writer(marker: &std::path::Path) -> Command {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("cmd");
        cmd.raw_arg(format!(
            "/c ping -n 4 127.0.0.1 >nul & echo done>\"{}\"& echo done",
            marker.display()
        ));
        cmd
    }

    fn marker(name: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("rf_child_job_{name}_{}", std::process::id()));
        let _ = std::fs::remove_file(&p);
        p
    }

    #[test]
    fn a_long_run_finishes_with_its_job_held() {
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let done = marker("long");
        let rt = tokio::runtime::Runtime::new().unwrap();
        let out = rt.block_on(output(slow_writer(&done))).unwrap();
        assert!(out.status.success());
        assert!(String::from_utf8_lossy(&out.stdout).contains("done"));
        assert!(done.is_file(), "child was cut short before it wrote its result");
        let _ = std::fs::remove_file(done);
    }

    #[test]
    fn a_detached_run_outlives_a_caller_that_hangs_up() {
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let done = marker("detached");
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let hung_up =
                tokio::time::timeout(Duration::from_millis(500), output_detached(slow_writer(&done))).await;
            assert!(hung_up.is_err(), "caller should have given up first");
            for _ in 0..80 {
                if done.is_file() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        });
        assert!(done.is_file(), "detached child died with its caller");
        let _ = std::fs::remove_file(done);
    }

    #[test]
    fn force_killed_owner_takes_its_children() {
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let name = concat!(module_path!(), "::owner_process");
        let filter = name.split_once("::").map(|(_, rest)| rest).unwrap_or(name);
        let mut owner = Command::new(std::env::current_exe().unwrap())
            .args(["--ignored", "--exact", filter, "--nocapture", "--test-threads=1"])
            .env(OWNER_ENV, "1")
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();

        let mut grandchild = None;
        for _ in 0..100 {
            if let Some(&cmd) = child_pids(owner.id()).first() {
                if let Some(&ping) = child_pids(cmd).first() {
                    grandchild = Some((cmd, ping));
                    break;
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let (cmd, ping) = grandchild.expect("owner never spawned its pinger");

        owner.kill().unwrap();
        let _ = owner.wait();

        assert!(exits_within(cmd, Duration::from_secs(5)), "child {cmd} outlived its owner");
        assert!(exits_within(ping, Duration::from_secs(5)), "grandchild {ping} outlived its owner");
    }

    #[test]
    #[ignore]
    fn owner_process() {
        if std::env::var_os(OWNER_ENV).is_none() {
            return;
        }
        let child = pinger().spawn().unwrap();
        let _job = ChildJob::adopt(child.id()).expect("adopt");
        std::thread::sleep(Duration::from_secs(60));
    }
}
