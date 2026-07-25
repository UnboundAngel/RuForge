# Optimized RuForge development entry point.
# Runs the Companion asset watcher alongside `tauri dev` and tears both trees down on exit.

[CmdletBinding()]
param(
    [switch]$NoCompanion
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $env:TEMP 'ruforge-dev-app-companion.pid'
$companionMarker = 'companion-web.config.ts'

function Resolve-Npm {
    $cmd = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return 'npm.cmd'
}

function Stop-Tree {
    param([int]$ProcessId, [string]$Label)

    if ($ProcessId -le 0) { return }
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
    Write-Host "[dev:app] stopping $Label (pid $ProcessId)" -ForegroundColor DarkGray
    & taskkill.exe /PID $ProcessId /T /F *> $null
}

function Stop-CompanionStragglers {
    $stray = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$companionMarker*" }

    foreach ($proc in $stray) {
        Write-Host "[dev:app] stopping stray companion watcher (pid $($proc.ProcessId))" -ForegroundColor DarkGray
        & taskkill.exe /PID $proc.ProcessId /T /F *> $null
    }
}

function Clear-PreviousRun {
    if (Test-Path $pidFile) {
        $previous = 0
        $raw = (Get-Content $pidFile -Raw -ErrorAction SilentlyContinue)
        if ($raw -and [int]::TryParse($raw.Trim(), [ref]$previous)) {
            Stop-Tree -ProcessId $previous -Label 'companion watcher left by a previous run'
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
    Stop-CompanionStragglers
}

$npm = Resolve-Npm
$companion = $null
$tauri = $null
$exitCode = 0

Push-Location $repoRoot
try {
    Clear-PreviousRun

    if (-not $NoCompanion) {
        Write-Host '[dev:app] starting companion watcher (vite build --watch)' -ForegroundColor Cyan
        $companion = Start-Process -FilePath $npm -ArgumentList 'run', 'companion:dev' `
            -WorkingDirectory $repoRoot -NoNewWindow -PassThru
        Set-Content -Path $pidFile -Value $companion.Id -Encoding ASCII
    }

    Write-Host '[dev:app] starting tauri dev' -ForegroundColor Cyan
    $tauri = Start-Process -FilePath $npm -ArgumentList 'run', 'tauri', 'dev' `
        -WorkingDirectory $repoRoot -NoNewWindow -PassThru

    while (-not $tauri.HasExited) {
        Start-Sleep -Milliseconds 250
    }
    $exitCode = $tauri.ExitCode
}
finally {
    if ($tauri) { Stop-Tree -ProcessId $tauri.Id -Label 'tauri dev' }
    if ($companion) { Stop-Tree -ProcessId $companion.Id -Label 'companion watcher' }
    Stop-CompanionStragglers
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Pop-Location
    Write-Host '[dev:app] shutdown complete' -ForegroundColor DarkGray
}

exit $exitCode
