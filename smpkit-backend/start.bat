@echo off
REM SMP-Kit Server-Starter fuer Windows. Einfach doppelklicken.
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM --- Konfiguration laden (falls vorhanden) ---
if exist config.env (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("config.env") do (
    if not "%%A"=="" set "%%A=%%B"
  )
  echo [SMP-Kit] config.env geladen.
) else (
  echo [SMP-Kit] Keine config.env - starte im lokalen Test-Modus.
)

REM --- Datenordner + Standard-DB ---
if not exist data mkdir data
if not defined SMPKIT_DB set "SMPKIT_DB=data\trust.db"

REM --- Python finden ---
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo.
  echo [FEHLER] Python wurde nicht gefunden.
  echo Installiere Python von https://www.python.org/downloads/
  echo Wichtig: beim Installieren "Add Python to PATH" anhaken!
  echo.
  pause
  exit /b 1
)

echo.
echo [SMP-Kit] Server startet ... Zum Beenden dieses Fenster schliessen oder Strg+C.
echo [SMP-Kit] Shop im Browser:  http://localhost:%SMPKIT_PORT%
echo           (ohne gesetzten Port:  http://localhost:8080 )
echo.
%PY% trust_server.py
echo.
echo [SMP-Kit] Server beendet.
pause
