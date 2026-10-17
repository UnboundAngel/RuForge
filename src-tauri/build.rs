fn main() {
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    // Games is separable source: the public tree may omit `src/games/`, and the core builds without it.
    println!("cargo:rustc-check-cfg=cfg(ruforge_games)");
    println!("cargo:rerun-if-changed=src/games/mod.rs");
    // RUFORGE_PUBLIC_BUILD=1 builds the installer shape from a tree that still has Games:
    // no Games cfg, and the Games-only capability files are left out of the app.
    println!("cargo:rerun-if-env-changed=RUFORGE_PUBLIC_BUILD");
    let public_build = std::env::var("RUFORGE_PUBLIC_BUILD").is_ok_and(|v| v == "1");
    if public_build {
        public_capabilities();
    } else if std::path::Path::new("src/games/mod.rs").exists() {
        println!("cargo:rustc-cfg=ruforge_games");
    }
    scheduled::generate();
    tauri_build::build()
}

const GAMES_CAPABILITY_FILES: &[&str] = &["glance-popout.json", "games-windows.json", "games-system-hotkeys.json"];

/// Capabilities auto-load from the directory, so the only way to leave some out is the
/// `app.security.capabilities` allowlist. It goes through TAURI_CONFIG (merged over any value the
/// tauri CLI already set) for tauri-build, and through rustc-env for the `generate_context!` macro.
fn public_capabilities() {
    println!("cargo:rerun-if-changed=capabilities");
    let mut ids: Vec<String> = Vec::new();
    for entry in std::fs::read_dir("capabilities").expect("capabilities dir").flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".json") || GAMES_CAPABILITY_FILES.contains(&name.as_str()) {
            continue;
        }
        let text = std::fs::read_to_string(entry.path()).unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name}: {e}"));
        ids.push(json["identifier"].as_str().unwrap_or_else(|| panic!("{name}: identifier missing")).to_string());
    }
    ids.sort();
    let mut config: serde_json::Value = std::env::var("TAURI_CONFIG")
        .ok()
        .and_then(|v| serde_json::from_str(&v).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    config["app"]["security"]["capabilities"] = serde_json::json!(ids);
    let merged = config.to_string();
    std::env::set_var("TAURI_CONFIG", &merged);
    println!("cargo:rustc-env=TAURI_CONFIG={merged}");
}

/// Scheduled features are separable the same way: `src/scheduled/<id>/` (TS) and
/// `src-tauri/src/scheduled/<id_snake>/mod.rs` are absent on public until release.
/// The manifest and the Rust dispatcher are generated so the core never names a feature.
mod scheduled {
    use std::fmt::Write as _;
    use std::path::{Path, PathBuf};

    pub fn generate() {
        let ts_root = Path::new("../src/scheduled");
        let rs_root = Path::new("src/scheduled");
        println!("cargo:rerun-if-changed=../src/scheduled");
        println!("cargo:rerun-if-changed=src/scheduled");

        let mut manifest = String::new();
        let mut mods = String::new();
        let mut arms = String::new();
        for (id, unlock_at, released) in read_features(ts_root) {
            println!("cargo:rerun-if-changed=../src/scheduled/{id}/feature.json");
            writeln!(manifest, "    ScheduledFeature {{ id: {id:?}, unlock_at: {unlock_at:?}, released: {released} }},").unwrap();
            let snake = id.replace('-', "_");
            let rs = rs_root.join(&snake).join("mod.rs");
            if rs.exists() {
                let abs = absolute(&rs);
                writeln!(mods, "#[path = {:?}]\npub mod {snake};", abs.display().to_string()).unwrap();
                writeln!(arms, "        {id:?} => {snake}::dispatch(app, method, args).await,").unwrap();
            }
        }

        let out = format!(
            "pub static MANIFEST: &[ScheduledFeature] = &[\n{manifest}];\n\n{mods}\n\
             #[allow(unused_variables)]\n\
             pub async fn dispatch(app: &tauri::AppHandle, id: &str, method: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {{\n\
             \x20   match id {{\n{arms}        _ => Err(format!(\"scheduled feature {{id}} has no Rust side\")),\n    }}\n}}\n"
        );
        let dest = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("scheduled_gen.rs");
        std::fs::write(dest, out).unwrap();
    }

    fn absolute(p: &Path) -> PathBuf {
        std::fs::canonicalize(p)
            .map(|p| {
                // Strip the Windows verbatim prefix; `#[path]` does not accept `\\?\`.
                let s = p.display().to_string();
                PathBuf::from(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string())
            })
            .unwrap_or_else(|_| p.to_path_buf())
    }

    fn read_features(root: &Path) -> Vec<(String, String, bool)> {
        let Ok(entries) = std::fs::read_dir(root) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        for entry in entries.flatten() {
            let id = entry.file_name().to_string_lossy().to_string();
            let path = entry.path().join("feature.json");
            let Ok(text) = std::fs::read_to_string(&path) else {
                continue;
            };
            let json: serde_json::Value = serde_json::from_str(&text)
                .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            let unlock_at = json["unlockAt"]
                .as_str()
                .unwrap_or_else(|| panic!("{}: unlockAt missing", path.display()))
                .to_string();
            let released = json["released"].as_bool().unwrap_or(false);
            out.push((id, unlock_at, released));
        }
        out.sort();
        out
    }
}
