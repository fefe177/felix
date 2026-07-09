#!/usr/bin/env python3
"""
Unit-Tests der Trust-Berechnung (Zeitverfall + Melder-Reputation).
Braucht keinen laufenden Server – arbeitet direkt gegen die Store-/Compute-Logik.

    python3 test_algorithm.py
"""
import importlib.util
import os
import tempfile
import time

_spec = importlib.util.spec_from_file_location(
    "trust_server", os.path.join(os.path.dirname(__file__), "trust_server.py"))
ts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ts)


def fresh_store():
    path = tempfile.mktemp(suffix=".db")
    return ts.Store(path), path


def _insert_report(store, uuid, name, target, ts_val, cat="scam_tptrade"):
    store.db.execute("INSERT INTO reports VALUES(?,?,?,?,?,?)",
                     (uuid, name, target, cat, "", ts_val))
    store.db.commit()


def test_baseline():
    store, path = fresh_store()
    try:
        assert ts.compute_trust(store, "Nobody")["trust"] == 50          # neutral
        assert ts.compute_trust(store, "Nobody")["rated"] is False
        for i in range(6):
            _insert_report(store, f"u{i}", f"R{i}", "Bad", time.time())
        r = ts.compute_trust(store, "Bad")
        assert r["trust"] == 5 and r["flagged"] is True, r
        print("baseline .............. OK  (unbekannt=50%, 6 Reports=5% + flagged)")
    finally:
        os.remove(path)


def test_decay():
    store, path = fresh_store()
    try:
        now = time.time()
        _insert_report(store, "u1", "Fresh", "VFresh", now)
        _insert_report(store, "u2", "Old", "VOld", now - 90 * 86400)     # 2 Halbwertszeiten
        fresh = ts.compute_trust(store, "VFresh")
        old = ts.compute_trust(store, "VOld")
        assert abs(fresh["effReports"] - 1.0) < 0.01, fresh
        assert abs(old["effReports"] - 0.25) < 0.05, old
        assert old["trust"] > fresh["trust"], (old, fresh)
        print(f"decay ................. OK  (frisch eff=1.0 trust={fresh['trust']}, "
              f"90d eff={old['effReports']} trust={old['trust']})")
    finally:
        os.remove(path)


def test_credibility():
    store, path = fresh_store()
    try:
        now = time.time()
        # GoodGuy vertrauenswürdig (2 Vouches), BadGuy schlecht (6 Reports)
        store.add_vouch("gv1", "F1", "GoodGuy")
        store.add_vouch("gv2", "F2", "GoodGuy")
        for i in range(6):
            _insert_report(store, f"b{i}", f"X{i}", "BadGuy", now, "other")
        assert ts.credibility(store, "GoodGuy") == ts.CRED_MAX            # gekappt bei 1.4
        assert ts.credibility(store, "BadGuy") == ts.CRED_MIN             # gekappt bei 0.3
        assert ts.credibility(store, "Unknown") == 1.0                    # neutral

        _insert_report(store, "GoodGuy-id", "GoodGuy", "VictimB", now)
        _insert_report(store, "BadGuy-id", "BadGuy", "VictimA", now)
        va = ts.compute_trust(store, "VictimA")
        vb = ts.compute_trust(store, "VictimB")
        assert vb["trust"] < va["trust"], (va, vb)
        print(f"credibility ........... OK  (glaubwürdiger Melder wirkt stärker: "
              f"VictimB trust={vb['trust']} < VictimA trust={va['trust']})")
    finally:
        os.remove(path)


if __name__ == "__main__":
    test_baseline()
    test_decay()
    test_credibility()
    print("\nAlle Algorithmus-Tests bestanden.")
