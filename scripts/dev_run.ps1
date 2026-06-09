# dev_run.ps1 - start the LocalPilot backend and the desktop GUI for development.
#
# Usage (from the repository root, PowerShell on Windows):
#     .\scripts\dev_run.ps1
#
# It starts `localpilot serve` in a separate window and launches the Electron
# GUI configured to use that external backend. Stop the GUI window to finish,
# then close the backend window.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# Activate the virtual environment if present.
$venvActivate = Join-Path $repoRoot ".venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    . $venvActivate
}

Write-Host "Starting backend (localpilot serve) in a new window..."
Start-Process -FilePath "localpilot" -ArgumentList "serve" -WorkingDirectory $repoRoot

Write-Host "Starting GUI (gui/ npm run dev) against the external backend..."
Set-Location (Join-Path $repoRoot "gui")
if (-not (Test-Path "node_modules")) {
    npm install
}
$env:LOCALPILOT_EXTERNAL_BACKEND = "1"
npm run dev
