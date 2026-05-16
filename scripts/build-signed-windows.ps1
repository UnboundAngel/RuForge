<#!
  Local signed Windows build (NSIS + MSI + .sig) - does NOT push to GitHub.

  Usage:
    From repo root:  npm run build:signed
    Or double-click:  Build-signed-windows.bat

  Keys:  %USERPROFILE%\.tauri\ruforge.key  (+ optional .tauri\ruforge.key.pub for your own checks)

  Password (first match wins):
    1) Environment variable TAURI_SIGNING_PRIVATE_KEY_PASSWORD (current session)
    2) One-line file repo\.tauri-signing-password  (gitignored - create locally if you want zero prompts)
    3) Secure prompt in the console

  Optional:  -NoPause   (skip "Press Enter" at end, e.g. for other scripts)
#>
param(
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$keyPath = Join-Path $env:USERPROFILE ".tauri\ruforge.key"
if (-not (Test-Path -LiteralPath $keyPath)) {
  Write-Error "Missing private key: $keyPath`nGenerate or copy your Tauri signing key there, then retry."
}

Write-Host "Loading signing key from $keyPath" -ForegroundColor Cyan
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath $keyPath -Raw
if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
  Write-Error "Private key file is empty."
}

$passFile = Join-Path $RepoRoot ".tauri-signing-password"
if (-not [string]::IsNullOrEmpty($env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD)) {
  Write-Host "Using TAURI_SIGNING_PRIVATE_KEY_PASSWORD from environment." -ForegroundColor DarkGray
}
elseif (Test-Path -LiteralPath $passFile) {
  $fromFile = (Get-Content -LiteralPath $passFile -Raw).Trim()
  if ([string]::IsNullOrEmpty($fromFile)) {
    Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    Write-Host "Password file is empty - assuming key has no password." -ForegroundColor DarkGray
  }
  else {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $fromFile
    Write-Host "Using password from .tauri-signing-password (repo root)." -ForegroundColor DarkGray
  }
}
else {
  Write-Host "If your key has no password, press Enter at the prompt." -ForegroundColor Yellow
  $sec = Read-Host "Signing key password" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    if ([string]::IsNullOrEmpty($plain)) {
      Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    }
    else {
      $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $plain
    }
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) | Out-Null
  }
}

Write-Host "`nRunning npm run tauri build (frontend + signed bundles)...`n" -ForegroundColor Cyan
npm run tauri build
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nBuild failed (exit $LASTEXITCODE)." -ForegroundColor Red
  if (-not $NoPause) { Read-Host "Press Enter to exit" | Out-Null }
  exit $LASTEXITCODE
}

$bundleRoot = Join-Path $RepoRoot "src-tauri\target\release\bundle"
$pkgJson = Join-Path $RepoRoot "package.json"
$appVersion = $null
if (Test-Path -LiteralPath $pkgJson) {
  try {
    $pkg = Get-Content -LiteralPath $pkgJson -Raw | ConvertFrom-Json
    if ($pkg.version) { $appVersion = [string]$pkg.version }
  }
  catch { }
}
Write-Host "`nDone. Artifacts for this build (upload matching files to the GitHub Release, then update updater.json on main):" -ForegroundColor Green
if ($appVersion) {
  $verPat = "RuForge_$([regex]::Escape($appVersion))"
  Get-ChildItem -LiteralPath (Join-Path $bundleRoot "nsis") -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match $verPat } |
    Sort-Object Name |
    ForEach-Object { Write-Host "  $($_.FullName)" }
  Get-ChildItem -LiteralPath (Join-Path $bundleRoot "msi") -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match $verPat } |
    Sort-Object Name |
    ForEach-Object { Write-Host "  $($_.FullName)" }
}
else {
  Write-Host "  (Could not read version from package.json; listing all files under bundle.)" -ForegroundColor Yellow
  Get-ChildItem -LiteralPath (Join-Path $bundleRoot "nsis") -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { Write-Host "  $($_.FullName)" }
  Get-ChildItem -LiteralPath (Join-Path $bundleRoot "msi") -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { Write-Host "  $($_.FullName)" }
}
Write-Host "`nNext: paste .sig contents into updater.json if needed, commit, and keep installers out of git." -ForegroundColor DarkGray

if (-not $NoPause) {
  Read-Host "`nPress Enter to close" | Out-Null
}
