/* Schleifental GP - der Geist des besten Laufs.
 *
 * Waehrend der Fahrt werden alle 80 ms sechs Zahlen mitgeschrieben: Zeit,
 * Bogenlaenge, Querversatz, Kurswinkel, Sprunghoehe, Schraegstand. Wird die
 * Bestzeit unterboten, landet die Aufzeichnung im localStorage. Beim naechsten
 * Lauf faehrt sie als halbdurchsichtiges Kart mit, und aus dem Vergleich
 * "wann war der Geist hier" ergibt sich der Zeitabstand.
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};

  var TAKT = 0.08;                 // Abstand zweier Aufzeichnungspunkte
  var FELDER = 6;

  function neu() { return { werte: [], letzte: -1 }; }

  function schreiben(rec, t, k) {
    if (t - rec.letzte < TAKT) return;
    rec.letzte = t;
    rec.werte.push(
      Math.round(t * 100) / 100, Math.round(k.s * 100) / 100,
      Math.round(k.x * 100) / 100, Math.round(k.phi * 1000) / 1000,
      Math.round(k.h * 100) / 100, Math.round(k.slip * 1000) / 1000);
  }

  function packen(rec) { return rec.werte.join(','); }

  function entpacken(text) {
    if (!text) return null;
    var roh = text.split(',');
    if (roh.length < FELDER * 4) return null;
    var w = new Float32Array(roh.length);
    for (var i = 0; i < roh.length; i++) {
      w[i] = parseFloat(roh[i]);
      if (!isFinite(w[i])) return null;
    }
    return { w: w, n: Math.floor(roh.length / FELDER), cursor: 0, sCursor: 0 };
  }

  /* Zustand des Geistes zur Zeit t (zwischen den Stuetzstellen interpoliert) */
  function beiZeit(g, t, out) {
    out = out || { s: 0, x: 0, phi: 0, h: 0, slip: 0, fertig: false };
    var n = g.n, w = g.w;
    if (!n) return out;
    var i = g.cursor;
    while (i + 1 < n && w[(i + 1) * FELDER] <= t) i++;
    while (i > 0 && w[i * FELDER] > t) i--;
    g.cursor = i;
    var j = Math.min(n - 1, i + 1);
    var t0 = w[i * FELDER], t1 = w[j * FELDER];
    var f = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
    function lerp(k2) { return w[i * FELDER + k2] + (w[j * FELDER + k2] - w[i * FELDER + k2]) * f; }
    out.s = lerp(1); out.x = lerp(2); out.phi = lerp(3); out.h = lerp(4); out.slip = lerp(5);
    out.fertig = t >= w[(n - 1) * FELDER];
    return out;
  }

  /* Wann war der Geist an der Stelle s? Grundlage des Zeitabstands. */
  function zeitBei(g, s) {
    var n = g.n, w = g.w;
    if (!n) return null;
    var i = g.sCursor;
    while (i + 1 < n && w[(i + 1) * FELDER + 1] <= s) i++;
    while (i > 0 && w[i * FELDER + 1] > s) i--;
    g.sCursor = i;
    var j = Math.min(n - 1, i + 1);
    var s0 = w[i * FELDER + 1], s1 = w[j * FELDER + 1];
    var f = s1 > s0 ? Math.max(0, Math.min(1, (s - s0) / (s1 - s0))) : 0;
    return w[i * FELDER] + (w[j * FELDER] - w[i * FELDER]) * f;
  }

  MK.ghost = { neu: neu, schreiben: schreiben, packen: packen, entpacken: entpacken,
               beiZeit: beiZeit, zeitBei: zeitBei, TAKT: TAKT };
})(typeof window !== 'undefined' ? window : global);
