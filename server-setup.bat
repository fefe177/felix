@echo off
REM ============================================================
REM  BigMC Server-Setup (Windows) - einfach doppelklicken.
REM  Laedt automatisch Paper 1.21.x, setzt die EULA und legt
REM  eine Start-Datei an. Danach nur noch BigMC.jar einlegen.
REM ============================================================
setlocal EnableDelayedExpansion
set VER=1.21.4

echo.
echo ===========================================
echo    BigMC Server-Setup
echo ===========================================
echo.

REM --- Java pruefen ---
where java >nul 2>nul
if errorlevel 1 (
  echo [FEHLER] Java wurde nicht gefunden.
  echo Bitte installiere JDK 21: https://adoptium.net/temurin/releases/?version=21
  echo Bei der Installation "Add to PATH" anhaken, dann dieses Script erneut starten.
  pause
  exit /b 1
)
echo [OK] Java gefunden:
java -version 2>&1 | findstr /i version
echo.

REM --- Neueste Paper-JAR herunterladen ---
echo Lade neueste Paper %VER% herunter ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; $ver='%VER%';" ^
  "$b=(Invoke-RestMethod \"https://api.papermc.io/v2/projects/paper/versions/$ver/builds\").builds[-1].build;" ^
  "$jar=\"paper-$ver-$b.jar\";" ^
  "Invoke-WebRequest \"https://api.papermc.io/v2/projects/paper/versions/$ver/builds/$b/downloads/$jar\" -OutFile 'paper.jar';" ^
  "Write-Host ('[OK] Heruntergeladen: '+$jar)"

if not exist paper.jar (
  echo [FEHLER] Download fehlgeschlagen. Pruefe deine Internetverbindung.
  pause
  exit /b 1
)

REM --- EULA akzeptieren ---
echo eula=true> eula.txt
echo [OK] EULA akzeptiert (eula.txt = true).

REM --- plugins-Ordner anlegen ---
if not exist plugins mkdir plugins
echo [OK] Ordner "plugins" bereit.

REM --- Start-Datei erzeugen ---
echo @echo off> start.bat
echo java -Xmx4G -jar paper.jar nogui>> start.bat
echo pause>> start.bat
echo [OK] start.bat erstellt (4 GB RAM).

echo.
echo ===========================================
echo    FERTIG!
echo ===========================================
echo  1. Lege die Datei  BigMC.jar  in den Ordner  "plugins"
echo  2. Starte den Server mit  start.bat
echo  3. In der Server-Konsole:  op DEIN_NAME
echo  4. In Minecraft verbinden:  localhost
echo  5. Im Spiel:  /spawnbuild   und   /afk set
echo.
pause
