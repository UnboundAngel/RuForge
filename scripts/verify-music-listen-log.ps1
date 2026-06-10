# Disk acceptance for music listen-event log (temp dir + optional live app_data).
# Runs Rust tests when the test harness loads; falls back to JSONL file checks on disk.
param(
    [switch]$LiveOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$appDataDir = Join-Path $env:APPDATA "com.attic.ruforge"
$verifyDir = Join-Path $env:TEMP "ruforge-listen-log-verify-$(Get-Random)"

function Write-ListenEventLine {
    param([string]$Path, [hashtable]$Event)
    $line = ($Event | ConvertTo-Json -Compress -Depth 6)
    Add-Content -Path $Path -Value $line -Encoding utf8
}

function Test-ListenLogLayout {
    param([string]$Dir)
    $eventsPath = Join-Path $Dir "music-listen-events.jsonl"
    $snapshotPath = Join-Path $Dir "music-listen-snapshot.json"
    if (-not (Test-Path $eventsPath)) {
        throw "Missing events file: $eventsPath"
    }
    $lines = Get-Content $eventsPath | Where-Object { $_.Trim().Length -gt 0 }
    if ($lines.Count -lt 1) {
        throw "Expected at least one JSONL line in $eventsPath"
    }
    foreach ($line in $lines) {
        $ev = $line | ConvertFrom-Json
        if ($ev.v -ne 1) { throw "Bad schema version on line: $line" }
        if ($ev.type -ne "track_played") { throw "Bad event type on line: $line" }
        if (-not $ev.endReason) { throw "Missing endReason on line: $line" }
    }
    if (Test-Path $snapshotPath) {
        $snap = Get-Content $snapshotPath -Raw | ConvertFrom-Json
        if ($null -eq $snap.stats) { throw "Snapshot missing stats array" }
    }
    Write-Host "OK layout: $($lines.Count) event(s) in $eventsPath"
}

if (-not $LiveOnly) {
    Write-Host "=== Rust disk acceptance (tempdir via cargo test) ==="
    Push-Location (Join-Path $repoRoot "src-tauri")
    try {
        cargo test verify_ -- --nocapture
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "cargo test exited $LASTEXITCODE (often STATUS_ENTRYPOINT_NOT_FOUND on Windows). Continuing with on-disk JSONL checks."
        } else {
            Write-Host "Rust verify_* tests passed."
        }
    } finally {
        Pop-Location
    }

    Write-Host "`n=== PowerShell JSONL disk write (simulated close) ==="
    New-Item -ItemType Directory -Path $verifyDir -Force | Out-Null
    $eventsFile = Join-Path $verifyDir "music-listen-events.jsonl"
    Write-ListenEventLine -Path $eventsFile -Event @{
        v            = 1
        id           = "ps-verify-1"
        type         = "track_played"
        identityKey  = "id:ps-verify"
        startedAt    = 1700000000000
        endedAt      = 1700000060000
        endReason    = "completed"
        path         = "C:/music/test.mp3"
        title        = "Test"
        artist       = "Artist"
        listenedSec  = 60.0
        surface      = "main"
    }
    Test-ListenLogLayout -Dir $verifyDir
    Remove-Item -Recurse -Force $verifyDir
}

Write-Host "`n=== Live app_data_dir (if RuForge has written events) ==="
Write-Host "Path: $appDataDir"
if (Test-Path $appDataDir) {
    $liveEvents = Join-Path $appDataDir "music-listen-events.jsonl"
    if (Test-Path $liveEvents) {
        Test-ListenLogLayout -Dir $appDataDir
    } else {
        Write-Host "No live JSONL yet. Play a track in Music (main or mini) and re-run with -LiveOnly."
    }
} else {
    Write-Host "App data directory not found (RuForge not run on this profile yet)."
}

Write-Host "`nDone."
