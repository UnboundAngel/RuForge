# Copy the signed NSIS installer into website/public/releases/ for same-origin /download streaming.
param(
  [string]$Version = (Get-Content (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'updater.json') -Raw | ConvertFrom-Json).version
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$src = Join-Path $repoRoot "src-tauri\target\release\bundle\nsis\RuForge_${Version}_x64-setup.exe"
$destDir = Join-Path $repoRoot "website\public\releases"
$dest = Join-Path $destDir "RuForge_${Version}_x64-setup.exe"

if (-not (Test-Path $src)) {
  Write-Error "Installer not found: $src`nRun Build-signed-windows.bat first."
}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item -Force $src $dest
Write-Host "Copied to $dest"
