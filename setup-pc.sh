#!/usr/bin/env bash
# ============================================================
#  SMP-Kit Komplett-Setup für macOS / Linux
#  Startet den Website-/Trust-Server und baut die Mod +
#  kopiert sie in den Minecraft-mods-Ordner.
#     chmod +x setup-pc.sh && ./setup-pc.sh
# ============================================================
set -u
cd "$(dirname "$0")"
echo
echo " ============================================"
echo "  SMP-Kit Setup  (Server + Mod)"
echo " ============================================"
echo

# ---------- 1) Python prüfen ----------
PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  echo "[FEHLER] Python fehlt.  macOS: brew install python  |  Linux: sudo apt install python3"
  exit 1
fi
echo "[OK] Python gefunden."

# ---------- 2) Java prüfen ----------
HAVE_JAVA=""
command -v java >/dev/null 2>&1 && HAVE_JAVA=1
if [ -z "$HAVE_JAVA" ]; then
  echo "[HINWEIS] Java (JDK 21) fehlt – nötig NUR für den Mod-Build."
  echo "  Download: https://adoptium.net/temurin/releases/?version=21"
fi

# ---------- 3) Server starten (Hintergrund) ----------
echo
echo "[1/3] Starte SMP-Kit Server ..."
(
  cd smpkit-backend || exit 1
  nohup ./start.sh > server-console.log 2>&1 &
  echo $! > server.pid
)
sleep 2
if curl -s http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
  echo "       [OK] Server läuft – Shop: http://localhost:8080"
  echo "       (stoppen: kill \$(cat smpkit-backend/server.pid))"
else
  echo "       [WARNUNG] Server antwortet (noch) nicht – Log: smpkit-backend/server-console.log"
fi

# ---------- 4) Mod bauen ----------
if [ -n "$HAVE_JAVA" ]; then
  echo
  echo "[2/3] Baue die Minecraft-Mod (erster Build kann einige Minuten dauern) ..."
  ( cd smpkit-mod && ./gradlew build --console=plain )
  if [ $? -ne 0 ]; then
    echo
    echo "[FEHLER] Mod-Build fehlgeschlagen (Java 21? Internet/maven.fabricmc.net?)."
    exit 1
  fi

  # ---------- 5) Jar kopieren ----------
  echo
  echo "[3/3] Kopiere Mod in den Minecraft-mods-Ordner ..."
  case "$(uname)" in
    Darwin) MODS="$HOME/Library/Application Support/minecraft/mods" ;;
    *)      MODS="$HOME/.minecraft/mods" ;;
  esac
  mkdir -p "$MODS"
  JAR="$(ls smpkit-mod/build/libs/smpkit-*.jar 2>/dev/null | grep -v sources | head -1)"
  if [ -n "$JAR" ]; then
    cp -f "$JAR" "$MODS/"
    echo "[OK] $(basename "$JAR")  ->  $MODS"
  else
    echo "[FEHLER] Keine Jar gefunden – Build prüfen."
  fi
else
  echo
  echo "[ÜBERSPRUNGEN] Mod-Build (Java fehlt). Nach der Installation Skript erneut ausführen."
fi

echo
echo " ============================================"
echo "  FERTIG! Nächste Schritte:"
echo " ============================================"
echo "  1. Minecraft 1.21.1 mit FABRIC LOADER starten"
echo "     (https://fabricmc.net/use/installer/) + FABRIC API in den"
echo "     mods-Ordner (https://modrinth.com/mod/fabric-api)."
echo "  2. Auf dem SMP:  /smpkit seturl http://localhost:8080"
echo "                   /smpkit status"
echo "  3. Shop testen:  http://localhost:8080"
echo
echo "  Öffentlich machen (später):  cloudflared tunnel --url http://localhost:8080"
echo
