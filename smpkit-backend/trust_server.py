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
import os
import re
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import licensing
import mojang

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

# Brute-Force-Schutz für Schlüssel-Einlösung/-Prüfung: pro IP.
IP_RATE_WINDOW_S = 600
IP_RATE_MAX = 10        # max. Einlöse-/Prüf-Versuche pro IP pro 10 Minuten
_ip_lock = threading.Lock()
_ip_hits: dict[str, list[float]] = {}

# Bewertungssperre: dieselbe Person kann man nur alle 5 Stunden neu bewerten.
RATING_COOLDOWN_S = 5 * 3600

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


def ip_rate_ok(ip: str) -> bool:
    """Zählt Einlöse-/Prüf-Versuche pro IP gegen Brute-Force."""
    now = time.time()
    with _ip_lock:
        hits = [t for t in _ip_hits.get(ip, []) if now - t < IP_RATE_WINDOW_S]
        if len(hits) >= IP_RATE_MAX:
            _ip_hits[ip] = hits
            return False
        hits.append(now)
        _ip_hits[ip] = hits
        return True


# --- Nonces für die Mojang-Verifikation (serverId beim joinServer) ----------
NONCE_TTL_S = 120
_nonce_lock = threading.Lock()
_nonces: dict[str, float] = {}


def new_nonce() -> str:
    import secrets
    n = secrets.token_hex(16)
    now = time.time()
    with _nonce_lock:
        # abgelaufene aufräumen
        for k in [k for k, exp in _nonces.items() if exp < now]:
            _nonces.pop(k, None)
        _nonces[n] = now + NONCE_TTL_S
    return n


def consume_nonce(n: str) -> bool:
    """Einmalig verwendbar: gibt True, wenn die Nonce gültig war (und entfernt sie)."""
    if not n:
        return False
    now = time.time()
    with _nonce_lock:
        exp = _nonces.pop(n, None)
        return exp is not None and exp >= now


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

    def last_report_time(self, reporter_uuid, target):
        """Zeitpunkt des letzten Reports dieses Melders auf dieses Ziel (oder None)."""
        with self.lock:
            row = self.db.execute(
                "SELECT ts FROM reports WHERE reporter_uuid=? AND target_name=? COLLATE NOCASE",
                (reporter_uuid, target),
            ).fetchone()
            return row["ts"] if row else None

    def last_vouch_time(self, voucher_uuid, target):
        """Zeitpunkt des letzten Vouches dieses Empfehlers auf dieses Ziel (oder None)."""
        with self.lock:
            row = self.db.execute(
                "SELECT ts FROM vouches WHERE voucher_uuid=? AND target_name=? COLLATE NOCASE",
                (voucher_uuid, target),
            ).fetchone()
            return row["ts"] if row else None

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

    def activity_counts(self, name):
        """Wie oft hat dieser Spieler selbst gemeldet/empfohlen (als Akteur)?"""
        with self.lock:
            rb = self.db.execute(
                "SELECT COUNT(*) AS n FROM reports WHERE reporter_name=? COLLATE NOCASE",
                (name,),
            ).fetchone()["n"]
            vb = self.db.execute(
                "SELECT COUNT(*) AS n FROM vouches WHERE voucher_name=? COLLATE NOCASE",
                (name,),
            ).fetchone()["n"]
            return rb, vb

    def delete_player_data(self, name, uuid=None):
        """Löscht alle Trust-Daten zu einem Spieler – als Ziel UND als Melder/Empfehler."""
        with self.lock:
            total = 0
            for sql, param in (
                ("DELETE FROM reports WHERE target_name=? COLLATE NOCASE", (name,)),
                ("DELETE FROM reports WHERE reporter_name=? COLLATE NOCASE", (name,)),
                ("DELETE FROM vouches WHERE target_name=? COLLATE NOCASE", (name,)),
                ("DELETE FROM vouches WHERE voucher_name=? COLLATE NOCASE", (name,)),
            ):
                total += self.db.execute(sql, param).rowcount
            if uuid:
                total += self.db.execute(
                    "DELETE FROM reports WHERE reporter_uuid=?", (uuid,)).rowcount
                total += self.db.execute(
                    "DELETE FROM vouches WHERE voucher_uuid=?", (uuid,)).rowcount
            self.db.commit()
            return total

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
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")

# Betreiber-Angaben für Impressum/Datenschutz (per Umgebungsvariablen).
OPERATOR = {
    "name": os.environ.get("SMPKIT_OPERATOR_NAME", "[Dein Name / Betreiber]"),
    "email": os.environ.get("SMPKIT_OPERATOR_EMAIL", "[deine-email@example.com]"),
    "address": os.environ.get("SMPKIT_OPERATOR_ADDRESS", "[Straße Nr., PLZ Ort]"),
}


class Handler(BaseHTTPRequestHandler):
    server_version = "SMPKitTrust/1.0"
    store: Store = None                  # von main() gesetzt
    licenses: "licensing.LicenseStore" = None
    admin_key: str = None                # optionaler Admin-Schlüssel
    license_required: bool = False       # Trust-API nur mit gültiger Lizenz?

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

    def _send_html(self, code, html):
        body = html.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _template(self, name, replacements):
        with open(os.path.join(WEB_DIR, name), encoding="utf-8") as fh:
            html = fh.read()
        for k, v in replacements.items():
            html = html.replace("{{" + k + "}}", v)
        return html

    def _presented_key(self):
        return (self.headers.get("X-Api-Key") or "").strip()

    def _auth_ok(self):
        """Darf dieser Request die Trust-API nutzen?"""
        key = self._presented_key()
        if self.admin_key and key == self.admin_key:
            return True
        if self.license_required:
            return self.licenses is not None and self.licenses.token_valid(key)
        # Ohne Lizenzpflicht: offen (Dev/Test). Admin-Key (falls gesetzt) wird oben geprüft.
        if self.admin_key:
            return key == self.admin_key
        return True

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

    def _verified_uuid(self):
        """Bei Lizenzpflicht: die an das Token gebundene (Mojang-verifizierte) UUID,
        damit niemand unter fremder UUID bewertet. Sonst None (Client-UUID gilt)."""
        if not self.license_required or self.licenses is None:
            return None
        return self.licenses.uuid_for_token(self._presented_key())

    # -- Routen --
    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)

        if u.path == "/api/health":
            return self._send(200, {"ok": True, "service": "smpkit-trust", "version": "1.0"})

        # --- Website / Shop (offen) ---
        if u.path in ("/", "/index.html"):
            return self._serve_landing()
        if u.path == "/success":
            return self._serve_success(q.get("session_id", [""])[0])
        if u.path == "/privacy":
            return self._send_html(200, self._template("privacy.html", {
                "OP_NAME": OPERATOR["name"], "OP_EMAIL": OPERATOR["email"],
                "OP_ADDRESS": OPERATOR["address"]}))
        if u.path == "/gdpr":
            return self._send_html(200, self._template("gdpr.html", {
                "OP_EMAIL": OPERATOR["email"]}))
        if u.path == "/manage":
            return self._send_html(200, self._template("manage.html", {
                "SUB": "1" if licensing.is_subscription() else "0"}))
        if u.path == "/api/gdpr/export":
            return self._gdpr_export((q.get("player", [""])[0]).strip())
        if u.path == "/api/license/verify":
            # Prüft ein laufendes Zugriffs-Token. Mit IP-Rate-Limit gegen Brute-Force.
            if not ip_rate_ok(self.client_address[0]):
                return self._send(429, {"error": "zu viele Versuche – bitte später erneut"})
            token = (q.get("token", [q.get("key", [""])[0]])[0]).strip()
            valid = self.licenses is not None and self.licenses.token_valid(token)
            return self._send(200, {"valid": valid})

        if u.path == "/api/auth/nonce":
            # serverId für die Mojang-Verifikation (kurzlebig, einmalig).
            return self._send(200, {"nonce": new_nonce(), "mojangAuth": mojang.MOJANG_AUTH})

        if not self._auth_ok():
            return self._send(401, {"error": "unauthorized", "needLicense": self.license_required})

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

        # --- Bezahl-/Lizenz-Routen (offen) ---
        if u.path == "/api/checkout":
            return self._handle_checkout()
        if u.path == "/api/stripe-webhook":
            return self._handle_webhook()
        if u.path == "/api/redeem":
            return self._handle_redeem()
        if u.path == "/api/gdpr/delete":
            return self._gdpr_delete()
        if u.path == "/api/portal":
            return self._handle_portal()

        if not self._auth_ok():
            return self._send(401, {"error": "unauthorized", "needLicense": self.license_required})
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

    # -- Website & Bezahlung --
    def _serve_landing(self):
        html = self._template("index.html", {
            "PRICE": licensing.price_display(),
            "REGULAR_PRICE": licensing.regular_price_display(),
            "SALE": "1" if licensing.on_sale() else "0",
            "SUB": "1" if licensing.is_subscription() else "0",
            "DEV": "1" if not licensing.stripe_enabled() else "0",
        })
        return self._send_html(200, html)

    def _handle_checkout(self):
        try:
            if licensing.stripe_enabled():
                session = licensing.create_checkout_session()
                return self._send(200, {"url": session["url"]})
            # Dev-Modus: simulierte Sitzung, direkt zur Erfolgsseite.
            import secrets as _s
            sid = "dev_" + _s.token_hex(8)
            return self._send(200, {"url": f"{licensing.PUBLIC_URL}/success?session_id={sid}"})
        except Exception as e:  # noqa: BLE001 – Fehler an den Client melden
            return self._send(502, {"error": f"checkout failed: {e}"})

    def _serve_success(self, session_id):
        session_id = (session_id or "").strip()
        if not session_id:
            return self._send_html(400, "<p>Fehlende Session.</p>")

        email = None
        paid = False
        sub_id = cust_id = None
        status = "active"
        period_end = None
        if session_id.startswith("dev_") and not licensing.stripe_enabled():
            paid = True                       # Dev-Modus: als bezahlt behandeln
            if licensing.is_subscription():
                period_end = time.time() + 100 * 365 * 86400   # Dev: quasi unbegrenzt aktiv
        else:
            try:
                session = licensing.retrieve_session(session_id)
                paid = licensing.session_is_paid(session)
                email = licensing.session_email(session)
                sub_id = session.get("subscription")
                cust_id = session.get("customer")
                if sub_id and licensing.is_subscription():
                    try:
                        sub = licensing.retrieve_subscription(sub_id)
                        status = sub.get("status", "active")
                        period_end = sub.get("current_period_end")
                    except Exception:         # noqa: BLE001
                        pass
            except Exception:                 # noqa: BLE001
                paid = False

        if not paid:
            return self._send_html(402, "<p>Zahlung nicht bestätigt. Bitte erneut versuchen.</p>")

        key = self.licenses.issue_for_session(session_id, email, sub_id, cust_id, status, period_end)
        html = self._template("success.html", {
            "KEY": key,
            "PUBLIC_URL": licensing.PUBLIC_URL,
        })
        return self._send_html(200, html)

    def _handle_redeem(self):
        # Brute-Force-Schutz: pro IP begrenzt.
        if not ip_rate_ok(self.client_address[0]):
            return self._send(429, {"error": "Zu viele Einlöse-Versuche – bitte später erneut."})
        data = self._read_json()
        if data is None:
            return self._send(400, {"error": "invalid json"})
        key = str(data.get("key", "")).strip()
        if not key:
            return self._send(400, {"error": "key erforderlich"})

        if mojang.MOJANG_AUTH:
            # Identität über Mojang beweisen – UUID kommt aus Mojangs Antwort.
            username = str(data.get("username", "")).strip()
            nonce = str(data.get("nonce", "")).strip()
            if not username or not nonce:
                return self._send(400, {"error": "username und nonce erforderlich"})
            if not consume_nonce(nonce):
                return self._send(400, {"error": "Nonce ungültig oder abgelaufen – bitte erneut."})
            profile = mojang.verify_join(username, nonce)
            if not profile:
                return self._send(401, {"error": "Mojang-Verifizierung fehlgeschlagen."})
            uuid = profile["uuid"]
        else:
            uuid = str(data.get("uuid", "")).strip()
            if not uuid:
                return self._send(400, {"error": "uuid erforderlich"})

        status, token = self.licenses.redeem(key, uuid)
        if status == "ok":
            return self._send(200, {"ok": True, "token": token})
        if status == "already_used":
            return self._send(409, {"error": "Dieser Schlüssel wurde bereits eingelöst."})
        return self._send(404, {"error": "Ungültiger Schlüssel."})

    def _handle_portal(self):
        """Erzeugt einen Stripe-Kundenportal-Link (Abo verwalten/kündigen).
        Der Kunde weist sich über seinen Schlüssel (SMPK-…) aus."""
        if not ip_rate_ok(self.client_address[0]):
            return self._send(429, {"error": "Zu viele Versuche – bitte später erneut."})
        data = self._read_json()
        if data is None:
            return self._send(400, {"error": "invalid json"})
        key = str(data.get("key", "")).strip()
        if not key:
            return self._send(400, {"error": "Schlüssel erforderlich."})
        if not licensing.is_subscription():
            return self._send(400, {"error": "Kein Abo – nichts zu verwalten."})
        customer = self.licenses.customer_for_key(key)
        if not licensing.stripe_enabled():
            return self._send(200, {"dev": True,
                                    "message": "Dev-Modus: hier ginge es zum Stripe-Kundenportal."})
        if not customer:
            return self._send(404, {"error": "Zu diesem Schlüssel wurde kein Abo gefunden."})
        try:
            sess = licensing.create_portal_session(customer, licensing.PUBLIC_URL + "/manage")
            return self._send(200, {"url": sess["url"]})
        except Exception as e:  # noqa: BLE001
            return self._send(502, {"error": f"Portal konnte nicht erstellt werden: {e}"})

    def _handle_webhook(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        payload = self.rfile.read(length) if length > 0 else b""
        sig = self.headers.get("Stripe-Signature", "")
        event = licensing.verify_webhook(payload, sig)
        if event is None:
            return self._send(400, {"error": "invalid signature"})

        et = event.get("type")
        obj = event.get("data", {}).get("object", {})

        if et == "checkout.session.completed":
            if licensing.session_is_paid(obj):
                self.licenses.issue_for_session(
                    obj.get("id"), licensing.session_email(obj),
                    obj.get("subscription"), obj.get("customer"), "active", None)
        elif et in ("customer.subscription.updated", "customer.subscription.created"):
            self.licenses.update_subscription(
                obj.get("id"), obj.get("status", "active"), obj.get("current_period_end"))
        elif et == "customer.subscription.deleted":
            self.licenses.update_subscription(
                obj.get("id"), "canceled", obj.get("current_period_end"))
        elif et == "invoice.payment_failed":
            if obj.get("subscription"):
                self.licenses.update_subscription(obj["subscription"], "past_due", None)

        return self._send(200, {"received": True})

    # -- DSGVO --
    def _gdpr_export(self, name):
        """Auskunft: welche Daten sind zu diesem Spieler gespeichert? (Art. 15 DSGVO)"""
        if not self._valid_name(name):
            return self._send(400, {"error": "gültigen Minecraft-Namen angeben (?player=Name)"})
        about = compute_trust(self.store, name)
        rb, vb = self.store.activity_counts(name)
        return self._send(200, {
            "player": name,
            "storedAboutYou": {
                "trust": about["trust"],
                "reportsAgainstYou": about["reports"],
                "vouchesForYou": about["vouches"],
                "flagged": about["flagged"],
                "categories": about["categories"],
            },
            "yourActivity": {"reportsYouMade": rb, "vouchesYouMade": vb},
            "note": "Die Identitäten anderer Melder werden zum Schutz Dritter nicht "
                    "offengelegt. Zur Löschung siehe /gdpr.",
        })

    def _gdpr_delete(self):
        """Löschung (Art. 17 DSGVO). Admin-geschützt: der Betreiber führt geprüfte
        Anfragen aus, damit niemand fremde (oder eigene belastende) Daten unbefugt löscht."""
        key = self._presented_key()
        if not self.admin_key or key != self.admin_key:
            return self._send(403, {"error": "Admin-Schlüssel erforderlich (SMPKIT_ADMIN_KEY)."})
        data = self._read_json()
        if data is None:
            return self._send(400, {"error": "invalid json"})
        player = str(data.get("player", "")).strip()
        uuid = str(data.get("uuid", "")).strip() or None
        email = str(data.get("email", "")).strip() or None
        if not player and not uuid and not email:
            return self._send(400, {"error": "player, uuid oder email angeben"})
        trust_deleted = self.store.delete_player_data(player, uuid)
        lic_deleted = self.licenses.delete_for(uuid, email)
        return self._send(200, {"ok": True, "deletedTrustRows": trust_deleted,
                                "deletedLicenses": lic_deleted})

    def _handle_report(self, d):
        ru = str(d.get("reporterUuid", "")).strip()
        verified = self._verified_uuid()
        if verified is not None:
            ru = verified                     # verifizierte Identität hat Vorrang
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
        cd = self._cooldown_remaining(self.store.last_report_time(ru, target))
        if cd is not None:
            return self._send(429, {"error": f"Du kannst {target} erst in ~{cd} Min erneut "
                                             f"bewerten.", "cooldown": True})
        self.store.add_report(ru, rn, target, category, note)
        return self._send(200, {"ok": True, "player": compute_trust(self.store, target)})

    @staticmethod
    def _cooldown_remaining(last_ts):
        """Restminuten der 5h-Sperre, oder None wenn erlaubt."""
        if last_ts is None:
            return None
        elapsed = time.time() - last_ts
        if elapsed >= RATING_COOLDOWN_S:
            return None
        return max(1, int((RATING_COOLDOWN_S - elapsed) / 60))

    def _handle_vouch(self, d):
        vu = str(d.get("voucherUuid", "")).strip()
        verified = self._verified_uuid()
        if verified is not None:
            vu = verified                     # verifizierte Identität hat Vorrang
        vn = str(d.get("voucher", "")).strip()
        target = str(d.get("target", "")).strip()
        if not vu or not self._valid_name(vn) or not self._valid_name(target):
            return self._send(400, {"error": "invalid voucher/target"})
        if vn.lower() == target.lower():
            return self._send(400, {"error": "cannot vouch yourself"})
        if not rate_ok(vu):
            return self._send(429, {"error": "rate limited"})
        cd = self._cooldown_remaining(self.store.last_vouch_time(vu, target))
        if cd is not None:
            return self._send(429, {"error": f"Du kannst {target} erst in ~{cd} Min erneut "
                                             f"bewerten.", "cooldown": True})
        self.store.add_vouch(vu, vn, target)
        return self._send(200, {"ok": True, "player": compute_trust(self.store, target)})

    def _handle_unreport(self, d):
        ru = str(d.get("reporterUuid", "")).strip()
        target = str(d.get("target", "")).strip()
        if not ru or not self._valid_name(target):
            return self._send(400, {"error": "invalid reporter/target"})
        removed = self.store.remove_report(ru, target)
        return self._send(200, {"ok": True, "removed": removed, "player": compute_trust(self.store, target)})


def _env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def main():
    ap = argparse.ArgumentParser(description="SMP-Kit Trust Backend")
    # Reihenfolge: CLI-Argument > Umgebungsvariable > Standard.
    ap.add_argument("--port", type=int, default=int(os.environ.get("SMPKIT_PORT", "8080")))
    ap.add_argument("--host", default=os.environ.get("SMPKIT_HOST", "0.0.0.0"))
    ap.add_argument("--db", default=os.environ.get("SMPKIT_DB", "trust.db"))
    ap.add_argument("--admin-key", default=os.environ.get("SMPKIT_ADMIN_KEY") or None,
                    help="optionaler Admin-Schlüssel (X-Api-Key)")
    ap.add_argument("--require-license", action="store_true",
                    default=_env_bool("SMPKIT_LICENSE_REQUIRED"),
                    help="Trust-API nur mit gültigem Lizenzschlüssel zugänglich")
    args = ap.parse_args()

    Handler.store = Store(args.db)
    Handler.licenses = licensing.LicenseStore(args.db)
    Handler.admin_key = args.admin_key
    Handler.license_required = args.require_license

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    mode = "Stripe" if licensing.stripe_enabled() else "DEV (simuliert)"
    print(f"SMP-Kit Backend auf http://{args.host}:{args.port}  "
          f"(db={args.db}, Lizenzpflicht={'an' if args.require_license else 'aus'}, "
          f"Bezahlung={mode}, Mojang-Auth={'an' if mojang.MOJANG_AUTH else 'aus'}, "
          f"Preis={licensing.price_display()})")
    print(f"  Shop:  {licensing.PUBLIC_URL}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nBeende ...")
        httpd.shutdown()


if __name__ == "__main__":
    main()
