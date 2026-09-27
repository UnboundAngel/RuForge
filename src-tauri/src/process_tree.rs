use tauri_plugin_shell::process::CommandChild;

/// Kill a Tauri shell sidecar and any child processes (yt-dlp spawns ffmpeg, and the
/// PyInstaller yt-dlp builds fork a second interpreter process).
pub fn kill_shell_child_tree(child: CommandChild) {
    let pid = child.pid();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(unix)]
    kill_descendants(pid);
    let _ = child.kill();
}

/// Children are killed before their parent so a dying parent cannot reparent them to init.
#[cfg(unix)]
fn kill_descendants(pid: u32) {
    for child in child_pids(pid) {
        kill_descendants(child);
        // SAFETY: plain signal send; a stale pid only yields ESRCH.
        unsafe {
            libc::kill(child as libc::pid_t, libc::SIGKILL);
        }
    }
}

#[cfg(target_os = "linux")]
fn child_pids(parent: u32) -> Vec<u32> {
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|e| e.file_name().to_str()?.parse::<u32>().ok())
        .filter(|pid| {
            std::fs::read_to_string(format!("/proc/{pid}/stat"))
                .ok()
                .and_then(|stat| parse_stat_ppid(&stat))
                == Some(parent)
        })
        .collect()
}

/// `comm` in `/proc/<pid>/stat` may itself contain spaces and parentheses, so fields are
/// read after the last `)`.
#[cfg(target_os = "linux")]
fn parse_stat_ppid(stat: &str) -> Option<u32> {
    let rest = &stat[stat.rfind(')')? + 1..];
    rest.split_whitespace().nth(1)?.parse().ok()
}

#[cfg(all(unix, not(target_os = "linux")))]
fn child_pids(parent: u32) -> Vec<u32> {
    let Ok(out) = std::process::Command::new("pgrep")
        .args(["-P", &parent.to_string()])
        .output()
    else {
        return Vec::new();
    };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| l.trim().parse().ok())
        .collect()
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn stat_ppid_survives_parens_in_comm() {
        assert_eq!(parse_stat_ppid("42 (a) b (c)) S 7 42 42 0"), Some(7));
        assert_eq!(parse_stat_ppid("42 (yt-dlp) S 1234 42 42 0"), Some(1234));
    }

    #[test]
    fn finds_spawned_child() {
        let mut child = std::process::Command::new("sleep").arg("30").spawn().unwrap();
        let me = std::process::id();
        assert!(child_pids(me).contains(&child.id()));
        let _ = child.kill();
        let _ = child.wait();
    }
}
