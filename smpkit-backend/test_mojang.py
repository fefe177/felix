#!/usr/bin/env python3
"""
Test der Mojang-verifizierten Einlösung. Startet den Server in-process und
ersetzt den echten Mojang-Aufruf durch ein Mock (Mojang ist in CI eh nicht
erreichbar). Prüft: Nonce -> verifizierte Einlösung -> Token an echte UUID
gebunden, Fehlerfälle, Nonce-Einmalnutzung und Identitätsbindung bei Reports.
"""
import json
import tempfile
import threading
import urllib.error
import urllib.request

import licensing
import mojang
import trust_server

PORT = 8613
URL = f"http://127.0.0.1:{PORT}"
FAKE_UUID = "11111111-2222-3333-4444-555566667777"


def _get(path):
    with urllib.request.urlopen(URL + path, timeout=5) as r:
        return r.status, json.loads(r.read())


def _post(path, body, headers=None):
    data = json.dumps(body).encode()
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(URL + path, data=data, method="POST", headers=h)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def main():
    db = tempfile.mktemp(suffix=".db")

    # Mojang aktivieren + mocken
    mojang.MOJANG_AUTH = True
    mojang.verify_join = lambda username, server_id, timeout=8: (
        {"uuid": FAKE_UUID, "name": username} if username == "Alice" else None)

    H = trust_server.Handler
    H.store = trust_server.Store(db)
    H.licenses = licensing.LicenseStore(db)
    H.admin_key = None
    H.license_required = True

    httpd = trust_server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        key = H.licenses.issue_for_session("sess", None)

        # 1) Nonce holen
        _, nb = _get("/api/auth/nonce")
        assert nb["mojangAuth"] is True and nb["nonce"], nb
        nonce = nb["nonce"]

        # 2) Verifizierte Einlösung
        code, body = _post("/api/redeem", {"key": key, "username": "Alice", "nonce": nonce})
        assert code == 200 and body.get("token"), (code, body)
        token = body["token"]
        assert H.licenses.uuid_for_token(token) == FAKE_UUID, "Token nicht an Mojang-UUID gebunden"
        print("verified redeem ....... OK  (UUID kommt von Mojang, nicht vom Client)")

        # 3) Nonce ist einmalig -> erneut nutzen schlägt fehl
        code, _ = _post("/api/redeem", {"key": key, "username": "Alice", "nonce": nonce})
        assert code == 400, code
        print("nonce single-use ...... OK  (verbrauchte Nonce -> 400)")

        # 4) Falscher/entfallener Mojang-Beweis -> 401
        _, nb2 = _get("/api/auth/nonce")
        code, _ = _post("/api/redeem", {"key": key, "username": "Mallory", "nonce": nb2["nonce"]})
        assert code == 401, code
        print("bad identity .......... OK  (Mojang verneint -> 401)")

        # 5) Identitätsbindung: Report nutzt die Token-UUID, nicht die Client-UUID
        code, _ = _post("/api/report",
                        {"reporterUuid": "GEFAELSCHTE-UUID", "reporter": "Alice",
                         "target": "Griefer", "category": "scam_tptrade"},
                        headers={"X-Api-Key": token})
        assert code == 200, code
        assert H.store.last_report_time(FAKE_UUID, "Griefer") is not None, \
            "Report wurde nicht der verifizierten UUID zugeordnet"
        assert H.store.last_report_time("GEFAELSCHTE-UUID", "Griefer") is None, \
            "Client-UUID hätte ignoriert werden müssen"
        print("identity binding ...... OK  (Report an verifizierte UUID gebunden)")

        print("\nAlle Mojang-Verifikationstests bestanden.")
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    main()
