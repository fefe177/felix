@echo off
REM ============================================================
REM  SMP-Kit Komplett-Setup fuer Windows
REM  Richtet ALLES ein: startet den Website-/Trust-Server und
REM  baut die Minecraft-Mod + kopiert sie in den mods-Ordner.
REM  Einfach doppelklicken.
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo.
echo  ============================================
echo   SMP-Kit Setup  (Server + Mod)
echo  ============================================
echo.

REM ---------- 1) Python pruefen (fuer den Server) ----------
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if not defined PY (
  echo [FEHLER] Python fehlt.
  echo   1. https://www.python.org/downloads/  oeffnen
  echo   2. Installieren und dabei "Add Python to PATH" ANHAKEN
  echo   3. Dieses Skript erneut doppelklicken.
  echo.
  pause
  exit /b 1
)
echo [OK] Python gefunden.

REM ---------- 2) Java 21 pruefen (fuer den Mod-Build) ----------
set "HAVE_JAVA="
where java >nul 2>nul && set "HAVE_JAVA=1"
if not defined HAVE_JAVA (
  echo [HINWEIS] Java ^(JDK 21^) fehlt - noetig NUR fuer den Mod-Build.
  echo   Download: https://adoptium.net/temurin/releases/?version=21
  echo   Der Server startet trotzdem gleich.
) else (
  echo [OK] Java gefunden.
)

REM ---------- 3) Website-/Trust-Server in eigenem Fenster starten ----------
echo.
echo [1/3] Starte SMP-Kit Server in neuem Fenster ...
start "SMP-Kit Server" cmd /k "%~dp0smpkit-backend\start.bat"
echo        Shop danach im Browser:  http://localhost:8080
echo        (Fenster "SMP-Kit Server" offen lassen!)

REM ---------- 4) Mod bauen ----------
if not defined HAVE_JAVA goto skipbuild
echo.
echo [2/3] Baue die Minecraft-Mod (erster Build laedt einiges herunter,
echo        das kann einige Minuten dauern) ...
cd smpkit-mod
call gradlew.bat build --console=plain
if errorlevel 1 (
  echo.
  echo [FEHLER] Mod-Build fehlgeschlagen. Haeufigste Ursachen:
  echo   - Kein Java 21 ^(java -version pruefen^)
  echo   - Kein Internet / Firewall blockiert maven.fabricmc.net
  echo   Fehlermeldung oben lesen; Skript danach erneut ausfuehren.
  cd ..
  pause
  exit /b 1
)
cd ..

REM ---------- 5) Jar in den Minecraft-mods-Ordner kopieren ----------
echo.
echo [3/3] Kopiere Mod in deinen Minecraft-mods-Ordner ...
set "MODS=%APPDATA%\.minecraft\mods"
if not exist "%MODS%" mkdir "%MODS%"
set "COPIED="
for %%F in ("smpkit-mod\build\libs\smpkit-*.jar") do (
  echo %%~nxF | findstr /i "sources" >nul || (
    copy /y "%%~fF" "%MODS%\" >nul
    set "COPIED=%%~nxF"
  )
)
if defined COPIED (
  echo [OK] !COPIED!  ->  %MODS%
) else (
  echo [FEHLER] Keine Jar gefunden - Build pruefen.
)
goto done

:skipbuild
echo.
echo [UEBERSPRUNGEN] Mod-Build (Java fehlt). Nach der Java-Installation
echo dieses Skript einfach nochmal doppelklicken.

:done
echo.
echo  ============================================
echo   FERTIG! Naechste Schritte:
echo  ============================================
echo   1. Minecraft 1.21.1 mit FABRIC LOADER starten
echo      (https://fabricmc.net/use/installer/) und die
echo      FABRIC API in den mods-Ordner legen
echo      (https://modrinth.com/mod/fabric-api).
echo   2. Auf deinen SMP joinen und eingeben:
echo        /smpkit seturl http://localhost:8080
echo        /smpkit status
echo   3. Shop testen: http://localhost:8080 im Browser.
echo.
echo   Fuer andere erreichbar machen (spaeter):
echo        cloudflared tunnel --url http://localhost:8080
echo.
pause
