# install_windows.ps1 - one-shot setup of LocalPilot (backend + GUI) on Windows.
#
# Run from the repository root in PowerShell:
#     .\scripts\install_windows.ps1
#
# Installs the Python backend into a local virtual environment, downloads the
# Playwright browser, and installs + builds the GUI. It checks for the required
# tools (Python, Node.js, Ollama) and tells you where to get any that are
# missing; it does not install those tools for you.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Test-Tool($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

Write-Host "== LocalPilot Setup ==" -ForegroundColor Cyan

# 1. Prerequisites
$missing = @()
if (-not (Test-Tool "python")) { $missing += "Python 3.11+  ->  https://www.python.org/downloads/ (Haken 'Add python.exe to PATH')" }
if (-not (Test-Tool "node"))   { $missing += "Node.js 18+   ->  https://nodejs.org/" }
if (-not (Test-Tool "ollama")) { $missing += "Ollama        ->  https://ollama.com/ (lokales KI-Modell)" }
if ($missing.Count -gt 0) {
    Write-Host "Bitte zuerst installieren und dann erneut ausfuehren:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  - $_" }
    exit 1
}

# 2. Python backend
Write-Host "`n[1/4] Python-Umgebung einrichten ..." -ForegroundColor Cyan
if (-not (Test-Path ".venv")) { python -m venv .venv }
. .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e .

# 3. Playwright browser
Write-Host "`n[2/4] Browser (Playwright/Chromium) laden ..." -ForegroundColor Cyan
playwright install chromium

# 4. GUI
Write-Host "`n[3/4] GUI installieren und bauen ..." -ForegroundColor Cyan
Push-Location gui
npm install
npm run build
Pop-Location

# 5. Model (optional)
Write-Host "`n[4/4] KI-Modell ..." -ForegroundColor Cyan
$models = ""
try { $models = (ollama list | Out-String) } catch { }
if ($models -notmatch "qwen3:8b") {
    $answer = Read-Host "Modell 'qwen3:8b' jetzt herunterladen? (mehrere GB) [j/N]"
    if ($answer -eq "j" -or $answer -eq "J") { ollama pull qwen3:8b }
    else { Write-Host "Spaeter mit:  ollama pull qwen3:8b" -ForegroundColor Yellow }
}

Write-Host "`nFertig! Starten mit:  .\scripts\start_windows.ps1" -ForegroundColor Green
