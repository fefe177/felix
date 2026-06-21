#!/usr/bin/env bash
# ============================================================
#  BigMC Server-Setup (macOS / Linux)
#  Laedt Paper 1.21.x, setzt die EULA, erstellt die Start-Datei.
#  Danach nur noch BigMC.jar in plugins/ legen.
#  Ausfuehren:  bash server-setup.sh
# ============================================================
set -e
VER="1.21.4"

echo "=== BigMC Server-Setup ==="

if ! command -v java >/dev/null 2>&1; then
  echo "[FEHLER] Java nicht gefunden. Bitte JDK 21 installieren:"
  echo "https://adoptium.net/temurin/releases/?version=21"
  exit 1
fi
echo "[OK] Java: $(java -version 2>&1 | head -1)"

echo "Lade neueste Paper $VER ..."
BUILD=$(curl -s "https://api.papermc.io/v2/projects/paper/versions/$VER/builds" \
  | grep -o '"build":[0-9]*' | tail -1 | grep -o '[0-9]*')
JAR="paper-$VER-$BUILD.jar"
curl -s -o paper.jar "https://api.papermc.io/v2/projects/paper/versions/$VER/builds/$BUILD/downloads/$JAR"

if [ ! -f paper.jar ]; then
  echo "[FEHLER] Download fehlgeschlagen."
  exit 1
fi
echo "[OK] Heruntergeladen: $JAR"

echo "eula=true" > eula.txt
echo "[OK] EULA akzeptiert."

mkdir -p plugins
echo "[OK] Ordner plugins bereit."

cat > start.sh <<'EOF'
#!/usr/bin/env bash
java -Xmx4G -jar paper.jar nogui
EOF
chmod +x start.sh
echo "[OK] start.sh erstellt."

echo ""
echo "=== FERTIG ==="
echo "1. BigMC.jar in den Ordner plugins/ legen"
echo "2. Server starten:  bash start.sh"
echo "3. Konsole:  op DEIN_NAME"
echo "4. Verbinden:  localhost"
echo "5. Im Spiel:  /spawnbuild  und  /afk set"
