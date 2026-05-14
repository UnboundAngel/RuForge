$bat = Join-Path (Split-Path -Parent $PSScriptRoot) "Build-signed-windows.bat"
if (-not (Test-Path -LiteralPath $bat)) {
  Write-Error "Missing: $bat"
  exit 1
}
$desk = [Environment]::GetFolderPath("Desktop")
$W = New-Object -ComObject WScript.Shell
$lnkPath = Join-Path $desk "RuForge signed build.lnk"
$s = $W.CreateShortcut($lnkPath)
$s.TargetPath = $bat
$s.WorkingDirectory = Split-Path -Parent $bat
$s.WindowStyle = 1
$s.Description = "Signed Tauri build for RuForge (local only, no Git push)"
$s.Save()
Write-Host "Created: $lnkPath"
