# Targeted, opt-in cleanup of RuForge development artifacts.
# Dry run unless -Apply is passed. Never touches user media, keys, signatures,
# release bundles, sidecar binaries, or RuForge configuration.

[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Incremental,
    [switch]$WebsiteDist,
    [switch]$NpmCache,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot 'src-tauri\target'
$incrementalDir = Join-Path $targetDir 'debug\incremental'
$websiteDistDir = Join-Path $repoRoot 'website\dist'
$websiteReleasesDir = Join-Path $websiteDistDir 'releases'

function Normalize-Path {
    param([string]$Path)
    return ([IO.Path]::GetFullPath($Path)).TrimEnd('\')
}

$protectedRoots = @(
    'C:\RuForge',
    (Join-Path $env:USERPROFILE '.tauri'),
    (Join-Path $repoRoot 'src-tauri\binaries'),
    (Join-Path $targetDir 'release'),
    $websiteReleasesDir,
    (Join-Path $env:APPDATA 'com.attic.ruforge'),
    (Join-Path $env:LOCALAPPDATA 'RuForge'),
    (Join-Path $repoRoot 'updater.json')
) | ForEach-Object { Normalize-Path $_ }

$neverDelete = @($repoRoot, $targetDir, (Join-Path $targetDir 'debug')) | ForEach-Object { Normalize-Path $_ }

function Test-Deletable {
    param([string]$Path)

    $full = Normalize-Path $Path

    if ($full.Length -lt 8) { return @{ Ok = $false; Reason = 'path is too close to a drive root' } }
    if ($full -match '^[A-Za-z]:$') { return @{ Ok = $false; Reason = 'path is a drive root' } }
    if ($neverDelete -contains $full) { return @{ Ok = $false; Reason = 'path is on the never-delete list' } }

    foreach ($guard in $protectedRoots) {
        if ($full -eq $guard) { return @{ Ok = $false; Reason = "protected path: $guard" } }
        if ($full.StartsWith("$guard\", [StringComparison]::OrdinalIgnoreCase)) {
            return @{ Ok = $false; Reason = "inside protected path: $guard" }
        }
        if ($guard.StartsWith("$full\", [StringComparison]::OrdinalIgnoreCase)) {
            return @{ Ok = $false; Reason = "would remove protected path: $guard" }
        }
    }

    return @{ Ok = $true; Reason = '' }
}

function Measure-Path {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return [long]0 }
    $stats = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum
    if ($stats -and $stats.Sum) { return [long]$stats.Sum }
    return [long]0
}

function Format-Size {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) { return ('{0,9:N2} GB' -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ('{0,9:N1} MB' -f ($Bytes / 1MB)) }
    if ($Bytes -gt 0) { return ('{0,9:N0} KB' -f ($Bytes / 1KB)) }
    return ('{0,9}' -f '0')
}

function Get-BlockingProcesses {
    $blocking = @()
    $names = @('cargo', 'rustc', 'rustdoc', 'ruforge', 'link', 'lld-link')

    foreach ($proc in (Get-Process -ErrorAction SilentlyContinue)) {
        if ($names -contains $proc.ProcessName) { $blocking += "$($proc.ProcessName) (pid $($proc.Id))" }
    }

    $nodes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and ($_.CommandLine -like '*vite*' -or $_.CommandLine -like '*tauri*') }
    foreach ($node in $nodes) { $blocking += "node (pid $($node.ProcessId)) running vite or tauri" }

    return $blocking
}

function Remove-Guarded {
    param([string]$Path)

    $check = Test-Deletable -Path $Path
    if (-not $check.Ok) { throw "refused to delete '$Path': $($check.Reason)" }
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
}

function Invoke-SelfTest {
    Write-Host 'Guard self-test' -ForegroundColor Cyan
    $fixtureRoot = Join-Path $env:TEMP 'ruforge-clean-selftest'
    $dropDir = Join-Path $fixtureRoot 'drop'
    $keepDir = Join-Path $fixtureRoot 'keep'
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $dropDir -Force | Out-Null
    New-Item -ItemType Directory -Path $keepDir -Force | Out-Null
    Set-Content -Path (Join-Path $dropDir 'artifact.o') -Value 'x'
    Set-Content -Path (Join-Path $keepDir 'artifact.o') -Value 'x'

    $cases = @(
        @{ Path = $dropDir;                                        Expect = $true }
        @{ Path = 'C:\RuForge\Media';                              Expect = $false }
        @{ Path = 'C:\RuForge';                                    Expect = $false }
        @{ Path = $repoRoot;                                       Expect = $false }
        @{ Path = $targetDir;                                      Expect = $false }
        @{ Path = (Join-Path $targetDir 'debug');                   Expect = $false }
        @{ Path = (Join-Path $targetDir 'release\bundle');          Expect = $false }
        @{ Path = $websiteReleasesDir;                              Expect = $false }
        @{ Path = $websiteDistDir;                                  Expect = $false }
        @{ Path = (Join-Path $repoRoot 'src-tauri\binaries');       Expect = $false }
        @{ Path = (Join-Path $env:USERPROFILE '.tauri');            Expect = $false }
        @{ Path = (Join-Path $env:APPDATA 'com.attic.ruforge');     Expect = $false }
        @{ Path = 'C:\';                                            Expect = $false }
        @{ Path = $incrementalDir;                                  Expect = $true }
    )

    $failures = 0
    foreach ($case in $cases) {
        $actual = (Test-Deletable -Path $case.Path).Ok
        $pass = ($actual -eq $case.Expect)
        if (-not $pass) { $failures++ }
        $status = if ($pass) { 'pass' } else { 'FAIL' }
        $color = if ($pass) { 'DarkGray' } else { 'Red' }
        Write-Host ('  {0}  deletable={1,-5} expected={2,-5}  {3}' -f $status, $actual, $case.Expect, $case.Path) -ForegroundColor $color
    }

    Remove-Guarded -Path $dropDir
    $dropGone = -not (Test-Path -LiteralPath $dropDir)
    $keepAlive = Test-Path -LiteralPath $keepDir
    Write-Host ('  {0}  fixture delete removed drop dir' -f $(if ($dropGone) { 'pass' } else { 'FAIL' })) -ForegroundColor $(if ($dropGone) { 'DarkGray' } else { 'Red' })
    Write-Host ('  {0}  fixture delete preserved sibling' -f $(if ($keepAlive) { 'pass' } else { 'FAIL' })) -ForegroundColor $(if ($keepAlive) { 'DarkGray' } else { 'Red' })
    if (-not $dropGone) { $failures++ }
    if (-not $keepAlive) { $failures++ }

    $refused = $false
    try { Remove-Guarded -Path 'C:\RuForge\Media' } catch { $refused = $true }
    Write-Host ('  {0}  Remove-Guarded refused user media' -f $(if ($refused) { 'pass' } else { 'FAIL' })) -ForegroundColor $(if ($refused) { 'DarkGray' } else { 'Red' })
    if (-not $refused) { $failures++ }

    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host ''
    if ($failures -gt 0) {
        Write-Host "$failures self-test failure(s)" -ForegroundColor Red
        return 1
    }
    Write-Host 'All guard self-tests passed.' -ForegroundColor Green
    return 0
}

if ($SelfTest) { exit (Invoke-SelfTest) }

$plan = @()

if ($Incremental) {
    $plan += [pscustomobject]@{
        Label = 'Rust incremental sessions'
        Paths = @($incrementalDir)
        Kind  = 'delete'
        Note  = 'whole directory, rebuilt on the next cargo build'
    }
}

if ($WebsiteDist) {
    $children = @()
    if (Test-Path -LiteralPath $websiteDistDir) {
        $children = Get-ChildItem -LiteralPath $websiteDistDir -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ne 'releases' } |
            ForEach-Object { $_.FullName }
    }
    $plan += [pscustomobject]@{
        Label = 'Website build output'
        Paths = $children
        Kind  = 'delete'
        Note  = 'website/dist/releases is preserved, it holds shipped installers'
    }
}

if ($NpmCache) {
    $plan += [pscustomobject]@{
        Label = 'npm cache'
        Paths = @()
        Kind  = 'npm-cache'
        Note  = 'cleared with npm cache clean --force'
    }
}

Write-Host ''
if ($plan.Count -eq 0) {
    Write-Host 'Nothing selected. Pass one or more switches:' -ForegroundColor Yellow
    Write-Host '  -Incremental   src-tauri/target/debug/incremental   ' -NoNewline
    Write-Host (Format-Size -Bytes (Measure-Path $incrementalDir))
    Write-Host '  -WebsiteDist   website/dist minus releases/         ' -NoNewline
    Write-Host (Format-Size -Bytes ((Measure-Path $websiteDistDir) - (Measure-Path $websiteReleasesDir)))
    Write-Host '  -NpmCache      npm cache clean --force'
    Write-Host ''
    Write-Host 'Add -Apply to delete. Without it this script only reports.' -ForegroundColor DarkGray
    Write-Host 'Run -SelfTest to verify the safety guards against temporary fixtures.' -ForegroundColor DarkGray
    Write-Host ''
    exit 0
}

$mode = if ($Apply) { 'APPLY' } else { 'DRY RUN' }
Write-Host "dev:clean:safe  mode=$mode" -ForegroundColor Cyan
Write-Host ''

$totalBytes = [long]0
foreach ($group in $plan) {
    Write-Host $group.Label -ForegroundColor White
    Write-Host "  $($group.Note)" -ForegroundColor DarkGray

    if ($group.Kind -eq 'npm-cache') {
        Write-Host ('  {0}  npm cache clean --force' -f (Format-Size -Bytes 0))
        continue
    }

    if ($group.Paths.Count -eq 0) {
        Write-Host '  nothing present' -ForegroundColor DarkGray
        continue
    }

    foreach ($path in $group.Paths) {
        $check = Test-Deletable -Path $path
        $bytes = Measure-Path -Path $path
        if (-not $check.Ok) {
            Write-Host ('  {0}  REFUSED  {1}  ({2})' -f (Format-Size -Bytes $bytes), $path, $check.Reason) -ForegroundColor Red
            continue
        }
        $totalBytes += $bytes
        Write-Host ('  {0}  {1}' -f (Format-Size -Bytes $bytes), $path)
    }
    Write-Host ''
}

Write-Host ('reclaimable now: {0}' -f (Format-Size -Bytes $totalBytes)) -ForegroundColor Cyan

if (-not $Apply) {
    Write-Host ''
    Write-Host 'Dry run only. Re-run with -Apply to delete the paths listed above.' -ForegroundColor Yellow
    Write-Host ''
    exit 0
}

$blocking = Get-BlockingProcesses
if ($blocking.Count -gt 0) {
    Write-Host ''
    Write-Host 'Refusing to delete. These processes are active:' -ForegroundColor Red
    foreach ($item in $blocking) { Write-Host "  $item" -ForegroundColor Red }
    Write-Host 'Stop the dev loop and run again.' -ForegroundColor Red
    exit 1
}

Write-Host ''
foreach ($group in $plan) {
    if ($group.Kind -eq 'npm-cache') {
        Write-Host 'clearing npm cache' -ForegroundColor DarkGray
        & npm.cmd cache clean --force
        continue
    }
    foreach ($path in $group.Paths) {
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $check = Test-Deletable -Path $path
        if (-not $check.Ok) {
            Write-Host "skipped $path ($($check.Reason))" -ForegroundColor Red
            continue
        }
        Write-Host "removing $path" -ForegroundColor DarkGray
        Remove-Guarded -Path $path
    }
}

Write-Host ''
Write-Host 'Cleanup complete.' -ForegroundColor Green
Write-Host ''
exit 0
