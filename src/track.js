/* Schleifental GP - Streckengeometrie.
 *
 * Eine geschlossene Spline bildet die Basisrunde (Kurven + Huegel). In sie
 * werden analytisch eingesetzt:
 *   - zwei senkrechte Loopings in Tropfenform (Klothoide wie bei Achterbahnen,
 *     unten weit, oben eng) mit leichtem Seitenversatz, damit auf- und
 *     absteigender Ast aneinander vorbeilaufen statt sich zu schneiden,
 *   - ein Korkenzieher (volle Rolle um die Fahrtrichtung),
 *   - Sprunghuegel.
 * Ergebnis ist ein Ring aus "Frames" (Position, Tangente, Up, Seite, Breite).
 * Mesh, Fahrphysik, Kamera und Minimap arbeiten nur noch auf diesen Frames.
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};
  var T = root.THREE;
  var V3 = T.Vector3;

  var ROAD_HALF = 8.0;    // halbe Fahrbahnbreite
  var LOOP_HALF = 0.62;   // Fahrbahn im Looping schmaler
  var STEP = 1.8;         // Abstand zweier Frames in Metern
  var UP = new V3(0, 1, 0);

  var RX = 300, RZ = 210;

  /* Basisrunde: [Winkel Grad, Radiusfaktor, Hoehe] */
  var RING = [
    [  0, 1.00,  0],   // Start / Ziel
    [ 22, 1.05,  0],
    [ 45, 1.02,  0],
    [ 70, 0.93, 10],
    [ 95, 1.12, 24],
    [120, 0.95, 30],   // Bergkuppe
    [145, 1.05, 20],
    [170, 1.00, 14],
    [195, 1.06,  3],
    [212, 0.70,  6],   // enge Kehre
    [228, 0.62, 10],
    [244, 0.78,  8],
    [262, 1.05, 14],
    [285, 1.10, 22],
    [310, 0.95, 14],
    [335, 1.05,  4]
  ];

  /* Loopings: u = Startpunkt auf der Basisrunde (0..1), hgt = Scheitelhoehe,
   * c = Tropfenform (0 = Kreis), pf = Vorneigung, lat = Seitenversatz. */
  var LOOPS = [
    { u: 0.060, hgt: 46, c: 0.50, pf: 0.30, lat:  9 },
    { u: 0.545, hgt: 40, c: 0.50, pf: 0.30, lat: -9 }
  ];
  /* Korkenzieher */
  var TWISTS = [{ u: 0.395, len: 135, turns: 1 }];
  /* Sprunghuegel: u, Laenge, Hoehe */
  var BUMPS = [
    { u: 0.255, len: 40, hgt: 3.4 },
    { u: 0.735, len: 34, hgt: 2.8 },
    { u: 0.930, len: 30, hgt: 2.2 }
  ];
  /* Turbofelder (Anteil der Gesamtlaenge) */
  var PADS = [0.021, 0.300, 0.487, 0.660, 0.905];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function smoother(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }

  /* v um die normierte Achse a drehen (Rodrigues). */
  function rotAxis(v, a, w) {
    var c = Math.cos(w), s = Math.sin(w);
    var cr = new V3().crossVectors(a, v), d = a.dot(v);
    return new V3(
      v.x * c + cr.x * s + a.x * d * (1 - c),
      v.y * c + cr.y * s + a.y * d * (1 - c),
      v.z * c + cr.z * s + a.z * d * (1 - c));
  }

  /* Loopingform in lokalen Koordinaten: vorwaerts / hoch / seitlich. */
  function loopShape(spec, seg) {
    var STEPS = 1200, dx = 1 / STEPS, i, x, g, phi;
    var fx = 0, hy = 0, hmax = 0;
    for (i = 0; i <= STEPS; i++) {         // Einheitsform vermessen
      x = i * dx;
      g = x - (spec.c / (2 * Math.PI)) * Math.sin(2 * Math.PI * x);
      phi = 2 * Math.PI * g;
      hy += Math.sin(phi) * dx;
      if (hy > hmax) hmax = hy;
    }
    var S = spec.hgt / hmax, P = spec.pf * S;
    var pts = [];
    fx = 0; hy = 0;
    for (i = 0; i <= STEPS; i++) {
      x = i * dx;
      g = x - (spec.c / (2 * Math.PI)) * Math.sin(2 * Math.PI * x);
      phi = 2 * Math.PI * g;
      var win = smoother(Math.min(x, 1 - x) / 0.16);
      pts.push({ f: fx * S + P * x, h: hy * S,
                 l: spec.lat * Math.sin(2 * Math.PI * x) * win, phi: phi });
      fx += Math.cos(phi) * dx; hy += Math.sin(phi) * dx;
    }
    var arc = 0;
    for (i = 1; i <= STEPS; i++) {
      arc += Math.sqrt(Math.pow(pts[i].f - pts[i-1].f, 2) +
                       Math.pow(pts[i].h - pts[i-1].h, 2) +
                       Math.pow(pts[i].l - pts[i-1].l, 2));
    }
    /* gleichmaessig nach Bogenlaenge neu abtasten */
    var M = Math.max(32, Math.round(arc / (seg * 0.55)));   // Loopings feiner abtasten
    var out = [], acc = 0, k = 0;
    for (var j = 0; j < M; j++) {
      var want = arc * j / M;
      while (k < STEPS && acc < want) {
        acc += Math.sqrt(Math.pow(pts[k+1].f - pts[k].f, 2) +
                         Math.pow(pts[k+1].h - pts[k].h, 2) +
                         Math.pow(pts[k+1].l - pts[k].l, 2));
        k++;
      }
      out.push(pts[k]);
    }
    return { pts: out, advance: pts[STEPS].f, arc: arc };
  }

  function build() {
    var i, j;
    var pts3 = RING.map(function (r) {
      var a = r[0] * Math.PI / 180;
      return new V3(RX * r[1] * Math.cos(a), r[2], RZ * r[1] * Math.sin(a));
    });
    var curve = new T.CatmullRomCurve3(pts3, true, 'centripetal', 0.5);
    var baseLen = curve.getLength();
    var N = Math.max(64, Math.round(baseLen / STEP));
    var seg = baseLen / N;
    var pos = curve.getSpacedPoints(N).slice(0, N);

    /* Sprunghuegel aufaddieren */
    BUMPS.forEach(function (b) {
      var i0 = Math.round(b.u * N), n = Math.max(2, Math.round(b.len / seg));
      for (var k = 0; k <= n; k++) {
        var s = Math.sin(Math.PI * k / n);
        pos[(i0 + k) % N].y += b.hgt * s * s;
      }
    });

    var tan = [];
    for (i = 0; i < N; i++) {
      tan.push(new V3().subVectors(pos[(i + 1) % N], pos[(i + N - 1) % N]).normalize());
    }

    /* Ueberhoehung aus der horizontalen Kruemmung, anschliessend geglaettet */
    var yaw = new Float32Array(N), bank = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var t0 = tan[(i + N - 1) % N], t1 = tan[(i + 1) % N];
      yaw[i] = Math.atan2(new V3().crossVectors(t0, t1).dot(UP), t0.dot(t1)) / (2 * seg);
      bank[i] = -Math.atan(yaw[i] * 34 * 34 / 20) * 0.62;
    }
    var W = 16, sm = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var acc = 0;
      for (j = -W; j <= W; j++) acc += bank[(i + j + N * 2) % N];
      sm[i] = clamp(acc / (2 * W + 1), -0.42, 0.42);
    }
    bank = sm;

    /* Korkenzieher als zusaetzliche Rolle */
    TWISTS.forEach(function (tw) {
      var i0 = Math.round(tw.u * N), n = Math.max(4, Math.round(tw.len / seg));
      for (var k = 0; k <= n; k++) {
        bank[(i0 + k) % N] += smoother(k / n) * Math.PI * 2 * tw.turns;
      }
    });

    var up = [];
    for (i = 0; i < N; i++) {
      var side = new V3().crossVectors(tan[i], UP).normalize();
      up.push(rotAxis(new V3().crossVectors(side, tan[i]).normalize(), tan[i], bank[i]));
    }
    var wid = [];
    for (i = 0; i < N; i++) wid.push(1);

    /* Basiswerte an beliebiger Bogenlaenge (linear interpoliert) */
    function baseAt(s) {
      var t = s / seg, k0 = Math.floor(t), fr = t - k0;
      var a = ((k0 % N) + N) % N, b = (a + 1) % N;
      return {
        p: new V3().lerpVectors(pos[a], pos[b], fr),
        t: new V3().lerpVectors(tan[a], tan[b], fr).normalize(),
        u: new V3().lerpVectors(up[a], up[b], fr).normalize()
      };
    }

    /* Loopings einsetzen - von hinten nach vorn, damit Indizes gueltig bleiben */
    var order = LOOPS.slice().sort(function (a, b) { return b.u - a.u; });
    var loopInfo = [];
    order.forEach(function (spec) {
      var sh = loopShape(spec, seg);
      var i0 = Math.round(spec.u * N), s0 = i0 * seg;
      var span = Math.max(2, Math.round(sh.advance / seg));
      var lp = [], lu = [], lw = [];
      sh.pts.forEach(function (q, k) {
        var b = baseAt(s0 + q.f);
        var side = new V3().crossVectors(b.t, b.u).normalize();
        lp.push(new V3(
          b.p.x + b.u.x * q.h + side.x * q.l,
          b.p.y + b.u.y * q.h + side.y * q.l,
          b.p.z + b.u.z * q.h + side.z * q.l));
        var st = Math.sin(q.phi), ct = Math.cos(q.phi);
        lu.push(new V3(b.u.x * ct - b.t.x * st,
                       b.u.y * ct - b.t.y * st,
                       b.u.z * ct - b.t.z * st).normalize());
        var edge = smoother(Math.min(k, sh.pts.length - k) / (sh.pts.length * 0.14));
        lw.push(1 + (LOOP_HALF - 1) * edge);
      });
      pos = pos.slice(0, i0).concat(lp, pos.slice(i0 + span));
      up = up.slice(0, i0).concat(lu, up.slice(i0 + span));
      wid = wid.slice(0, i0).concat(lw, wid.slice(i0 + span));
      loopInfo.push({ from: i0, count: lp.length });
    });

    /* Finaler Frame-Ring */
    var n2 = pos.length, frames = [];
    for (i = 0; i < n2; i++) {
      var tg = new V3().subVectors(pos[(i + 1) % n2], pos[(i + n2 - 1) % n2]).normalize();
      var u = up[i].clone();
      u.addScaledVector(tg, -u.dot(tg)).normalize();
      frames.push({ p: pos[i], t: tg, u: u,
                    r: new V3().crossVectors(tg, u).normalize(),
                    w: wid[i], d: 0, yaw: 0, vk: 0 });
    }
    var total = 0;
    for (i = 0; i < n2; i++) {
      frames[i].d = total;
      total += frames[i].p.distanceTo(frames[(i + 1) % n2].p);
    }
    for (i = 0; i < n2; i++) {
      var a2 = frames[(i + n2 - 1) % n2], b2 = frames[i], c2 = frames[(i + 1) % n2];
      var ds = a2.p.distanceTo(b2.p) + b2.p.distanceTo(c2.p);
      b2.yaw = Math.atan2(new V3().crossVectors(a2.t, c2.t).dot(b2.u), a2.t.dot(c2.t)) / ds;
      b2.vk = new V3().subVectors(c2.t, a2.t).dot(b2.u) / ds;   // Vertikalkruemmung
    }

    return {
      frames: frames, length: total, count: n2, roadHalf: ROAD_HALF,
      pads: PADS.map(function (u) { return u * total; }),
      loops: loopInfo, baseCurve: curve
    };
  }

  /* Interpolierter Frame an der Streckenposition s (Meter, zyklisch). */
  function frameAt(track, s, out) {
    var L = track.length, F = track.frames, n = track.count;
    s = s % L; if (s < 0) s += L;
    var lo = 0, hi = n - 1, mid;
    while (lo < hi) { mid = (lo + hi + 1) >> 1; if (F[mid].d <= s) lo = mid; else hi = mid - 1; }
    var a = F[lo], b = F[(lo + 1) % n];
    var span = (lo + 1 < n ? b.d : L) - a.d;
    var f = span > 1e-6 ? (s - a.d) / span : 0;
    out = out || { p: new V3(), t: new V3(), u: new V3(), r: new V3() };
    out.p.lerpVectors(a.p, b.p, f);
    out.t.lerpVectors(a.t, b.t, f).normalize();
    out.u.lerpVectors(a.u, b.u, f).normalize();
    out.r.crossVectors(out.t, out.u).normalize();
    out.yaw = a.yaw + (b.yaw - a.yaw) * f;
    out.vk = a.vk + (b.vk - a.vk) * f;
    out.w = a.w + (b.w - a.w) * f;
    out.half = track.roadHalf * out.w;
    out.index = lo;
    return out;
  }

  MK.track = { build: build, frameAt: frameAt, STEP: STEP, UP: UP,
               rotAxis: rotAxis, clamp: clamp, smoother: smoother, ROAD_HALF: ROAD_HALF };
})(typeof window !== 'undefined' ? window : global);
