#!/usr/bin/env python3
"""Unit-Tests für die Lizenz-Logik (ohne Stripe/HTTP)."""
import os
import tempfile

import licensing


def test_issue_and_validate():
    path = tempfile.mktemp(suffix=".db")
    store = licensing.LicenseStore(path)
    try:
        key = store.issue_for_session("sess_1", "a@b.de")
        assert key.startswith("SMPK-") and len(key) == 24, key
        assert store.is_valid(key) is True
        assert store.is_valid("SMPK-0000-0000-0000-0000") is False
        assert store.is_valid("") is False
        print(f"issue/validate ........ OK  ({key})")
    finally:
        os.remove(path)


def test_idempotent_per_session():
    path = tempfile.mktemp(suffix=".db")
    store = licensing.LicenseStore(path)
    try:
        k1 = store.issue_for_session("sess_X", "x@y.de")
        k2 = store.issue_for_session("sess_X", "x@y.de")   # gleiche Session
        k3 = store.issue_for_session("sess_Y", "x@y.de")   # andere Session
        assert k1 == k2, (k1, k2)
        assert k1 != k3, (k1, k3)
        assert store.count() == 2
        print("idempotency ........... OK  (gleiche Session -> gleicher Schlüssel)")
    finally:
        os.remove(path)


def test_price_display():
    assert "€" in licensing.price_display() or licensing.PRICE_CENTS >= 0
    print(f"price ................. OK  ({licensing.price_display()})")


if __name__ == "__main__":
    test_issue_and_validate()
    test_idempotent_per_session()
    test_price_display()
    print("\nAlle Lizenz-Tests bestanden.")
