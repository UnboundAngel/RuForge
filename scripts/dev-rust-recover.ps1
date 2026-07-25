# Recovery for the ReFS Dev Drive incremental finalization bug (rust-lang/rust#151181).
# Use when healthy Rust leaf rebuilds jump from roughly 9 seconds to roughly 28 seconds
# because the incremental session directory stopped finalizing. Runs exactly one
# non-incremental build so rustc can start a fresh session that finalizes.
#
# CARGO_INCREMENTAL is set for this process only. Nothing is persisted and nothing is cleaned.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $repoRoot 'src-tauri\Cargo.toml'

Write-Host 'Running one non-incremental cargo build to reset the incremental session.' -ForegroundColor Cyan
Write-Host 'Incremental compilation stays enabled for every other build.' -ForegroundColor DarkGray

$code = 1
$env:CARGO_INCREMENTAL = '0'
try {
    & cargo build --manifest-path $manifest
    $code = $LASTEXITCODE
}
finally {
    Remove-Item Env:CARGO_INCREMENTAL -ErrorAction SilentlyContinue
}

if ($code -eq 0) {
    Write-Host 'Done. The next normal build creates a fresh incremental session.' -ForegroundColor Green
}

exit $code
