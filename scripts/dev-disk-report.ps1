# Read-only disk report for RuForge development artifacts and caches.
# Deletes nothing. Pair with dev-clean-safe.ps1 when something needs reclaiming.

[CmdletBinding()]
param(
    [int]$Top = 10
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot 'src-tauri\target'
$debugDir = Join-Path $targetDir 'debug'
$cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE '.cargo' }

function Get-NpmCachePath {
    $configured = & npm.cmd config get cache 2>$null
    if ($LASTEXITCODE -eq 0 -and $configured) {
        $trimmed = ([string]$configured).Trim()
        if ($trimmed -and $trimmed -ne 'undefined') { return $trimmed }
    }
    return (Join-Path $env:LOCALAPPDATA 'npm-cache')
}

function Measure-Path {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return [pscustomobject]@{ Exists = $false; Bytes = 0; Files = 0 }
    }

    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($item -and -not $item.PSIsContainer) {
        return [pscustomobject]@{ Exists = $true; Bytes = $item.Length; Files = 1 }
    }

    $stats = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum
    $bytes = 0
    $files = 0
    if ($stats) {
        if ($stats.Sum) { $bytes = $stats.Sum }
        $files = $stats.Count
    }
    return [pscustomobject]@{ Exists = $true; Bytes = $bytes; Files = $files }
}

function Format-Size {
    param([long]$Bytes)

    if ($Bytes -ge 1GB) { return ('{0,9:N2} GB' -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ('{0,9:N1} MB' -f ($Bytes / 1MB)) }
    if ($Bytes -gt 0) { return ('{0,9:N0} KB' -f ($Bytes / 1KB)) }
    return ('{0,9}' -f '0')
}

$entries = @(
    @{ Label = 'src-tauri/target';                Path = $targetDir;                                     Class = 'rebuildable' }
    @{ Label = '  target/debug/deps';             Path = (Join-Path $debugDir 'deps');                   Class = 'rebuildable' }
    @{ Label = '  target/debug/incremental';      Path = (Join-Path $debugDir 'incremental');            Class = 'rebuildable' }
    @{ Label = 'src-tauri/target/release';        Path = (Join-Path $targetDir 'release');               Class = 'rebuildable' }
    @{ Label = '  target/release/bundle';         Path = (Join-Path $targetDir 'release\bundle');         Class = 'protected' }
    @{ Label = '  target/debugging';              Path = (Join-Path $targetDir 'debugging');              Class = 'rebuildable' }
    @{ Label = 'website/dist';                    Path = (Join-Path $repoRoot 'website\dist');           Class = 'rebuildable' }
    @{ Label = '  website/dist/releases';         Path = (Join-Path $repoRoot 'website\dist\releases');   Class = 'protected' }
    @{ Label = 'node_modules';                    Path = (Join-Path $repoRoot 'node_modules');           Class = 'reinstallable' }
    @{ Label = 'website/node_modules';            Path = (Join-Path $repoRoot 'website\node_modules');   Class = 'reinstallable' }
    @{ Label = 'npm cache';                       Path = (Get-NpmCachePath);                             Class = 'cache' }
    @{ Label = 'cargo registry';                  Path = (Join-Path $cargoHome 'registry');              Class = 'cache' }
    @{ Label = 'cargo git';                       Path = (Join-Path $cargoHome 'git');                    Class = 'cache' }
    @{ Label = 'RuForge config (roaming)';        Path = (Join-Path $env:APPDATA 'com.attic.ruforge');    Class = 'protected' }
    @{ Label = 'RuForge WebView cache (local)';   Path = (Join-Path $env:LOCALAPPDATA 'com.attic.ruforge'); Class = 'cache' }
    @{ Label = 'RuForge logs (local)';            Path = (Join-Path $env:LOCALAPPDATA 'RuForge');         Class = 'protected' }
    @{ Label = 'C:\RuForge\Media';                Path = 'C:\RuForge\Media';                              Class = 'USER MEDIA' }
)

Write-Host ''
Write-Host 'RuForge dev disk report' -ForegroundColor Cyan
Write-Host ('{0,-34} {1,12}  {2,9}  {3}' -f 'Path', 'Size', 'Files', 'Class')
Write-Host ('-' * 84)

$totalRebuildable = [long]0
foreach ($entry in $entries) {
    Write-Progress -Activity 'Measuring' -Status $entry.Label
    $m = Measure-Path -Path $entry.Path
    $size = if ($m.Exists) { Format-Size -Bytes $m.Bytes } else { '{0,9}' -f 'missing' }
    $files = if ($m.Exists) { '{0,9:N0}' -f $m.Files } else { '{0,9}' -f '-' }

    $color = 'Gray'
    if ($entry.Class -eq 'USER MEDIA') { $color = 'Red' }
    elseif ($entry.Class -eq 'protected') { $color = 'Yellow' }

    Write-Host ('{0,-34} {1,12}  {2,9}  {3}' -f $entry.Label, $size, $files, $entry.Class) -ForegroundColor $color

    if ($entry.Class -eq 'rebuildable' -and $entry.Label -notmatch '^\s') { $totalRebuildable += $m.Bytes }
}
Write-Progress -Activity 'Measuring' -Completed

Write-Host ('-' * 84)
Write-Host ('{0,-34} {1,12}' -f 'top-level rebuildable total', (Format-Size -Bytes $totalRebuildable))

if (Test-Path -LiteralPath $debugDir) {
    Write-Host ''
    Write-Host "Largest subdirectories in src-tauri/target/debug (top $Top)" -ForegroundColor Cyan
    Get-ChildItem -LiteralPath $debugDir -Directory -Force -ErrorAction SilentlyContinue |
        ForEach-Object {
            $m = Measure-Path -Path $_.FullName
            [pscustomobject]@{ Name = $_.Name; Bytes = $m.Bytes }
        } |
        Sort-Object Bytes -Descending |
        Select-Object -First $Top |
        ForEach-Object { Write-Host ('{0,12}  {1}' -f (Format-Size -Bytes $_.Bytes), $_.Name) }
}

if (Test-Path -LiteralPath $targetDir) {
    Write-Host ''
    Write-Host "Largest files in src-tauri/target (top $Top)" -ForegroundColor Cyan
    Get-ChildItem -LiteralPath $targetDir -Recurse -File -Force -ErrorAction SilentlyContinue |
        Sort-Object Length -Descending |
        Select-Object -First $Top |
        ForEach-Object {
            $rel = $_.FullName.Substring($targetDir.Length).TrimStart('\')
            Write-Host ('{0,12}  {1}' -f (Format-Size -Bytes $_.Length), $rel)
        }
}

Write-Host ''
Write-Host 'C:\RuForge\Media is protected user media. No RuForge tooling deletes it.' -ForegroundColor Red
Write-Host 'Reclaim space with: npm run dev:clean:safe' -ForegroundColor DarkGray
Write-Host ''
