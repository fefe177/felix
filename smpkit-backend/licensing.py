"""
Lizenz- und Bezahlmodul für SMP-Kit.

- Verwaltet käufliche Lizenzschlüssel (SQLite).
- Erzeugt Stripe-Checkout-Sitzungen und prüft bezahlte Käufe – direkt über die
  Stripe-REST-API mit urllib (keine externe Abhängigkeit).
- Dev-Modus: ist kein STRIPE_SECRET_KEY gesetzt, wird der Kauf simuliert, damit
  sich der komplette Ablauf lokal testen lässt.

Ein Schlüssel = einmaliger Kauf = dauerhafter Zugang.
"""

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time
import urllib.parse
import urllib.request

# --- Konfiguration (per Umgebungsvariablen) ---------------------------------
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
PUBLIC_URL = os.environ.get("SMPKIT_PUBLIC_URL", "http://localhost:8080").rstrip("/")
PRICE_CENTS = int(os.environ.get("SMPKIT_PRICE_CENTS", "499"))
CURRENCY = os.environ.get("SMPKIT_CURRENCY", "eur")
PRODUCT_NAME = os.environ.get("SMPKIT_PRODUCT_NAME", "SMP-Kit Zugang (Lifetime)")

STRIPE_API = "https://api.stripe.com/v1"


def stripe_enabled() -> bool:
    return bool(STRIPE_SECRET_KEY)


def price_display() -> str:
    sym = {"eur": "€", "usd": "$", "gbp": "£"}.get(CURRENCY, "")
    return f"{PRICE_CENTS / 100:.2f} {sym}".strip()


# --- Lizenzspeicher ---------------------------------------------------------
class LicenseStore:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        with self.lock:
            self.db.execute(
                """
                CREATE TABLE IF NOT EXISTS licenses (
                    license_key TEXT PRIMARY KEY,
                    email       TEXT,
                    session_id  TEXT UNIQUE,
                    created_at  REAL NOT NULL,
                    active      INTEGER NOT NULL DEFAULT 1
                )
                """
            )
            self.db.commit()

    @staticmethod
    def _gen_key() -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # ohne 0/O/1/I
        groups = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(4)]
        return "SMPK-" + "-".join(groups)

    def issue_for_session(self, session_id: str, email: str | None) -> str:
        """Idempotent: dieselbe Session ergibt immer denselben Schlüssel."""
        with self.lock:
            row = self.db.execute(
                "SELECT license_key FROM licenses WHERE session_id=?", (session_id,)
            ).fetchone()
            if row:
                return row["license_key"]
            key = self._gen_key()
            self.db.execute(
                "INSERT INTO licenses(license_key, email, session_id, created_at, active) "
                "VALUES(?,?,?,?,1)",
                (key, email, session_id, time.time()),
            )
            self.db.commit()
            return key

    def is_valid(self, key: str) -> bool:
        if not key:
            return False
        with self.lock:
            row = self.db.execute(
                "SELECT active FROM licenses WHERE license_key=?", (key.strip(),)
            ).fetchone()
            return bool(row and row["active"] == 1)

    def count(self) -> int:
        with self.lock:
            return self.db.execute("SELECT COUNT(*) AS n FROM licenses").fetchone()["n"]


# --- Stripe-Helfer (urllib) -------------------------------------------------
def _stripe_request(method: str, path: str, params: dict | None = None) -> dict:
    url = f"{STRIPE_API}{path}"
    data = None
    if params is not None:
        data = urllib.parse.urlencode(params, doseq=True).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {STRIPE_SECRET_KEY}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def create_checkout_session() -> dict:
    """Legt eine Stripe-Checkout-Sitzung an und liefert {id, url}."""
    params = {
        "mode": "payment",
        "success_url": f"{PUBLIC_URL}/success?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{PUBLIC_URL}/",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": CURRENCY,
        "line_items[0][price_data][unit_amount]": str(PRICE_CENTS),
        "line_items[0][price_data][product_data][name]": PRODUCT_NAME,
    }
    s = _stripe_request("POST", "/checkout/sessions", params)
    return {"id": s["id"], "url": s["url"]}


def retrieve_session(session_id: str) -> dict:
    return _stripe_request("GET", f"/checkout/sessions/{urllib.parse.quote(session_id)}")


def session_is_paid(session: dict) -> bool:
    return session.get("payment_status") == "paid"


def session_email(session: dict) -> str | None:
    cd = session.get("customer_details") or {}
    return cd.get("email")


# --- Webhook-Signaturprüfung ------------------------------------------------
def verify_webhook(payload: bytes, sig_header: str, tolerance: int = 300) -> dict | None:
    """Prüft die Stripe-Signatur (t=…,v1=…) und gibt das Event-JSON zurück
    oder None bei ungültiger/abgelaufener Signatur."""
    if not STRIPE_WEBHOOK_SECRET or not sig_header:
        return None
    parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
    ts = parts.get("t")
    v1 = parts.get("v1")
    if not ts or not v1:
        return None
    if abs(time.time() - int(ts)) > tolerance:
        return None
    signed = f"{ts}.".encode("utf-8") + payload
    expected = hmac.new(STRIPE_WEBHOOK_SECRET.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, v1):
        return None
    try:
        return json.loads(payload.decode("utf-8"))
    except ValueError:
        return None
