# Windows Tauri + Rust Development Cycle Optimization

> Cursor skill (preferred entry point across projects): `~/.cursor/skills/tauri-rust-dev-cycle/` (`SKILL.md` + `reference.md`). This repo copy is the same playbook for reading inside RuForge.

A reusable playbook for investigating and improving edit-to-test time and development disk growth in Tauri + Rust projects.

This is not a project status report. It is a process you can hand to Cursor (or another agent) inside any Tauri/Rust repository and run safely.

RuForge is used as a worked example throughout. Treat RuForge paths, numbers, and product details as evidence from one machine and one project, not as defaults to copy blindly.

## Scope labels used in this guide

Every technique below is tagged so you can filter by relevance:

| Label | Meaning |
|-------|---------|
| **General** | Applies to most Tauri + Rust projects on any OS |
| **Windows** | Windows-specific process, filesystem, or toolchain behavior |
| **ReFS / Dev Drive** | Specific to ReFS volumes and Windows Dev Drives |
| **Example (RuForge)** | Concrete finding from the RuForge session. Adapt, do not assume |

## How to use this guide in another repo

1. Fill the worksheet in section 16 first.
2. Follow section 14 in order. Do not skip baseline measurements.
3. Keep every conclusion labeled with the vocabulary in section 7.
4. Reverify any version-sensitive claim (Rust issue status, Cargo profile syntax, Tauri watcher docs) against the project's live toolchain before acting on it.

---

## 1. Purpose and success criteria

### Goals

1. **Reduce edit-to-test time.** The clock that matters is: save a file, then see the result in the running app or browser.
2. **Prevent unbounded development disk use.** Development artifacts should grow for a reason, stay classifiable, and be reclaimable without touching user data.

### Success criteria

A project passes this process when:

- Frontend CSS and TypeScript edits land through HMR without restarting the desktop process.
- Any secondary frontend (if present) rebuilds without restarting the desktop process.
- A Rust leaf edit recompiles and relaunches the app in a measured, acceptable time.
- Child watchers terminate on exit and interrupt.
- Development disk consumers are mapped, classified, and cleanable through dry-run tooling.
- Release profiles and release build commands are unchanged.
- Claims about disk size and build time are backed by repeated measurements.

### Separate systems must be measured separately

**General.** Do not treat "the app feels slow" as one bottleneck. These are different pipelines:

| System | Typical symptom when slow | Typical fix surface |
|--------|---------------------------|---------------------|
| Frontend HMR | CSS or TS edit takes seconds and reloads the page | Vite config, watch ignores |
| Frontend rebuild without Rust | Full Vite rebuild on every save | Vite watch scope, dependency graph |
| Rust compile | `Compiling yourcrate` on every edit | crate structure, incremental, features |
| Linking | Long pause after compile, large `.lib` / `.pdb` | Cargo `debug` profile |
| App startup | Window appears late after relaunch | Rust setup, plugin init, library scans |
| Embedded secondary frontend | Edit under `src-tauri` restarts the whole app | Tauri watcher + asset pipeline |
| Caches | Disk grows for days with no source growth | npm, Cargo registry, Vite caches |
| Runtime-generated files | Previews, logs, captures, temp media | app data directories, retention policy |

If you optimize the wrong system, you can make disk or rebuild time worse while the user-visible edit path barely changes.

---

## 2. Safety boundaries

These rules were used throughout the RuForge investigation and implementation. Apply them before recommending deletions or profile changes.

### Audit first

- Start read-only. Measure environment, pipeline, disk, and rebuild times before changing Cargo profiles, watchers, or scripts.
- Do not "clean to see if it helps" during the audit. Cleaning destroys evidence.

### Disk assumptions

- Never assume `target/` is the only disk consumer. npm cache, Cargo registry, WebView2 caches, website installers, and app runtime data often rival or exceed `target/`.
- Never classify user media or application data as disposable without proving ownership and purpose.
- Outside-repo paths can be larger than the repo. Measure them explicitly.

### Git and deletion

- No `git clean`, `git reset`, or `git restore` against a possibly dirty tree.
- No blanket deletion of `target/`, `node_modules/`, or app data.
- Prefer dry-run reports and guarded, category-scoped cleanup.

### Protected surfaces

Never touch without an explicit human decision:

- Signing keys (for example `%USERPROFILE%\.tauri\*.key`)
- Credentials, `.env`, tokens
- Updater signatures and live `updater.json` contents used by installed users
- Source sidecars under the project's binaries directory
- Protected release bundles (`target/release/bundle`, copied installers retained for distribution)
- User libraries and media vaults

### Process safety

- Do not run cleanup while Cargo, rustc, Tauri, the app, or relevant Vite watchers are active.
- Dry-run cleanup first. Require an explicit apply switch for deletion.
- Keep release behavior separate from development behavior. Dev profile changes must not alter `[profile.release]` or the release `beforeBuildCommand` contract.

### Example (RuForge): protected paths that looked "dev-like"

| Path | Why it is not disposable |
|------|--------------------------|
| `C:\RuForge\Media` | User media vault |
| `%USERPROFILE%\.tauri\ruforge.key` | Signing private key |
| `website/dist/releases` | Copied shipped installers |
| `src-tauri/binaries/*` | Source sidecar binaries |
| `%APPDATA%\com.attic.ruforge` | App configuration |

---

## 3. Establish the real environment

**General + Windows.** Version and filesystem details change which recommendations are safe. Record them before proposing flags.

### Checklist

Capture all of the following in the project worksheet:

1. Node and package manager versions
2. Tauri CLI and `@tauri-apps/cli` / `@tauri-apps/api` versions
3. Rust and Cargo versions (`rustc -V`, `cargo -V`)
4. Host triple and toolchain (MSVC vs GNU)
5. Linker in use (MSVC `link.exe`, `lld-link`, mold on other OSes)
6. Filesystem type for the repository volume and the Cargo target volume
7. Whether the volume is a Windows Dev Drive / ReFS volume
8. `CARGO_TARGET_DIR`, `CARGO_HOME`, `RUSTUP_HOME`
9. Cargo config files: `.cargo/config.toml`, `%USERPROFILE%\.cargo\config.toml`
10. Workspace members and crate types (`rlib`, `staticlib`, `cdylib`)
11. Dev, release, and custom Cargo profiles
12. Vite server / watch config and Tauri `beforeDevCommand` / `devUrl`
13. Sidecar paths (`externalBin`) and embedded-asset paths (`rust-embed`, `include_bytes!`, Tauri resources)

### Commands

```powershell
# Toolchain
node -v
npm -v
rustc -V
cargo -V
npx tauri -V

# Package pins (from package.json)
# Inspect: @tauri-apps/cli, vite, @vitejs/plugin-react

# Windows volume / Dev Drive
Get-Volume -DriveLetter D | Select-Object DriveLetter, FileSystem, FileSystemLabel, Size, SizeRemaining
# Optional admin: fsutil fsinfo volumeinfo D:
# Optional admin: fsutil devdrv query D:

# Cargo environment
echo $env:CARGO_TARGET_DIR
echo $env:CARGO_HOME
echo $env:RUSTUP_HOME
echo $env:CARGO_INCREMENTAL

# Config discovery
Get-ChildItem -Force .cargo, "$env:USERPROFILE\.cargo" -Filter config.toml -ErrorAction SilentlyContinue
```

```bash
# Unix-shaped equivalent for non-Windows projects
node -v; npm -v; rustc -V; cargo -V; npx tauri -V
echo "$CARGO_TARGET_DIR $CARGO_HOME $RUSTUP_HOME $CARGO_INCREMENTAL"
df -Th .
```

### Why this matters before recommending flags

| Detail | Why it changes advice |
|--------|------------------------|
| Rust >= 1.90 on ReFS Dev Drive | Incremental finalization can fail (see section 8). Reverify issue status. |
| NTFS vs ReFS | Same Cargo flags behave differently. Do not port ReFS workarounds to NTFS without evidence. |
| `CARGO_TARGET_DIR` outside the repo | Disk maps that only scan the repo miss the real `target/`. |
| Multiple crate types (`staticlib` + `cdylib` + `rlib`) | Larger link artifacts and longer link times than a simple binary crate. |
| Custom profiles / feature sets | Multiply fingerprint and incremental trees. |
| Vite watch ignoring `src-tauri` | Frontend HMR can be fine while Tauri still restarts on Companion-like assets. |

### Example (RuForge): environment that shaped the investigation

Observed on the investigation machine:

- Node `v22.20.0`, npm `11.8.0`
- rustc / cargo `1.93.1`
- tauri-cli `2.11.1`
- Repository on `D:` with filesystem `ReFS`, volume label `Dev`
- Windows Defender realtime protection was off during the root-cause pass
- Workspace members included path crates; lib crate-types were `staticlib`, `cdylib`, `rlib`

Those facts are machine-specific. Re-collect them on the next project.

---

## 4. Map the complete development pipeline

**General.** Draw the live pipeline before changing watchers.

### Canonical flow

```text
npm script (dev / tauri / custom)
  → Tauri CLI (`tauri dev`)
    → beforeDevCommand (often `npm run dev` / Vite)
    → Vite HMR server (devUrl, e.g. http://localhost:1420)
    → Cargo (`cargo run` / watch rebuild)
      → build.rs (`tauri_build::build()`, codegen, resource embedding)
      → rustc compile units
      → linker
      → sidecar copy into target/<profile>
      → executable launch
        → application setup (plugins, scans, network, tray, updater check)
```

### Identify which edits cause which work

| Edit type | Expected cheap path | Expensive failure mode |
|-----------|---------------------|------------------------|
| CSS / TS in main Vite app | Vite HMR only | Full page reload, or Tauri restart if files sit under watched Rust dirs |
| Generated assets under `src-tauri` | Disk refresh or secondary Vite watcher | Full Tauri relaunch even when Cargo is `FRESH` |
| Rust leaf module | Recompile one crate + relink + relaunch | Full dependency graph rebuild |
| `Cargo.toml` / features / profiles | Broad rebuild | Multiple fingerprint trees left behind |
| `build.rs` inputs | Rebuild + codegen | Cascading rebuild of embed-heavy crates |

### How to classify a rebuild

Useful Cargo / Tauri signals:

- `FRESH` / no `Compiling` line: Cargo freshness check only
- `Compiling yourcrate`: Rust recompilation
- Long gap after compile with large `.lib` / `.pdb`: linking cost
- New process ID for the app: full relaunch
- Vite `hmr update`: frontend-only

Commands:

```powershell
# Freshness probe
cargo build --manifest-path src-tauri/Cargo.toml
# Touch a leaf Rust file's mtime only, rebuild, compare timing
# Touch a frontend file, watch Vite output for hmr update vs page reload
# Touch an asset under src-tauri, watch whether Tauri prints File change detected / relaunches
```

### Watch / dependency-map template

Fill this for every project:

```text
[Frontend source] _______________  watched by: Vite / other ________
[Frontend dist]   _______________  consumed by: Tauri frontendDist / unused in dev
[Secondary source] ______________  watched by: _____________________
[Secondary out]   _______________  served/embedded by: _____________
[Rust sources]    _______________  watched by: tauri CLI / cargo
[build.rs inputs] _______________  listed in: *.d / cargo:rerun-if-changed
[Sidecars]        _______________  copied to: target/<profile>/
[Ignored by Vite] _______________
[Ignored by Tauri .taurignore] __
[Cargo dep-info hits for assets] yes / no (grep *.d)
```

### Example (RuForge): Companion asset map

```text
companion-web-src/   (Vite React source)
        |
        | npm run companion:build / companion:dev (--watch)
        v
src-tauri/companion-web/   (generated index.html + assets/)
        |
        | #[derive(RustEmbed)] #[folder = "companion-web/"]
        v
Axum serves index.html and assets/* at runtime
```

Observed facts in debug:

- The debug binary contained the folder path string, not the asset bytes.
- Touching `companion-web/` or `companion-web-src/` left Cargo `FRESH` in ~0.6s.
- Without `.taurignore`, Tauri still restarted the desktop app on Companion edits.
- In release, `rust-embed` uses `include_bytes!`, so release rebuilds when embedded files change.

Sources:

- [Tauri Develop docs (`.taurignore`)](https://v2.tauri.app/develop/)
- [rust-embed docs (debug reads filesystem; release embeds)](https://docs.rs/rust-embed)

---

## 5. Build a disk-usage map

**General + Windows.** Measure before cleaning. Classify every large path.

### What to measure

- Cargo `target/debug`, `deps`, `incremental`, build-script output
- `target/release` and `release/bundle`
- Duplicate sidecars copied into profile directories
- Root and nested `node_modules`
- Vite caches (if present)
- npm cache (`npm config get cache`)
- Cargo registry and Git caches under `CARGO_HOME`
- Website / marketing site output and copied installers
- WebView2 / app runtime caches under `%LOCALAPPDATA%` / `%APPDATA%`
- Logs, screenshots, captures, thumbnails, temporary media, generated previews
- Abandoned target directories, worktrees, alternate profiles, feature combinations, and target triples

### Classification taxonomy

1. **Required source or dependencies**
2. **Reusable cache** (safe to clear, expensive to refill)
3. **Safely rebuildable artifacts** (`target/debug`, Vite outDirs)
4. **Application runtime state** (settings, databases, session files)
5. **Protected user data** (media libraries, documents the app manages for the user)
6. **Unexpected leak** (orphaned copies, unbounded installer retention, runaway temp dirs)
7. **Outside-repository disk use caused by development** (npm cache, Cargo registry, WebView caches)

### Table template

| Path | Size | Purpose | Growth mechanism | Last modified | Rebuildable? | Protection |
|------|------|---------|------------------|---------------|--------------|------------|
| | | | | | yes/no/partial | none / caution / protected |

### Measurement commands (Windows PowerShell)

```powershell
function Measure-Tree($Path) {
  if (-not (Test-Path $Path)) { return [pscustomobject]@{ Path=$Path; Exists=$false; Bytes=0 } }
  $sum = (Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
    Measure-Object Length -Sum).Sum
  [pscustomobject]@{ Path=$Path; Exists=$true; Bytes=[int64]$sum }
}

$paths = @(
  'src-tauri\target',
  'src-tauri\target\debug\deps',
  'src-tauri\target\debug\incremental',
  'src-tauri\target\release',
  'node_modules',
  'website\dist',
  "$env:LOCALAPPDATA\npm-cache",
  "$env:USERPROFILE\.cargo\registry",
  "$env:USERPROFILE\.cargo\git"
)
$paths | ForEach-Object { Measure-Tree $_ }

# Largest files under target
Get-ChildItem src-tauri\target -Recurse -File -ErrorAction SilentlyContinue |
  Sort-Object Length -Descending |
  Select-Object -First 15 FullName, @{N='MB';E={[math]::Round($_.Length/1MB,1)}}
```

### Example (RuForge): categories that mattered

Observed (not universal):

- `src-tauri/target/debug` was the largest rebuildable tree.
- `ruforge_lib.lib` and PDBs dominated link cost before profile changes.
- npm cache was multi-GB and outside the repo.
- `website/dist/releases` held large installers and needed protection.
- `C:\RuForge\Media` was protected user media and must never enter cleanup tools as a default target.
- A second project's `target/` on the same Dev Drive (`D:\Finch`) was outside-repo development disk use.

---

## 6. Measure repeated cycles correctly

**General.** One build and one disk snapshot are insufficient.

### Why repetition matters

- Cold vs warm caches differ by an order of magnitude.
- Incremental compilation can be healthy or stuck; one sample cannot tell which.
- Disk growth that looks unbounded after one scary spike may be flat across ten edits.
- Profile changes need before-and-after medians, not a single lucky run.

### Benchmark matrix

Run and record:

1. Cold development startup (after reboot or after killing all related processes)
2. Warm no-change startup
3. Frontend CSS edit
4. Frontend TypeScript edit
5. Rust leaf edit (mtime or one-line comment in a leaf module)
6. Rust dependency-heavy edit (`Cargo.toml`, feature flip, or widely imported module)
7. App relaunch delay (compile finished → new window / new PID)
8. Ten repeated frontend edits
9. Ten repeated Rust edits
10. Initial, peak, and final disk usage for `target/` and other large consumers
11. Artifact growth per cycle
12. Disk state after a dry-run cleanup plan (and only later after a real guarded cleanup, if approved)

### Method

- Prefer **medians** of at least three samples for rebuild times.
- Preserve raw samples next to the median.
- Touch mtime-only when you want Cargo invalidation without content noise.
- Capture process IDs so you can distinguish HMR from relaunch.
- Keep `CARGO_INCREMENTAL` and profile flags constant within a comparison set.

```powershell
$times = @()
foreach ($i in 1..3) {
  (Get-Item src-tauri\src\lib.rs).LastWriteTime = Get-Date
  $sw = [Diagnostics.Stopwatch]::StartNew()
  cargo build --manifest-path src-tauri\Cargo.toml | Out-Null
  $sw.Stop()
  $times += [math]::Round($sw.Elapsed.TotalSeconds, 1)
}
$times
($times | Sort-Object)[1]  # median of 3
```

### Example (RuForge): what repetition changed

- A single scary multi-GB incremental tree suggested unbounded growth.
- Ten repeated leaf builds with finalize failures showed **approximately zero per-edit growth**.
- Healthy finalized sessions later showed ~9 to 10s leaf rebuilds; stuck finalize sessions showed ~28s, then ~15s after the profile change.
- Without the repeated matrix, the wrong fix (`CARGO_INCREMENTAL=0` permanently) looked attractive.

---

## 7. Distinguish facts from hypotheses

**General.** The 100GB claim is the teaching example.

### The mistake

Early in the RuForge audit, a plausible story said development artifacts could reach ~100GB through orphan incremental sessions and unchecked caches. That story was coherent. It was not proven.

Repeated measurements later showed:

- Per-edit incremental growth was approximately zero while finalize failures were occurring.
- Stale `*-working` sessions were largely self-limiting (rustc GC / replacement within a config tree).
- Distinct Cargo configuration trees (features / profiles / invocation modes) multiplied disk more than repeated edits did.
- The historical 100GB composition could not be located on disk (no recycle-bin archaeology, no abandoned clone matching that size).
- The claim had to be **withdrawn**, not polished into false certainty.

Correct statement after evidence:

> Observed non-media development footprint was on the order of tens of GB on the investigation machine, with one multi-GB growth event explained by rebuilds and config trees. A path to 100GB remains a **plausible but unverified** long-horizon hypothesis, not a measured fact.

### Required conclusion labels

Every claim in notes, PRs, or agent summaries must be one of:

| Label | Meaning |
|-------|---------|
| **Observed** | Directly measured or read from a file/process in this session |
| **Reproduced** | Triggered more than once under controlled conditions |
| **Inferred** | Follows from observed evidence by a short, stated chain |
| **Plausible but unverified** | Consistent with evidence, not proven |
| **Eliminated** | Tested and ruled out |

Do not promote a hypothesis to a recommendation until it is Observed or Reproduced, or until you explicitly accept the risk of an unverified change.

---

## 8. Root-causing Cargo incremental failures

**General process, Windows / ReFS specifics for the failure mode.**

### Symptoms

```text
warning: error finalizing incremental compilation session directory
`\\?\D:\...\target\debug\incremental\crate-...\s-...-working`: Access is denied. (os error 5)
```

### Investigation sequence

1. Compare no-change builds vs touched builds.
2. Inspect `target/debug/incremental/*/`:
   - Finalized session dirs (no `-working` suffix on the session folder name pattern used by rustc)
   - Leftover `*-working` directories
3. Count distinct crate configuration trees (`cratehash-xxxx` directories).
4. Inspect Cargo fingerprint JSON for feature, profile, and path differences.
5. Benchmark with incremental on vs `CARGO_INCREMENTAL=0` for a single process.
6. Eliminate local hypotheses with evidence:
   - Antivirus realtime status
   - Windows Search / indexing attributes on `target`
   - Stale app processes holding binaries
   - Concurrent Cargo / rust-analyzer / `tauri dev`
   - Editor watchers holding directory handles
7. Distinguish Win32 error **32** (sharing violation / in use) from error **5** (access denied). They are not the same mechanism.
8. Search upstream Rust issues with the **exact rustc version** and filesystem type.

### Confirmed example (RuForge / ReFS)

| Claim | Label | Notes |
|-------|-------|-------|
| Failure reproduces on a ReFS Dev Drive | Observed + Reproduced | Volume `D:` FileSystem=`ReFS`, label=`Dev` |
| Matches upstream regression on ReFS | Inferred + upstream Observed | [rust-lang/rust#151181](https://github.com/rust-lang/rust/issues/151181) |
| Upstream: fails on 1.90+, not on 1.89.0 | Upstream Observed | Reverify before acting; issue state was **open** when this guide was written |
| Investigation machine rustc 1.93.1 still hit finalize failures | Observed | |
| Defender was not required for the failure | Observed locally + upstream reports | Local AV realtime was off |
| Concurrent Cargo / stale app not required | Observed | Standalone `cargo check` failed finalization |
| Local rename probes: held file → error 32, not error 5 | Observed | Handle contention did not reproduce error 5 |
| `*-working` dirs are created by rustc when finalize fails | Observed / Inferred | rustc writes working session then renames |
| Distinct feature/profile configs multiply trees | Observed | Multiple `ruforge_lib-*` dirs; fingerprint JSON differed by features/profile |
| Per-edit disk growth ≈ 0 during failures | Reproduced | Repeated leaf builds |
| Primary user-visible damage was rebuild speed | Observed | Stuck regime ~28s leaf builds vs healthy ~9 to 10s earlier in the session |
| One `CARGO_INCREMENTAL=0` build is a reliable permanent repair | **Eliminated as a guarantee** | It can help create a fresh session; final verification still saw later finalize failures and did not restore the healthy 9s regime permanently |

### Practical guidance

- Treat this as a **speed and reliability** bug first, a disk bug second.
- Do **not** globally disable incremental compilation as the default fix. In the RuForge measurements, `CARGO_INCREMENTAL=0` was faster only in the broken regime and slower once sessions were healthy.
- A process-scoped recovery build (`CARGO_INCREMENTAL=0` for one `cargo build`) is a reasonable optional tool. Document it as best-effort, not guaranteed.
- Prefer measuring whether sessions finalize (`*-working` absent / replaced by finalized session) over assuming recovery worked.
- Re-check [rust-lang/rust#151181](https://github.com/rust-lang/rust/issues/151181) status and your rustc version before copying any workaround.

### Windows Dev Drive notes

**ReFS / Dev Drive.** Microsoft Dev Drives use ReFS and are optimized for development I/O. They are not "free speed" for every toolchain assumption. Rust incremental finalization has had ReFS-specific failure reports independent of Defender exclusions. If your repo lives on Dev Drive and leaf rebuilds suddenly double, inspect incremental session finalization before rewriting application code.

---

## 9. Cargo profile optimization

**General.** This is the highest-leverage, lowest-risk compile-time win for many Windows Tauri apps with large staticlibs.

### Official pattern

Cargo documents reducing debug information for faster builds and less disk use:

```toml
[profile.dev]
debug = "line-tables-only"

[profile.dev.package."*"]
debug = false

# Opt in when you need a full debugger experience.
[profile.debugging]
inherits = "dev"
debug = true

[profile.debugging.package."*"]
debug = true
```

Sources:

- [Cargo Profiles](https://doc.rust-lang.org/cargo/reference/profiles.html)
- [Cargo Build Performance: reduce debug information](https://doc.rust-lang.org/cargo/guide/build-performance.html)

Notes:

- `debug = "line-tables-only"` keeps filename/line info for backtraces; it drops richer debugger data.
- `[profile.dev.package."*"]` applies to **non-workspace dependencies**, not workspace members.
- MSRV for the string forms of `debug` is Rust 1.71+.
- **Do not change `[profile.release]` as part of this optimization.**

### Tradeoffs

| Benefit | Cost |
|---------|------|
| Smaller `.lib`, `.rlib`, `.pdb`, incremental artifacts | Full debugger variable/type info needs `--profile debugging` |
| Faster linking | First rebuild after profile change is cold/expensive |
| Panic backtraces still show file/line/symbols (verify!) | Must verify with a real `RUST_BACKTRACE=full` probe |
| Disk pressure drops without deleting caches | Old profile artifacts can linger until cleaned |

### Verification required after applying

1. `cargo check` under the normal dev profile.
2. `cargo check --profile debugging` or `cargo build --profile debugging`.
3. A tiny panic probe (or a deliberate panic path) with `RUST_BACKTRACE=full` confirming file, line, and symbol names.
4. Three leaf rebuild timings and artifact size samples.

If backtraces become useless or rebuilds regress badly, revert **only** the profile change. Keep watcher and orchestration fixes if they independently verified.

### Example (RuForge): before / after on one machine

Label: **Observed on one Windows ReFS Dev Drive host for RuForge, not a universal expectation.**

| Artifact / metric | Before | After |
|-------------------|--------|-------|
| Median Rust leaf rebuild | ~27.5 to 28.0s (stuck finalize regime) | ~15.1s |
| `target/debug` after rebuild | ~14,175 MB | ~12,314 MB |
| `ruforge_lib.lib` | ~1,539.8 MB | ~355.8 MB |
| `ruforge.pdb` | ~272.5 MB | ~56.7 MB |
| `ruforge_lib.pdb` | ~145.2 MB | ~4.9 MB |
| Panic backtrace file/line/symbols | n/a baseline probe | Retained under `line-tables-only` |

The healthy ~9 to 10s regime seen earlier in the session was **not** permanently restored by recover + profile change. The profile win still stood on link/debug-info cost.

---

## 10. Embedded secondary frontend watch pattern

**General for projects with a second Vite (or similar) app whose output lives under `src-tauri`.**

### Problem

Tauri's `tauri dev` watches `src-tauri` (and dependent workspace crates). If generated frontend assets live there, saving the secondary app can restart the desktop process even when:

- Cargo considers the build `FRESH`
- Debug runtime reads assets from disk
- Only a browser refresh was needed

### Audit before ignoring anything

Prove all of the following:

1. **Cargo dependency:** Do `target/**/*.d` / dep-info files list the secondary source or output?
2. **Debug runtime path:** Does the debug binary embed bytes, or only a filesystem path?
3. **Release embedding:** Does release use `include_bytes!`, `rust-embed`, Tauri resources, or another compile-time embed?
4. **Watcher behavior:** Does a secondary edit cause Tauri "File change detected" / relaunch?
5. **Correctness under ignore:** After ignore, does a rebuild of generated output still reach the running debug app (disk read) and the release binary (embed + `beforeBuildCommand`)?

### Safe pattern (only after the audit)

1. Add Tauri ignore entries for the secondary **source** and **generated output** directories.
2. Run a dedicated Vite build watcher that writes generated output continuously.
3. Keep the release path regenerating assets before compile (`beforeBuildCommand` / `npm run build` chain).
4. Verify:
   - Secondary edit updates generated files.
   - Browser (or embedded webview consumer) sees the change after refresh.
   - Desktop process PID does not change.
   - Release build still embeds fresh assets.

Official watcher ignore docs: [Tauri Develop](https://v2.tauri.app/develop/).

`.taurignore` example:

```gitignore
# Only after proving debug reads from disk and release rebuilds embeds.
companion-web/
companion-web-src/
```

### Anti-patterns

- Ignoring directories that Cargo tracks in dep-info without a replacement rebuild trigger.
- Ignoring directories that are embedded at compile time in **debug** (`debug-embed` or equivalent).
- Assuming `emptyOutDir: true` Vite output is "source" and committing it as the only input.
- Removing the release `companion:build` (or equivalent) step because "dev watch handles it."

### Example (RuForge)

- `rust-embed` without `debug-embed`: debug reads `companion-web/` from disk; release embeds.
- `.taurignore` for `companion-web/` + `companion-web-src/` stopped pointless relaunches.
- `npm run companion:dev` (`vite build --watch`) kept generated output current.
- `npm run build` still ran `companion:build` first for release correctness.

---

## 11. One-command development orchestration

**General contract; Windows implementation notes.**

### Contract

A project-level `dev:app` (name as you like) should:

1. Start any required secondary frontend watcher.
2. Start normal `tauri dev`.
3. Preserve standard frontend HMR and Tauri IPC.
4. Shut down child process trees on normal exit and interruption.
5. Detect stale watcher PID files from previous crashes.
6. Validate process identity before killing a stored PID (command line / expected script marker).
7. Leave no orphan Vite, Node, Cargo, Tauri, or app processes.
8. Keep `npm run tauri` / `npm run tauri dev` available unchanged.

### Windows: why PowerShell is often enough

**Windows.** `npm` scripts that spawn long-lived children are easy to orphan on Ctrl+C unless something owns the process tree. A small maintainer PowerShell script can:

- `Start-Process` the watcher and `tauri dev`
- Poll until Tauri exits
- `taskkill /T /F` the process trees in `finally`
- Sweep stray Node processes whose command line contains a unique marker (for example the secondary Vite config filename)

Prefer this over adding a process-runner dependency when the team is Windows-first and the script is short, reviewed, and checked into `scripts/`.

Prefer a cross-platform runner (or a small Node orchestrator) when:

- macOS/Linux developers must use the same entry point
- You already standardize on one process manager in the org
- The PowerShell tree-kill approach proves unreliable on your machine

### Identity-safe PID handling

```text
On start:
  if pidfile exists:
    read pid
    if process exists AND command line matches expected watcher marker:
      kill process tree
    delete pidfile
  also sweep stray processes by command-line marker

On run:
  start watcher → write pidfile
  start tauri dev → wait

On exit / interrupt / finally:
  kill tauri tree
  kill watcher tree
  sweep marker strays
  delete pidfile
```

Never kill a PID solely because it is still alive. Validate identity.

### Example (RuForge)

- Entry point: `npm run dev:app` → `scripts/dev-app.ps1`
- Secondary watcher: `npm run companion:dev`
- Unchanged escape hatch: `npm run tauri dev`
- Verified: HMR without relaunch, Companion rebuild without relaunch, Rust edit relaunch, clean shutdown, stray watcher sweep on next start

---

## 12. Disk reporting tool contract

**General.** Ship a read-only reporter before any cleaner.

### Behavior

- Resolve paths safely (canonicalize where possible).
- Report missing paths without failing the whole run.
- Show total sizes and largest children/files.
- Highlight protected data visually or with an explicit class column.
- Include repository, package-manager, Cargo, runtime, and WebView caches.
- Never delete.
- Make project-specific paths configurable (args, config file, or clear constants at the top of the script).

### Suggested CLI contract

```text
npm run dev:disk
  → scripts/dev-disk-report.ps1  (or .mjs / .sh equivalent)

Options (optional):
  -Top <n>          how many largest children/files to print
  -Config <path>    optional path list override
```

### Suggested output schema

```text
Path | Size | Files | Class
-----|------|-------|------
src-tauri/target           rebuildable
  target/debug/deps        rebuildable
  target/debug/incremental rebuildable
website/dist/releases      protected
npm cache                  cache
C:\...\Media               USER MEDIA / protected

Largest subdirectories...
Largest files...
```

Classes: `rebuildable`, `reinstallable`, `cache`, `protected`, `USER MEDIA`.

### Adaptation checklist for another project

- [ ] Replace app identifier used for `%APPDATA%` / `%LOCALAPPDATA%` paths
- [ ] Replace media / library roots
- [ ] Add or remove website/installer output paths
- [ ] Add alternate `CARGO_TARGET_DIR` if set
- [ ] Include any capture/preview/thumbnail caches the app creates
- [ ] Confirm the reporter cannot delete even if someone edits it carelessly (no delete APIs)

---

## 13. Safe cleanup tool contract

**General + Windows process checks.**

### Design rules

1. Dry-run by default.
2. Explicit apply switch (`-Apply` / `--apply`).
3. Independent cleanup categories (incremental, website dist, npm cache, etc.).
4. Show exact path and size before deletion.
5. Canonicalize and validate every path.
6. Refuse repository roots, drive roots, protected ancestors, and protected descendants.
7. Refuse while relevant processes are active.
8. Test deletion only against temporary fixtures.
9. Preserve protected children (for example release installers under an otherwise deletable `dist/`).
10. Do not automatically prune individual `*-working` incremental sessions.
11. Do not schedule automatic cleanup without a proven retention policy.

### Guard self-tests

Every cleanup tool should have a fixture mode that proves:

**Allowed**

- A temporary directory under `%TEMP%` can be deleted.
- A sibling fixture remains untouched.

**Forbidden (must refuse)**

- Drive roots (`C:\`)
- Repo root
- Full `target/` (if policy says so)
- `target/release/bundle`
- User media roots
- Signing key directories
- App config directories you marked protected
- Source sidecar directories

### Process refusal set (typical)

Refuse apply when any of these are running:

- `cargo`, `rustc`, `rustdoc`
- `link` / `lld-link` (Windows)
- The app process name
- Node processes whose command line includes `vite` or `tauri` (tune per project)

### Example categories

| Switch | Target | Preserve |
|--------|--------|----------|
| Incremental | `target/debug/incremental` | nothing inside; whole dir rebuildable |
| WebsiteDist | `website/dist/*` except `releases/` | shipped installers |
| NpmCache | `npm cache clean --force` | n/a |

Never make "delete all of `target/`" the default.

---

## 14. Recommended implementation order

**General.** Do not reorder casually. Each stage has a gate.

| Stage | Work | Gate before next stage |
|-------|------|------------------------|
| 1 | Baseline measurements (toolchain, times, sizes) | Raw numbers recorded in worksheet |
| 2 | Pipeline and watcher map | Every edit class mapped to HMR / compile / relaunch |
| 3 | Disk classification | Every large path has a taxonomy label |
| 4 | Root-cause abnormal behavior | Facts labeled; false theories withdrawn |
| 5 | Cargo profile experiment | Before/after sizes + leaf medians + backtrace probe |
| 6 | Watcher correction | Secondary edits no longer restart app; assets still update |
| 7 | Development-command orchestration | Clean shutdown + no orphans verified |
| 8 | Disk reporter | Read-only run succeeds; protected paths highlighted |
| 9 | Dry-run cleanup tool | Self-test passes; dry-run deletes nothing |
| 10 | Repeated-cycle benchmark | Matrix complete; medians published |
| 11 | Documentation and rollback notes | How to revert profiles / ignores / scripts recorded |

If a stage fails its gate, stop. Do not stack speculative fixes.

---

## 15. Acceptance checklist

Copy into the PR or agent handoff:

```text
Development cycle acceptance

[ ] Frontend CSS edit: Vite HMR, app PID unchanged
[ ] Frontend TS edit: HMR or documented intentional reload, app PID unchanged unless expected
[ ] Secondary frontend edit (if any): output rebuilds, app PID unchanged
[ ] Secondary frontend browser refresh shows the change
[ ] Rust leaf edit: recompiles and relaunches
[ ] Child watchers terminate on normal exit
[ ] Child watchers terminate on interrupt / killed parent
[ ] No CARGO_INCREMENTAL (or other) environment residue in user/machine scope
[ ] `cargo check` / `cargo build` works on normal dev profile
[ ] Full-debug / debugging profile compiles
[ ] Panic backtraces retain useful source locations under the new dev profile
[ ] Release profiles unchanged
[ ] Release build command still regenerates/embeds secondary assets
[ ] Disk report is read-only
[ ] Cleanup defaults to dry run
[ ] Cleanup refuses protected paths in self-test
[ ] No user media / keys / credentials touched
[ ] Before-and-after timing metrics recorded (median + raw)
[ ] Before-and-after disk metrics recorded
[ ] Claims labeled Observed / Reproduced / Inferred / Plausible / Eliminated
[ ] Original `tauri dev` entry point still works
```

---

## 16. Project worksheet

Fill this at the start of a new investigation. Keep it with the PR or agent notes.

```text
Repository:
OS:
Filesystem (repo volume):
Filesystem (target volume, if different):
Dev Drive / ReFS? (yes/no):

Toolchain
  Node:
  npm/pnpm/yarn:
  rustc:
  cargo:
  tauri CLI:
  MSVC / GNU:
  Linker:

Current dev command:
Frontend paths:
Rust workspace paths:
Secondary frontend source:
Secondary frontend output:
Embedded asset mechanism (debug/release):
Sidecars:
Protected paths:

Baseline times (median + raw)
  Cold start:
  Warm no-change:
  CSS edit:
  TS edit:
  Rust leaf edit:
  Rust heavy edit:
  Relaunch delay:

Baseline disk use
  target/:
  incremental/:
  deps/:
  node_modules/:
  npm cache:
  cargo registry:
  app/WebView caches:
  other:

Confirmed bottlenecks (with labels):

Proposed changes:

Verification results:

Rollback:
  profiles:
  ignores:
  scripts:
  env vars:
```

---

## Appendix A: Quick command sheet

```powershell
# Environment
node -v; npm -v; rustc -V; cargo -V; npx tauri -V
Get-Volume -DriveLetter D | Format-List DriveLetter, FileSystem, FileSystemLabel

# Freshness / rebuild
cargo build --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --profile debugging

# Process-scoped incremental bypass (best-effort recovery attempt)
$env:CARGO_INCREMENTAL = '0'
cargo build --manifest-path src-tauri/Cargo.toml
Remove-Item Env:CARGO_INCREMENTAL -ErrorAction SilentlyContinue

# Backtrace probe after profile changes
$env:RUST_BACKTRACE = 'full'
# run a deliberate panic binary or test, then:
Remove-Item Env:RUST_BACKTRACE -ErrorAction SilentlyContinue

# Disk
npm run dev:disk   # if implemented

# Cleanup dry run
npm run dev:clean:safe
# npm run ... -- -Incremental -WebsiteDist -NpmCache
```

## Appendix B: Official references

- Cargo profiles: https://doc.rust-lang.org/cargo/reference/profiles.html
- Cargo build performance: https://doc.rust-lang.org/cargo/guide/build-performance.html
- Tauri develop / `.taurignore`: https://v2.tauri.app/develop/
- rust-embed: https://docs.rs/rust-embed
- npm cache: `npm help cache`
- PowerShell `Start-Process`, `Get-CimInstance Win32_Process`, `taskkill /T`
- Windows Dev Drive overview: Microsoft Learn "Dev Drive"
- Upstream incremental finalize on ReFS: https://github.com/rust-lang/rust/issues/151181  
  Reverify open/closed state and affected versions before relying on this citation.

## Appendix C: Statements intentionally corrected or excluded

These appeared in early audit thinking and must **not** be repeated as facts:

1. **"Development routinely hits 100GB because of orphan incremental sessions."**  
   Corrected: historical 100GB composition was not proven. Measured footprint was tens of GB. Per-edit incremental growth was approximately zero. Config-tree multiplicity and caches matter more than orphan-session accumulation.

2. **"Automated pruning of `*-working` directories is the primary disk fix."**  
   Corrected: sessions were largely self-limiting; automated pruning lacks a reliable safety predicate while compiles are live. Prefer classification, profile slimming, and guarded category cleanup.

3. **"Globally set `CARGO_INCREMENTAL=0` to fix ReFS."**  
   Corrected: can help in a stuck regime but regresses healthy incremental rebuilds. Prefer process-scoped recovery attempts and upstream tracking. Do not persist user/machine env changes casually.

4. **"Antivirus / Search Indexer / stale RuForge processes caused the Access denied finalize failure."**  
   Corrected for the RuForge session: those hypotheses were eliminated or unsupported. The failure aligned with the ReFS Dev Drive rustc regression reports.

5. **"Ignoring Companion directories is always safe."**  
   Corrected: only safe after proving debug disk reads and release embed invalidation. `.taurignore` is a watcher tool, not an asset pipeline.

6. **"One recover build permanently restores ~9s leaf rebuilds."**  
   Corrected: not guaranteed. Final RuForge verification still saw finalize warnings afterward; profile changes still helped via link/debug-info size.

---

## Appendix D: Minimal implementation slice (after evidence)

When the investigation gates pass, the usual high-value slice is:

1. Cargo `line-tables-only` + dependency `debug = false` + opt-in `debugging` profile.
2. Secondary-frontend watcher + Tauri ignore, only after dependency/runtime proof.
3. One orchestrated `dev:app` command with process-tree cleanup.
4. Read-only disk reporter.
5. Dry-run-first guarded cleaner.
6. Optional process-scoped incremental recover command for ReFS stuck regimes.

Do not ship cleanup that deletes by default. Do not alter release profiles. Do not commit signing material or user media paths into destructive defaults.
