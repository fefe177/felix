#!/usr/bin/env python3
"""
SMP-Kit Trust Backend
=====================

Ein abhängigkeitsfreier Reputations-/Trust-Server für die SMP-Kit Minecraft-Mod
(Donut SMP / Hugo SMP). Läuft mit reiner Python-Standardbibliothek – kein pip nötig.

Konzept
-------
Spieler melden (report) oder empfehlen (vouch) andere Spieler. Aus der Summe aller
Meldungen wird pro Spieler ein Vertrauenswert in Prozent berechnet, den jeder Client
mit der Mod abfragen kann. Ab einer bestimmten Anzahl *unterschiedlicher* Melder
landet ein Spieler auf einer geteilten Blacklist.

Anti-Missbrauch
---------------
- Pro (Melder, Ziel) zählt nur EIN Report – Massen-Spam durch eine Person bringt nichts,
  gewertet werden nur *unterschiedliche* Melder.
- Einfaches Rate-Limit pro Melder-UUID.
- Optionaler gemeinsamer API-Key (X-Api-Key).

Endpunkte
---------
GET  /api/health
GET  /api/player?name=NAME
GET  /api/players?names=A,B,C          (Batch, für HUD naher Spieler)
GET  /api/blacklist                    (geteilte Liste geflaggter Spieler)
POST /api/report   {reporterUuid, reporter, target, category, note}
POST /api/vouch    {voucherUuid, voucher, target}
POST /api/unreport {reporterUuid, target}

Start
-----
python3 trust_server.py --port 8080 --db trust.db [--api-key GEHEIM]
"""

import argparse
import json
import re
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# --- Trust-Parameter (server-seitig konfigurierbar) -------------------------
REPORT_WEIGHT = 3.0      # wie stark ein Report gegenüber einem Vouch zählt
SMOOTH_K = 1.0           # Glättung/Prior -> unbekannter Spieler startet neutral bei 50%
FLAG_THRESHOLD = 5       # ab so vielen unterschiedlichen Meldern kommt Flag in Frage
FLAG_TRUST_BELOW = 30    # ... UND Trust unter diesem Wert -> Blacklist

# --- Zeitverfall: alte Meldungen wiegen weniger -----------------------------
DECAY_ENABLED = True
HALFLIFE_DAYS = 45.0     # nach so vielen Tagen zählt eine Meldung nur noch halb

# --- Gewichtung nach Melder-Reputation --------------------------------------
# Eine Meldung eines vertrauenswürdigen Spielers zählt mehr, die eines selbst
# schlecht bewerteten weniger. Multiplikator wird auf [MIN, MAX] begrenzt.
CREDIBILITY_ENABLED = True
CRED_MIN = 0.3
CRED_MAX = 1.4
VALID_CATEGORIES = {
    "scam_tptrade",      # betrogen beim TP-Trade
    "tp_kill",           # beim Hinteleportieren getötet/gefallen gelassen
    "item_switch",       # Item beim Handeln getauscht
    "pay_first_scam",    # "zahl zuerst"-Masche
    "doubling_scam",     # "verdopple dein Geld"
    "other",
}

# --- einfache In-Memory Rate-Limits ----------------------------------------
RATE_WINDOW_S = 60
RATE_MAX = 20            # max. Schreib-Aktionen pro UUID pro Fenster
_rate_lock = threading.Lock()
_rate_hits: dict[str, list[float]] = {}

NAME_RE = re.compile(r"^[A-Za-z0-9_]{1,16}$")


def rate_ok(uuid: str) -> bool:
    now = time.time()
    with _rate_lock:
        hits = [t for t in _rate_hits.get(uuid, []) if now - t < RATE_WINDOW_S]
        if len(hits) >= RATE_MAX:
            _rate_hits[uuid] = hits
            return False
        hits.append(now)
        _rate_hits[uuid] = hits
        return True


# --- Datenbank --------------------------------------------------------------
class Store:
    def __init__(self, path: str):
        # check_same_thread=False -> mit eigenem Lock threadsicher genutzt
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        self._init_schema()

    def _init_schema(self):
        with self.lock:
            self.db.executescript(
                """
                CREATE TABLE IF NOT EXISTS reports (
                    reporter_uuid TEXT NOT NULL,
                    reporter_name TEXT NOT NULL,
                    target_name   TEXT NOT NULL COLLATE NOCASE,
                    category      TEXT NOT NULL,
                    note          TEXT,
                    ts            REAL NOT NULL,
                    PRIMARY KEY (reporter_uuid, target_name)
                );
                CREATE TABLE IF NOT EXISTS vouches (
                    voucher_uuid TEXT NOT NULL,
                    voucher_name TEXT NOT NULL,
                    target_name  TEXT NOT NULL COLLATE NOCASE,
                    ts           REAL NOT NULL,
                    PRIMARY KEY (voucher_uuid, target_name)
                );
                CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_name);
                CREATE INDEX IF NOT EXISTS idx_vouches_target ON vouches(target_name);
                """
            )
            self.db.commit()

    def add_report(self, reporter_uuid, reporter_name, target, category, note):
        with self.lock:
            self.db.execute(
                "INSERT INTO reports(reporter_uuid, reporter_name, target_name, category, note, ts) "
                "VALUES(?,?,?,?,?,?) "
                "ON CONFLICT(reporter_uuid, target_name) DO UPDATE SET "
                "category=excluded.category, note=excluded.note, ts=excluded.ts, "
                "reporter_name=excluded.reporter_name",
                (reporter_uuid, reporter_name, target, category, note, time.time()),
            )
            self.db.commit()

    def remove_report(self, reporter_uuid, target):
        with self.lock:
            cur = self.db.execute(
                "DELETE FROM reports WHERE reporter_uuid=? AND target_name=? COLLATE NOCASE",
                (reporter_uuid, target),
            )
            self.db.commit()
            return cur.rowcount

    def add_vouch(self, voucher_uuid, voucher_name, target):
        with self.lock:
            self.db.execute(
                "INSERT INTO vouches(voucher_uuid, voucher_name, target_name, ts) "
                "VALUES(?,?,?,?) "
                "ON CONFLICT(voucher_uuid, target_name) DO UPDATE SET "
                "ts=excluded.ts, voucher_name=excluded.voucher_name",
                (voucher_uuid, voucher_name, target, time.time()),
            )
            self.db.commit()

    def counts(self, target):
        with self.lock:
            r = self.db.execute(
                "SELECT COUNT(DISTINCT reporter_uuid) AS n FROM reports WHERE target_name=? COLLATE NOCASE",
                (target,),
            ).fetchone()["n"]
            v = self.db.execute(
                "SELECT COUNT(DISTINCT voucher_uuid) AS n FROM vouches WHERE target_name=? COLLATE NOCASE",
                (target,),
            ).fetchone()["n"]
            return r, v

    def report_rows(self, target):
        """(reporter_uuid, reporter_name, ts) je Report auf das Ziel."""
        with self.lock:
            rows = self.db.execute(
                "SELECT reporter_uuid, reporter_name, ts FROM reports "
                "WHERE target_name=? COLLATE NOCASE",
                (target,),
            ).fetchall()
            return [(r["reporter_uuid"], r["reporter_name"], r["ts"]) for r in rows]

    def vouch_rows(self, target):
        """(voucher_uuid, voucher_name, ts) je Vouch auf das Ziel."""
        with self.lock:
            rows = self.db.execute(
                "SELECT voucher_uuid, voucher_name, ts FROM vouches "
                "WHERE target_name=? COLLATE NOCASE",
                (target,),
            ).fetchall()
            return [(r["voucher_uuid"], r["voucher_name"], r["ts"]) for r in rows]

    def category_breakdown(self, target):
        with self.lock:
            rows = self.db.execute(
                "SELECT category, COUNT(*) AS n FROM reports WHERE target_name=? COLLATE NOCASE GROUP BY category",
                (target,),
            ).fetchall()
            return {row["category"]: row["n"] for row in rows}

    def blacklist(self):
        """Alle Spieler, die die Flag-Bedingung erfüllen."""
        with self.lock:
            rows = self.db.execute(
                "SELECT target_name, COUNT(DISTINCT reporter_uuid) AS reporters "
                "FROM reports GROUP BY target_name HAVING reporters >= ?",
                (FLAG_THRESHOLD,),
            ).fetchall()
        result = []
        for row in rows:
            info = compute_trust(self, row["target_name"])
            if info["flagged"]:
                result.append(info)
        result.sort(key=lambda x: x["trust"])
        return result


def _score(reports: float, vouches: float) -> int:
    """Beta-artige Glättung: unbekannt -> 50 %, Reports senken, Vouches heben."""
    s = (vouches + SMOOTH_K) / (vouches + REPORT_WEIGHT * reports + 2 * SMOOTH_K)
    return round(100 * s)


def _decay(ts: float) -> float:
    """Gewicht einer Meldung nach Alter (Halbwertszeit HALFLIFE_DAYS)."""
    if not DECAY_ENABLED:
        return 1.0
    age_days = max(0.0, (time.time() - ts) / 86400.0)
    return 0.5 ** (age_days / HALFLIFE_DAYS)


def base_trust_raw(store: Store, name: str) -> dict:
    """Einfacher, nicht-rekursiver Trust nur aus Roh-Zählungen – Basis für die
    Melder-Reputation (verhindert unendliche Rekursion)."""
    reports, vouches = store.counts(name)
    return {"trust": _score(reports, vouches), "rated": (reports + vouches) > 0}


def credibility(store: Store, name: str) -> float:
    """Multiplikator für die Meldung eines Spielers, abgeleitet aus seiner
    eigenen Reputation. Unbewertete Melder zählen neutral (1.0)."""
    if not CREDIBILITY_ENABLED or not name:
        return 1.0
    bt = base_trust_raw(store, name)
    if not bt["rated"]:
        return 1.0
    # Trust 50 -> 1.0, Trust 100 -> 2.0 (gekappt), Trust 0 -> 0.0 (gekappt).
    mult = bt["trust"] / 50.0
    return max(CRED_MIN, min(CRED_MAX, mult))


def compute_trust(store: Store, name: str) -> dict:
    # Rohzählung unterschiedlicher Melder/Empfehler – dient als harte Flag-Schwelle.
    raw_reports, raw_vouches = store.counts(name)

    # Effektive, gewichtete Summen (Zeitverfall * Melder-Reputation).
    eff_reports = 0.0
    for _uuid, rname, ts in store.report_rows(name):
        eff_reports += _decay(ts) * credibility(store, rname)
    eff_vouches = 0.0
    for _uuid, vname, ts in store.vouch_rows(name):
        eff_vouches += _decay(ts) * credibility(store, vname)

    trust = _score(eff_reports, eff_vouches)
    rated = (raw_reports + raw_vouches) > 0
    flagged = raw_reports >= FLAG_THRESHOLD and trust < FLAG_TRUST_BELOW
    return {
        "name": name,
        "trust": trust,
        "reports": raw_reports,
        "vouches": raw_vouches,
        "effReports": round(eff_reports, 2),
        "effVouches": round(eff_vouches, 2),
        "rated": rated,
        "flagged": flagged,
        "categories": store.category_breakdown(name) if raw_reports else {},
    }


# --- HTTP -------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "SMPKitTrust/1.0"
    store: Store = None          # von main() gesetzt
    api_key: str = None          # optional

    def log_message(self, fmt, *args):  # ruhigeres Log
        pass

    # -- Helfer --
    def _send(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _auth_ok(self):
        if not self.api_key:
            return True
        return self.headers.get("X-Api-Key") == self.api_key

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0 or length > 64 * 1024:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    @staticmethod
    def _valid_name(name):
        return isinstance(name, str) and bool(NAME_RE.match(name))

    # -- Routen --
    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)

        if u.path == "/api/health":
            return self._send(200, {"ok": True, "service": "smpkit-trust", "version": "1.0"})

        if not self._auth_ok():
            return self._send(401, {"error": "unauthorized"})

        if u.path == "/api/player":
            name = (q.get("name", [""])[0]).strip()
            if not self._valid_name(name):
                return self._send(400, {"error": "invalid name"})
            return self._send(200, compute_trust(self.store, name))

        if u.path == "/api/players":
            raw = (q.get("names", [""])[0]).strip()
            names = [n for n in (s.strip() for s in raw.split(",")) if self._valid_name(n)]
            names = names[:50]  # Deckel
            return self._send(200, {n: compute_trust(self.store, n) for n in names})

        if u.path == "/api/blacklist":
            return self._send(200, {"players": self.store.blacklist()})

        return self._send(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        if not self._auth_ok():
            return self._send(401, {"error": "unauthorized"})
        data = self._read_json()
        if data is None:
            return self._send(400, {"error": "invalid json"})

        if u.path == "/api/report":
            return self._handle_report(data)
        if u.path == "/api/vouch":
            return self._handle_vouch(data)
        if u.path == "/api/unreport":
            return self._handle_unreport(data)
        return self._send(404, {"error": "not found"})

    def _handle_report(self, d):
        ru = str(d.get("reporterUuid", "")).strip()
        rn = str(d.get("reporter", "")).strip()
        target = str(d.get("target", "")).strip()
        category = str(d.get("category", "other")).strip()
        note = str(d.get("note", ""))[:280]
        if not ru or not self._valid_name(rn) or not self._valid_name(target):
            return self._send(400, {"error": "invalid reporter/target"})
        if rn.lower() == target.lower():
            return self._send(400, {"error": "cannot report yourself"})
        if category not in VALID_CATEGORIES:
            category = "other"
        if not rate_ok(ru):
            return self._send(429, {"error": "rate limited"})
        self.store.add_report(ru, rn, target, category, note)
        return self._send(200, {"ok": True, "player": compute_trust(self.store, target)})

    def _handle_vouch(self, d):
        vu = str(d.get("voucherUuid", "")).strip()
        vn = str(d.get("voucher", "")).strip()
        target = str(d.get("target", "")).strip()
        if not vu or not self._valid_name(vn) or not self._valid_name(target):
            return self._send(400, {"error": "invalid voucher/target"})
        if vn.lower() == target.lower():
            return self._send(400, {"error": "cannot vouch yourself"})
        if not rate_ok(vu):
            return self._send(429, {"error": "rate limited"})
        self.store.add_vouch(vu, vn, target)
        return self._send(200, {"ok": True, "player": compute_trust(self.store, target)})

    def _handle_unreport(self, d):
        ru = str(d.get("reporterUuid", "")).strip()
        target = str(d.get("target", "")).strip()
        if not ru or not self._valid_name(target):
            return self._send(400, {"error": "invalid reporter/target"})
        removed = self.store.remove_report(ru, target)
        return self._send(200, {"ok": True, "removed": removed, "player": compute_trust(self.store, target)})


def main():
    import os
    ap = argparse.ArgumentParser(description="SMP-Kit Trust Backend")
    # Reihenfolge: CLI-Argument > Umgebungsvariable > Standard.
    ap.add_argument("--port", type=int, default=int(os.environ.get("SMPKIT_PORT", "8080")))
    ap.add_argument("--host", default=os.environ.get("SMPKIT_HOST", "0.0.0.0"))
    ap.add_argument("--db", default=os.environ.get("SMPKIT_DB", "trust.db"))
    ap.add_argument("--api-key", default=os.environ.get("SMPKIT_API_KEY") or None,
                    help="optionaler gemeinsamer API-Key (X-Api-Key)")
    args = ap.parse_args()

    Handler.store = Store(args.db)
    Handler.api_key = args.api_key

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"SMP-Kit Trust Backend läuft auf http://{args.host}:{args.port} (db={args.db}, "
          f"auth={'an' if args.api_key else 'aus'})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nBeende ...")
        httpd.shutdown()


if __name__ == "__main__":
    main()
