/* Schleifental GP - Streckengeometrie.
 *
 * Die Strecke ist keine Runde, sondern eine Abfahrt: vom Gipfel auf 210 Metern
 * bis ins Tal, mit Anfang und Ende. Grundlage ist eine offene Catmull-Rom-
 * Spline durch Kontrollpunkte; in sie werden analytisch eingesetzt:
 *   - Loopings in Tropfenform (Klothoide wie bei Achterbahnen, unten weit,
 *     oben eng) mit leichtem Seitenversatz, damit auf- und absteigender Ast
 *     aneinander vorbeilaufen statt sich zu schneiden,
 *   - ein Korkenzieher (volle Rolle um die Fahrtrichtung),
 *   - Wandritte (die Fahrbahn kippt bis fast senkrecht),
 *   - Sprunghuegel und eine Schlucht ohne Fahrbahn.
 * Der Spiralturm steckt direkt in den Kontrollpunkten - auf einer Abfahrt darf
 * sich die Bahn ueber sich selbst hinweg schrauben, weil sie dabei faellt.
 *
 * Ergebnis ist eine Kette aus "Frames": Position, Tangente, Up, Seite, Breite,
 * Bogenlaenge. Mesh, Fahrphysik, Kamera und Minimap arbeiten nur damit.
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};
  var T = root.THREE;
  var V3 = T.Vector3;

  var ROAD_HALF = 8.0;    // halbe Fahrbahnbreite
  var LOOP_HALF = 0.62;   // im Looping schmaler
  var STEP = 1.8;         // Abstand zweier Frames in Metern
  var UP = new V3(0, 1, 0);

  /* Kontrollpunkte der Abfahrt: [x, y, z]  (y = Hoehe) */
  var COURSE = [
    [   0, 210,    0],   // Startrampe auf dem Gipfel
    [ 110, 206,   10],
    [ 230, 190,   40],   // Steilabfahrt
    [ 330, 168,  120],
    [ 400, 150,  230],
    [ 430, 136,  350],   // lange Gerade: Korkenzieher
    [ 470, 124,  460],
    [ 560, 116,  540],
    [ 680, 112,  560],   // flach: erster Looping
    [ 800, 108,  520],
    [ 890, 102,  430],
    [ 930,  96,  320],   // Anlauf
    [ 950,  92,  210],   // Schlucht
    [ 960,  88,  100],
    [ 940,  80,  -20],   // Wandritt am Felsen
    [ 880,  72, -130],
    [ 790,  66, -200],   // flach: zweiter Looping
    [ 680,  62, -230],
    [ 570,  56, -210],
    [ 480,  50, -215],   // Spiralturm, eine Umdrehung abwaerts
    [ 390,  42, -160],
    [ 385,  34,  -60],
    [ 450,  26,   -5],
    [ 545,  18,  -30],
    [ 575,  12, -110],
    [ 520,   6, -190],   // Auslauf
    [ 400,   2, -240],
    [ 270,   0, -250],
    [ 150,   0, -240]    // Ziel
  ];

  /* Alle Positionen als Anteil der Streckenlaenge (0 = Start, 1 = Ziel). */
  var LOOPS = [
    { u: 0.360, hgt: 44, c: 0.50, pf: 0.30, lat:  9 },
    { u: 0.660, hgt: 38, c: 0.50, pf: 0.30, lat: -9 }
  ];
  var TWISTS = [{ u: 0.185, len: 130, turns: 1 }];        // Korkenzieher
  var BANKS  = [{ u: 0.530, len: 215, angle: 82 }];       // Wandritt
  var BUMPS  = [
    { u: 0.128, len: 34, hgt: 2.6 },
    { u: 0.790, len: 30, hgt: 2.4 }
  ];
  /* Schlucht: ohne Fahrbahn. vRef ist das Tempo, fuer das die Bahn dort eine
     Wurfparabel beschreibt - wer schneller ist, fliegt darueber hinweg, wer
     langsamer ist, faellt hinein. */
  var GAPS   = [{ u: 0.487, len: 34, vRef: 33 }];
  var PADS   = [0.030, 0.230, 0.330, 0.455, 0.620, 0.760, 0.880];

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
    for (i = 0; i <= STEPS; i++) {
      x = i * dx;
      g = x - (spec.c / (2 * Math.PI)) * Math.sin(2 * Math.PI * x);
      hy += Math.sin(2 * Math.PI * g) * dx;
      if (hy > hmax) hmax = hy;
    }
    var S = spec.hgt / hmax, P = spec.pf * S, pts = [];
    fx = 0; hy = 0;
    for (i = 0; i <= STEPS; i++) {
      x = i * dx;
      g = x - (spec.c / (2 * Math.PI)) * Math.sin(2 * Math.PI * x);
      phi = 2 * Math.PI * g;
      pts.push({ f: fx * S + P * x, h: hy * S, phi: phi,
                 l: spec.lat * Math.sin(2 * Math.PI * x) * smoother(Math.min(x, 1 - x) / 0.16) });
      fx += Math.cos(phi) * dx; hy += Math.sin(phi) * dx;
    }
    var arc = 0;
    for (i = 1; i <= STEPS; i++) {
      arc += Math.sqrt(Math.pow(pts[i].f - pts[i-1].f, 2) +
                       Math.pow(pts[i].h - pts[i-1].h, 2) +
                       Math.pow(pts[i].l - pts[i-1].l, 2));
    }
    var M = Math.max(32, Math.round(arc / (seg * 0.55))), out = [], acc = 0, k = 0;
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
    var i, j, k;
    var pts3 = COURSE.map(function (p) { return new V3(p[0], p[1], p[2]); });
    var curve = new T.CatmullRomCurve3(pts3, false, 'centripetal', 0.5);
    var baseLen = curve.getLength();
    var N = Math.max(64, Math.round(baseLen / STEP));
    var seg = baseLen / N;
    var pos = curve.getSpacedPoints(N);            // N+1 Punkte, Anfang und Ende
    var at = function (u) { return clamp(Math.round(u * N), 0, N); };

    /* Sprunghuegel aufaddieren */
    BUMPS.forEach(function (b) {
      var i0 = at(b.u), n = Math.max(2, Math.round(b.len / seg));
      for (var m = 0; m <= n; m++) {
        var idx = i0 + m;
        if (idx > N) break;
        var s = Math.sin(Math.PI * m / n);
        pos[idx].y += b.hgt * s * s;
      }
    });

    /* Schlucht mit Schanze. Ueber der Luecke folgt die Bahn einer Wurfparabel
       mit konstanter Abwaertskruemmung G/vRef^2: ein Kart mit genau vRef fliegt
       ihr entlang, ein langsameres sackt darunter weg und stuerzt ab.
       Die Parabel beginnt mit der Steigung S = K*len/2; die Fahrbahn davor
       nimmt diese Neigung ueber eine Rampe an, dahinter faengt eine Landerampe
       sie wieder ab - sonst gaebe es an der Absprungkante einen Knick, der das
       Kart nach unten druecken wuerde. */
    var RAMP = 30;                                    // Laenge der Rampen
    GAPS.forEach(function (g) {
      var i0 = at(g.u), n = Math.max(2, Math.round(g.len / seg));
      var K = 20 / (g.vRef * g.vRef);                 // 20 = Schwerkraft im Fahrmodell
      var S = 0.5 * K * g.len, nr = Math.max(2, Math.round(RAMP / seg)), m, idx, tt;
      for (m = 1; m < nr; m++) {                      // Anfahrtrampe (endet vor i0)
        idx = i0 - nr + m;
        if (idx < 0) continue;
        tt = m / nr;
        pos[idx].y += S * RAMP * (tt * tt * tt - 0.5 * tt * tt * tt * tt);
      }
      var lift = S * RAMP * 0.5;                      // Hoehe am Absprung
      for (m = 0; m <= n && i0 + m <= N; m++) {       // Flugbahn
        var x = m * seg;
        pos[i0 + m].y += lift + 0.5 * K * x * (g.len - x);
      }
      for (m = 1; m <= nr; m++) {                     // Landerampe
        idx = i0 + n + m;
        if (idx > N) break;
        tt = 1 - m / nr;
        pos[idx].y += S * RAMP * (tt * tt * tt - 0.5 * tt * tt * tt * tt);
      }
    });

    /* Tangenten (an den Enden einseitige Differenz) */
    var tan = [];
    for (i = 0; i <= N; i++) {
      var a = pos[Math.max(0, i - 1)], b = pos[Math.min(N, i + 1)];
      tan.push(new V3().subVectors(b, a).normalize());
    }

    /* Ueberhoehung aus der horizontalen Kruemmung, danach geglaettet */
    var bank = new Float32Array(N + 1);
    for (i = 0; i <= N; i++) {
      var t0 = tan[Math.max(0, i - 1)], t1 = tan[Math.min(N, i + 1)];
      var yaw = Math.atan2(new V3().crossVectors(t0, t1).dot(UP), t0.dot(t1)) / (2 * seg);
      bank[i] = -Math.atan(yaw * 34 * 34 / 20) * 0.62;
    }
    var W = 16, sm = new Float32Array(N + 1);
    for (i = 0; i <= N; i++) {
      var acc = 0, cnt = 0;
      for (j = -W; j <= W; j++) {
        var q = clamp(i + j, 0, N);
        acc += bank[q]; cnt++;
      }
      sm[i] = clamp(acc / cnt, -0.42, 0.42);
    }
    bank = sm;

    /* Korkenzieher: volle Rolle. Wandritt: kippen und wieder zurueck. */
    TWISTS.forEach(function (tw) {
      var i0 = at(tw.u), n = Math.max(4, Math.round(tw.len / seg));
      for (var m = 0; m <= n && i0 + m <= N; m++) {
        bank[i0 + m] += smoother(m / n) * Math.PI * 2 * tw.turns;
      }
    });
    BANKS.forEach(function (bk) {
      var i0 = at(bk.u), n = Math.max(4, Math.round(bk.len / seg));
      var rad = bk.angle * Math.PI / 180;
      for (var m = 0; m <= n && i0 + m <= N; m++) {
        var t = m / n;
        bank[i0 + m] += rad * (t < 0.5 ? smoother(t / 0.35) : smoother((1 - t) / 0.35));
      }
    });

    var up = [];
    for (i = 0; i <= N; i++) {
      var side = new V3().crossVectors(tan[i], UP).normalize();
      up.push(rotAxis(new V3().crossVectors(side, tan[i]).normalize(), tan[i], bank[i]));
    }
    var wid = [], gp = [];
    for (i = 0; i <= N; i++) { wid.push(1); gp.push(0); }
    GAPS.forEach(function (g) {
      var i0 = at(g.u), n = Math.max(2, Math.round(g.len / seg));
      for (var m = 0; m <= n && i0 + m <= N; m++) gp[i0 + m] = 1;
    });

    function baseAt(s) {
      var t = clamp(s / seg, 0, N), k0 = Math.floor(t), fr = t - k0;
      var a2 = k0, b2 = Math.min(N, k0 + 1);
      return {
        p: new V3().lerpVectors(pos[a2], pos[b2], fr),
        t: new V3().lerpVectors(tan[a2], tan[b2], fr).normalize(),
        u: new V3().lerpVectors(up[a2], up[b2], fr).normalize()
      };
    }

    /* Loopings einsetzen, von hinten nach vorn */
    var order = LOOPS.slice().sort(function (a2, b2) { return b2.u - a2.u; });
    var loopInfo = [];
    order.forEach(function (spec) {
      var sh = loopShape(spec, seg);
      var i0 = at(spec.u), s0 = i0 * seg;
      var span = Math.max(2, Math.round(sh.advance / seg));
      var lp = [], lu = [], lw = [], lg = [];
      sh.pts.forEach(function (q, m) {
        var b3 = baseAt(s0 + q.f);
        var side2 = new V3().crossVectors(b3.t, b3.u).normalize();
        lp.push(new V3(b3.p.x + b3.u.x * q.h + side2.x * q.l,
                       b3.p.y + b3.u.y * q.h + side2.y * q.l,
                       b3.p.z + b3.u.z * q.h + side2.z * q.l));
        var st = Math.sin(q.phi), ct = Math.cos(q.phi);
        lu.push(new V3(b3.u.x * ct - b3.t.x * st,
                       b3.u.y * ct - b3.t.y * st,
                       b3.u.z * ct - b3.t.z * st).normalize());
        lw.push(1 + (LOOP_HALF - 1) * smoother(Math.min(m, sh.pts.length - m) / (sh.pts.length * 0.14)));
        lg.push(0);
      });
      pos = pos.slice(0, i0).concat(lp, pos.slice(i0 + span));
      up = up.slice(0, i0).concat(lu, up.slice(i0 + span));
      wid = wid.slice(0, i0).concat(lw, wid.slice(i0 + span));
      gp = gp.slice(0, i0).concat(lg, gp.slice(i0 + span));
      loopInfo.push({ from: i0, count: lp.length });
    });

    /* Frames aufbauen */
    var n2 = pos.length, frames = [];
    for (i = 0; i < n2; i++) {
      var tg = new V3().subVectors(pos[Math.min(n2 - 1, i + 1)], pos[Math.max(0, i - 1)]).normalize();
      var u2 = up[i].clone();
      u2.addScaledVector(tg, -u2.dot(tg)).normalize();
      frames.push({ p: pos[i], t: tg, u: u2,
                    r: new V3().crossVectors(tg, u2).normalize(),
                    w: wid[i], d: 0, yaw: 0, vk: 0, gap: gp[i] });
    }
    var total = 0;
    for (i = 0; i < n2; i++) {
      frames[i].d = total;
      if (i < n2 - 1) total += frames[i].p.distanceTo(frames[i + 1].p);
    }
    for (i = 0; i < n2; i++) {
      var fa = frames[Math.max(0, i - 1)], fb = frames[i], fc = frames[Math.min(n2 - 1, i + 1)];
      var ds = fa.p.distanceTo(fb.p) + fb.p.distanceTo(fc.p);
      if (ds < 1e-6) continue;
      fb.yaw = Math.atan2(new V3().crossVectors(fa.t, fc.t).dot(fb.u), fa.t.dot(fc.t)) / ds;
      fb.vk = new V3().subVectors(fc.t, fa.t).dot(fb.u) / ds;
    }

    /* Schluchten aus den fertigen Frames ablesen (dort wird keine Fahrbahn gebaut) */
    var gaps = [], run = null;
    for (i = 0; i < n2; i++) {
      if (frames[i].gap && !run) run = { s0: frames[i].d, i0: i };
      if (!frames[i].gap && run) { run.s1 = frames[i].d; run.i1 = i; gaps.push(run); run = null; }
    }
    if (run) { run.s1 = total; run.i1 = n2 - 1; gaps.push(run); }

    /* Nachschlagetabelle: Bogenlaenge -> Frame-Index (statt Binaersuche) */
    var BUCKET = 2;
    var lut = new Int32Array(Math.ceil(total / BUCKET) + 2);
    for (i = 0, j = 0; i < lut.length; i++) {
      var sAt = i * BUCKET;
      while (j + 1 < n2 && frames[j + 1].d <= sAt) j++;
      lut[i] = j;
    }

    return {
      frames: frames, length: total, count: n2, roadHalf: ROAD_HALF, open: true,
      pads: PADS.map(function (u) { return u * total; }),
      gaps: gaps, loops: loopInfo, lut: lut, bucket: BUCKET, baseCurve: curve
    };
  }

  function locate(track, s) {
    var lo = track.lut[clamp((s / track.bucket) | 0, 0, track.lut.length - 1)];
    var F = track.frames, n = track.count;
    while (lo + 1 < n && F[lo + 1].d <= s) lo++;
    return lo;
  }

  /* Interpolierter Frame an der Streckenposition s (in Metern). */
  function frameAt(track, s, out) {
    var F = track.frames, n = track.count;
    s = clamp(s, 0, track.length);
    var lo = locate(track, s);
    var a = F[lo], b = F[Math.min(n - 1, lo + 1)];
    var span = b.d - a.d;
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
    out.gap = a.gap;
    out.index = lo;
    return out;
  }

  /* Nur die Skalarwerte - ohne Vektorinterpolation, fuer den KI-Fahrer. */
  function sample(track, s, out) {
    var F = track.frames, n = track.count;
    s = clamp(s, 0, track.length);
    var lo = locate(track, s);
    var a = F[lo], b = F[Math.min(n - 1, lo + 1)];
    var span = b.d - a.d;
    var f = span > 1e-6 ? (s - a.d) / span : 0;
    out = out || { yaw: 0, vk: 0, ty: 0, w: 1, gap: 0 };
    out.yaw = a.yaw + (b.yaw - a.yaw) * f;
    out.vk = a.vk + (b.vk - a.vk) * f;
    out.ty = a.t.y + (b.t.y - a.t.y) * f;
    out.w = a.w + (b.w - a.w) * f;
    out.gap = a.gap;
    return out;
  }

  MK.track = { build: build, frameAt: frameAt, sample: sample, STEP: STEP, UP: UP,
               rotAxis: rotAxis, clamp: clamp, smoother: smoother, ROAD_HALF: ROAD_HALF };
})(typeof window !== 'undefined' ? window : global);
