@echo off
title Blox Tower Defense 3D - EXE bauen
cd /d "%~dp0"

rem ============================================================
rem  Baut eine einzelne, portable "Blox Tower Defense 3D.exe"
rem  zum Weitergeben. Andere brauchen dann KEIN Node.js.
rem  Einfach doppelklicken!
rem ============================================================

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js fehlt. Bitte einmalig von https://nodejs.org installieren ^(LTS^),
  echo   danach diese Datei erneut doppelklicken.
  echo.
  pause
  exit /b
)

if not exist "node_modules\electron-builder" (
  echo Richte Bau-Werkzeuge ein, bitte warten...
  call npm install
)

echo.
echo Baue die EXE ^(das dauert ein paar Minuten^)...
call npm run build:win

echo.
echo ============================================================
echo   FERTIG! Deine Datei liegt im Ordner "dist":
echo   dist\Blox Tower Defense 3D.exe
echo   Diese eine Datei kannst du weitergeben - laeuft per Doppelklick.
echo ============================================================
echo.
pause
