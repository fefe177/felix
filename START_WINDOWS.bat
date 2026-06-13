@echo off
title Blox Tower Defense 3D
cd /d "%~dp0"

rem ============================================================
rem  Startet Blox Tower Defense 3D als ECHTE APP (kein Browser).
rem  Einfach doppelklicken!
rem ============================================================

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js ist noch nicht installiert.
  echo   Bitte einmalig von https://nodejs.org installieren ^(LTS^),
  echo   danach diese Datei erneut doppelklicken.
  echo.
  pause
  exit /b
)

if not exist "node_modules\electron" (
  echo Erstes Mal: richte das Spiel ein, bitte kurz warten...
  call npm install
)

echo Starte Blox Tower Defense 3D...
call npm start
