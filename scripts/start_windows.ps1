# start_windows.ps1 - launch the installed LocalPilot desktop app on Windows.
#
# Run from the repository root:
#     .\scripts\start_windows.ps1
#
# Activates the virtual environment and starts the built GUI, which starts the
# Python backend itself. Make sure Ollama is running and a model is pulled
# (see install_windows.ps1).

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path ".venv\Scripts\Activate.ps1")) {
    Write-Host "Virtuelle Umgebung fehlt. Bitte zuerst .\scripts\install_windows.ps1 ausfuehren." -ForegroundColor Yellow
    exit 1
}
. .\.venv\Scripts\Activate.ps1

if (-not (Test-Path "gui\dist\index.html")) {
    Write-Host "GUI ist nicht gebaut. Baue jetzt ..." -ForegroundColor Yellow
    Push-Location gui
    npm run build
    Pop-Location
}

Write-Host "Starte LocalPilot (GUI + Backend) ..." -ForegroundColor Cyan
Set-Location gui
npm start
