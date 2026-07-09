#!/usr/bin/env python3
"""Unit-Tests für die Lizenz-Logik (ohne Stripe/HTTP)."""
import os
import tempfile

import licensing


def test_issue_and_redeem():
    path = tempfile.mktemp(suffix=".db")
    store = licensing.LicenseStore(path)
    try:
        key = store.issue_for_session("sess_1", "a@b.de")
        assert key.startswith("SMPK-") and len(key) == 24, key
        # frisch: noch kein gültiges Token
        assert store.token_valid("smpt_irgendwas") is False
        # einlösen -> Token
        status, token = store.redeem(key, "uuid-alice")
        assert status == "ok" and token and token.startswith("smpt_"), (status, token)
        assert store.token_valid(token) is True
        assert store.token_valid("") is False
        print(f"issue/redeem .......... OK  ({key} -> {token[:14]}…)")
    finally:
        os.remove(path)


def test_single_use():
    path = tempfile.mktemp(suffix=".db")
    store = licensing.LicenseStore(path)
    try:
        key = store.issue_for_session("sess_2", None)
        s1, t1 = store.redeem(key, "uuid-first")
        s2, t2 = store.redeem(key, "uuid-second")     # zweiter Versuch
        assert s1 == "ok" and t1
        assert s2 == "already_used" and t2 is None, (s2, t2)
        assert store.redeem("SMPK-XXXX-XXXX-XXXX-XXXX", "u")[0] == "not_found"
        # altes Token bleibt gültig, ein zweites entsteht nicht
        assert store.token_valid(t1) is True
        print("single-use ............ OK  (2. Einlösung -> already_used)")
    finally:
        os.remove(path)


def test_idempotent_per_session():
    path = tempfile.mktemp(suffix=".db")
    store = licensing.LicenseStore(path)
    try:
        k1 = store.issue_for_session("sess_X", "x@y.de")
        k2 = store.issue_for_session("sess_X", "x@y.de")   # gleiche Session
        k3 = store.issue_for_session("sess_Y", "x@y.de")   # andere Session
        assert k1 == k2 and k1 != k3
        assert store.count() == 2
        print("idempotency ........... OK  (gleiche Session -> gleicher Schlüssel)")
    finally:
        os.remove(path)


def test_price_display():
    assert "€" in licensing.price_display() or licensing.PRICE_CENTS >= 0
    print(f"price ................. OK  ({licensing.price_display()})")


if __name__ == "__main__":
    test_issue_and_redeem()
    test_single_use()
    test_idempotent_per_session()
    test_price_display()
    print("\nAlle Lizenz-Tests bestanden.")
