"""
Mojang-Session-Verifikation (abhängigkeitsfrei, urllib).

Genutzt wird derselbe Mechanismus wie beim Beitritt zu einem Minecraft-Server:

  1. Backend gibt der Mod eine Zufalls-"serverId" (Nonce).
  2. Die Mod ruft mit ihrem Session-Token Mojangs joinServer auf (serverId = Nonce).
  3. Das Backend fragt Mojang hasJoined?username=…&serverId=Nonce.
     Antwortet Mojang mit einem Profil, ist die Identität echt – und die UUID
     stammt aus der Mojang-Antwort, nicht vom (fälschbaren) Client.

Dadurch kann niemand unter fremder UUID einlösen.
"""

import json
import os
import urllib.parse
import urllib.request

HAS_JOINED = "https://sessionserver.mojang.com/session/minecraft/hasJoined"

# Verifizierung aktiv? (Standard aus – lokal/Dev sonst nicht nutzbar, und Mojang
# ist z.B. in Build-/Test-Umgebungen nicht erreichbar.)
MOJANG_AUTH = os.environ.get("SMPKIT_MOJANG_AUTH", "false").strip().lower() in ("1", "true", "yes", "on")


def _dash_uuid(undashed: str) -> str:
    """Mojang liefert die UUID ohne Bindestriche – in Standardform bringen."""
    if len(undashed) == 32:
        return (f"{undashed[0:8]}-{undashed[8:12]}-{undashed[12:16]}-"
                f"{undashed[16:20]}-{undashed[20:32]}")
    return undashed


def verify_join(username: str, server_id: str, timeout: int = 8) -> dict | None:
    """Fragt Mojang, ob <username> gerade mit <server_id> beigetreten ist.
    Rückgabe: {"uuid": <dashed>, "name": <name>} oder None."""
    url = (HAS_JOINED + "?username=" + urllib.parse.quote(username)
           + "&serverId=" + urllib.parse.quote(server_id))
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            if r.status != 200:
                return None                      # 204 = nicht beigetreten
            data = json.loads(r.read().decode("utf-8"))
            if not data.get("id") or not data.get("name"):
                return None
            return {"uuid": _dash_uuid(data["id"]), "name": data["name"]}
    except Exception:                            # noqa: BLE001 – Netzfehler = nicht verifiziert
        return None
