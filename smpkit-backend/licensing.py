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

# Abrechnung: "subscription" (Abo, Standard) oder "onetime" (Einmalkauf).
BILLING_MODE = os.environ.get("SMPKIT_BILLING_MODE", "subscription").strip().lower()
INTERVAL = os.environ.get("SMPKIT_INTERVAL", "month").strip().lower()  # month | year

# Aktueller (berechneter) Preis und optionaler durchgestrichener Regulärpreis.
PRICE_CENTS = int(os.environ.get("SMPKIT_PRICE_CENTS", "199"))
REGULAR_PRICE_CENTS = int(os.environ.get("SMPKIT_REGULAR_PRICE_CENTS", "299"))
CURRENCY = os.environ.get("SMPKIT_CURRENCY", "eur")
PRODUCT_NAME = os.environ.get("SMPKIT_PRODUCT_NAME", "SMP-Kit Abo")

# Karenz nach Periodenende, um Webhook-Verzögerungen zu tolerieren.
GRACE_S = 3 * 86400

STRIPE_API = "https://api.stripe.com/v1"


def stripe_enabled() -> bool:
    return bool(STRIPE_SECRET_KEY)


def is_subscription() -> bool:
    return BILLING_MODE == "subscription"


def _fmt(cents: int) -> str:
    sym = {"eur": "€", "usd": "$", "gbp": "£"}.get(CURRENCY, "")
    return f"{cents / 100:.2f} {sym}".strip()


def price_display() -> str:
    return _fmt(PRICE_CENTS)


def regular_price_display() -> str:
    return _fmt(REGULAR_PRICE_CENTS)


def on_sale() -> bool:
    return REGULAR_PRICE_CENTS > PRICE_CENTS


def is_active(status: str | None, period_end) -> bool:
    """Ist ein Abo aktiv? Bei Einmalkauf immer aktiv (sofern eingelöst)."""
    if not is_subscription():
        return True
    if status not in ("active", "trialing"):
        return False
    if not period_end:
        return True
    return time.time() < float(period_end) + GRACE_S


# --- Lizenzspeicher ---------------------------------------------------------
class LicenseStore:
    """
    Ein Kauf erzeugt einen **einmaligen Einlöse-Schlüssel** (SMPK-…). Der Spieler
    löst ihn genau einmal ein (redeem); dabei wird er an dessen UUID gebunden und
    ist danach dauerhaft verbraucht. Für den laufenden Zugriff bekommt der Spieler
    ein persönliches **Token**, das die Mod bei jeder Anfrage mitschickt.
    """

    def __init__(self, path: str):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        with self.lock:
            self.db.execute(
                """
                CREATE TABLE IF NOT EXISTS licenses (
                    license_key        TEXT PRIMARY KEY,
                    email              TEXT,
                    session_id         TEXT UNIQUE,
                    created_at         REAL NOT NULL,
                    redeemed           INTEGER NOT NULL DEFAULT 0,
                    redeemed_by_uuid   TEXT,
                    redeemed_at        REAL,
                    token              TEXT,
                    subscription_id    TEXT,
                    customer_id        TEXT,
                    sub_status         TEXT,
                    current_period_end REAL
                )
                """
            )
            # Migration für ältere DBs: fehlende Spalten ergänzen.
            existing = {r["name"] for r in self.db.execute("PRAGMA table_info(licenses)")}
            for col, ddl in (("redeemed", "INTEGER NOT NULL DEFAULT 0"),
                             ("redeemed_by_uuid", "TEXT"),
                             ("redeemed_at", "REAL"),
                             ("token", "TEXT"),
                             ("subscription_id", "TEXT"),
                             ("customer_id", "TEXT"),
                             ("sub_status", "TEXT"),
                             ("current_period_end", "REAL")):
                if col not in existing:
                    self.db.execute(f"ALTER TABLE licenses ADD COLUMN {col} {ddl}")
            self.db.execute("CREATE INDEX IF NOT EXISTS idx_licenses_token ON licenses(token)")
            self.db.execute("CREATE INDEX IF NOT EXISTS idx_licenses_sub ON licenses(subscription_id)")
            self.db.commit()

    @staticmethod
    def _gen_key() -> str:
        # Kryptografisch sicher (secrets = CSPRNG). 16 Zeichen aus 31er-Alphabet
        # ~= 79 Bit Entropie -> praktisch nicht erratbar/vorhersagbar.
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # ohne 0/O/1/I
        groups = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(4)]
        return "SMPK-" + "-".join(groups)

    @staticmethod
    def _gen_token() -> str:
        # Persönliches Zugriffs-Token, ~256 Bit, URL-sicher.
        return "smpt_" + secrets.token_urlsafe(32)

    def issue_for_session(self, session_id: str, email: str | None,
                          subscription_id: str | None = None, customer_id: str | None = None,
                          status: str = "active", period_end=None) -> str:
        """Idempotent: dieselbe Zahlungs-Session ergibt immer denselben Schlüssel.
        Speichert Abo-Bezug (subscription/customer/status/period), falls vorhanden."""
        with self.lock:
            row = self.db.execute(
                "SELECT license_key FROM licenses WHERE session_id=?", (session_id,)
            ).fetchone()
            if row:
                return row["license_key"]
            key = self._gen_key()
            self.db.execute(
                "INSERT INTO licenses(license_key, email, session_id, created_at, "
                "subscription_id, customer_id, sub_status, current_period_end) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (key, email, session_id, time.time(),
                 subscription_id, customer_id, status, period_end),
            )
            self.db.commit()
            return key

    def update_subscription(self, subscription_id: str, status: str, period_end=None) -> int:
        """Aktualisiert Abo-Status (aus Webhooks). Rückgabe: betroffene Zeilen."""
        with self.lock:
            cur = self.db.execute(
                "UPDATE licenses SET sub_status=?, current_period_end=COALESCE(?, current_period_end) "
                "WHERE subscription_id=?",
                (status, period_end, subscription_id),
            )
            self.db.commit()
            return cur.rowcount

    def customer_for_key(self, key: str) -> str | None:
        """Stripe-customer_id zu einem Schlüssel (für das Kundenportal)."""
        key = (key or "").strip()
        with self.lock:
            row = self.db.execute(
                "SELECT customer_id FROM licenses WHERE license_key=?", (key,)
            ).fetchone()
            return row["customer_id"] if row and row["customer_id"] else None

    def redeem(self, key: str, uuid: str) -> tuple[str, str | None]:
        """Einmalige Einlösung. Rückgabe: (status, token).
        status ∈ {"ok", "not_found", "already_used"}."""
        key = (key or "").strip()
        if not key:
            return ("not_found", None)
        with self.lock:
            row = self.db.execute(
                "SELECT redeemed FROM licenses WHERE license_key=?", (key,)
            ).fetchone()
            if row is None:
                return ("not_found", None)
            if row["redeemed"] == 1:
                return ("already_used", None)
            token = self._gen_token()
            self.db.execute(
                "UPDATE licenses SET redeemed=1, redeemed_by_uuid=?, redeemed_at=?, token=? "
                "WHERE license_key=? AND redeemed=0",
                (uuid, time.time(), token, key),
            )
            self.db.commit()
            return ("ok", token)

    def token_valid(self, token: str) -> bool:
        """Prüft ein laufendes Zugriffs-Token (nach erfolgreicher Einlösung)."""
        return self.uuid_for_token(token) is not None

    def uuid_for_token(self, token: str) -> str | None:
        """Liefert die verifizierte UUID zu einem Token – aber nur, wenn das Abo
        aktuell aktiv ist (bei Einmalkauf immer). Sonst None."""
        token = (token or "").strip()
        if not token:
            return None
        with self.lock:
            row = self.db.execute(
                "SELECT redeemed_by_uuid, sub_status, current_period_end "
                "FROM licenses WHERE token=? AND redeemed=1", (token,)
            ).fetchone()
        if not row:
            return None
        if not is_active(row["sub_status"], row["current_period_end"]):
            return None
        return row["redeemed_by_uuid"]

    def delete_for(self, uuid: str | None = None, email: str | None = None) -> int:
        """Löscht Lizenz-/Kaufdaten zu einer UUID oder E-Mail (DSGVO-Löschung)."""
        n = 0
        with self.lock:
            if uuid:
                n += self.db.execute(
                    "DELETE FROM licenses WHERE redeemed_by_uuid=?", (uuid,)).rowcount
            if email:
                n += self.db.execute(
                    "DELETE FROM licenses WHERE email=?", (email,)).rowcount
            self.db.commit()
        return n

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
    """Legt eine Stripe-Checkout-Sitzung an und liefert {id, url}.
    Abo (subscription) oder Einmalkauf (payment) je nach BILLING_MODE."""
    params = {
        "success_url": f"{PUBLIC_URL}/success?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{PUBLIC_URL}/",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": CURRENCY,
        "line_items[0][price_data][unit_amount]": str(PRICE_CENTS),
        "line_items[0][price_data][product_data][name]": PRODUCT_NAME,
    }
    if is_subscription():
        params["mode"] = "subscription"
        params["line_items[0][price_data][recurring][interval]"] = INTERVAL
    else:
        params["mode"] = "payment"
    s = _stripe_request("POST", "/checkout/sessions", params)
    return {"id": s["id"], "url": s["url"]}


def retrieve_session(session_id: str) -> dict:
    return _stripe_request("GET", f"/checkout/sessions/{urllib.parse.quote(session_id)}")


def retrieve_subscription(sub_id: str) -> dict:
    return _stripe_request("GET", f"/subscriptions/{urllib.parse.quote(sub_id)}")


def create_portal_session(customer_id: str, return_url: str) -> dict:
    """Stripe-Kundenportal (Abo verwalten/kündigen). Portal muss im Stripe-Dashboard
    einmalig aktiviert sein."""
    params = {"customer": customer_id, "return_url": return_url}
    return _stripe_request("POST", "/billing_portal/sessions", params)


def session_is_paid(session: dict) -> bool:
    # Abo: initiale Rechnung bezahlt -> payment_status "paid"; Session "complete".
    return session.get("payment_status") == "paid" or session.get("status") == "complete"


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
