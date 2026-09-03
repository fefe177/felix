/* Schleifental GP - Fahrbahn-Mesh und Landschaft.
 *
 * Alles wird zu wenigen zusammengefassten BufferGeometries gebaut
 * (Vertexfarben, Flat Shading) - das haelt die Draw Calls klein. Die Farbwelt
 * kommt aus der Strecke (src/courses.js), damit jede Strecke anders aussieht.
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};
  var T = root.THREE;
  var V3 = T.Vector3;

  /* Feste Farben, die in jeder Welt gleich bleiben */
  var FIX = {
    line:   '#e8e2d2', curbA: '#d64b3f', curbB: '#f0ece2',
    rail:   '#c9d2e0', post: '#59627a', pillar: '#8a93a5',
    pad:    '#ff7a1f', padHot: '#ffd23f',
    checkA: '#f2f2f2', checkB: '#1d2029',
    standA: '#e0e4ec', standB: '#c8443c', gate: '#2c3140'
  };

  function palette(track) {
    var p = track.palette, c = {};
    Object.keys(FIX).forEach(function (k) { c[k] = new T.Color(FIX[k]); });
    ['boden', 'huegel', 'huegelFern', 'fels', 'stamm', 'krone', 'krone2',
     'asphalt', 'asphalt2', 'unten', 'kante', 'sonne'].forEach(function (k) {
      c[k] = new T.Color(p[k]);
    });
    return c;
  }

  function Builder() { this.p = []; this.c = []; }
  Builder.prototype.tri = function (a, b, c, col) {
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (var i = 0; i < 3; i++) this.c.push(col.r, col.g, col.b);
  };
  Builder.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  Builder.prototype.box = function (o, ex, ey, ez, col) {
    var v = [];
    for (var i = 0; i < 8; i++) {
      v.push(new V3(
        o.x + ex.x * (i & 1 ? 1 : -1) + ey.x * (i & 2 ? 1 : -1) + ez.x * (i & 4 ? 1 : -1),
        o.y + ex.y * (i & 1 ? 1 : -1) + ey.y * (i & 2 ? 1 : -1) + ez.y * (i & 4 ? 1 : -1),
        o.z + ex.z * (i & 1 ? 1 : -1) + ey.z * (i & 2 ? 1 : -1) + ez.z * (i & 4 ? 1 : -1)));
    }
    this.quad(v[0], v[1], v[3], v[2], col); this.quad(v[4], v[6], v[7], v[5], col);
    this.quad(v[0], v[4], v[5], v[1], col); this.quad(v[2], v[3], v[7], v[6], col);
    this.quad(v[1], v[5], v[7], v[3], col); this.quad(v[0], v[2], v[6], v[4], col);
  };
  Builder.prototype.mesh = function (mat) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    var m = new T.Mesh(g, mat);
    m.matrixAutoUpdate = false;
    return m;
  };
  Builder.prototype.leer = function () { return this.p.length === 0; };

  function roadMat(opts) {
    return new T.MeshLambertMaterial(Object.assign({ vertexColors: true, side: T.DoubleSide }, opts || {}));
  }

  /* Punkt auf der Fahrbahn: seitlicher Versatz x, Hoehe y ueber der Fahrbahn */
  function pt(f, x, y) {
    return new V3(f.p.x + f.r.x * x + f.u.x * y,
                  f.p.y + f.r.y * x + f.u.y * y,
                  f.p.z + f.r.z * x + f.u.z * y);
  }

  function buildTrack(track) {
    var F = track.frames, n = track.count, H = track.roadHalf, COL = palette(track);
    var road = new Builder(), trim = new Builder(), pads = new Builder(), piers = new Builder();
    var CURB = 1.7, RAIL_H = 1.75, RAIL_T = 0.42, THICK = 0.75;
    var padSet = {};
    track.pads.forEach(function (s) {
      var i0 = 0;
      while (i0 < n - 1 && F[i0].d < s) i0++;
      for (var k = -4; k < 5; k++) padSet[i0 + k] = k;
    });

    for (var i = 0; i < n - 1; i++) {
      var a = F[i], b = F[i + 1];
      if (a.gap || b.gap) continue;                  // Schlucht: hier keine Fahrbahn
      var ha = H * a.w, hb = H * b.w;
      var asp = (i % 12) < 6 ? COL.asphalt : COL.asphalt2;
      var oa = ha + CURB, ob = hb + CURB;

      /* Fahrbahn oben: links | Mittellinie | rechts */
      var mid = (i % 8) < 4 ? COL.line : asp;
      road.quad(pt(a, -ha, 0), pt(a, -0.45, 0), pt(b, -0.45, 0), pt(b, -hb, 0), asp);
      road.quad(pt(a, -0.45, 0), pt(a, 0.45, 0), pt(b, 0.45, 0), pt(b, -0.45, 0), mid);
      road.quad(pt(a, 0.45, 0), pt(a, ha, 0), pt(b, hb, 0), pt(b, 0.45, 0), asp);
      /* Unterseite und Flanken ueber die volle Breite */
      road.quad(pt(b, -ob, -THICK), pt(b, ob, -THICK), pt(a, oa, -THICK), pt(a, -oa, -THICK), COL.unten);
      road.quad(pt(a, -oa, 0.08), pt(a, -oa, -THICK), pt(b, -ob, -THICK), pt(b, -ob, 0.08), COL.kante);
      road.quad(pt(a, oa, 0.08), pt(b, ob, 0.08), pt(b, ob, -THICK), pt(a, oa, -THICK), COL.kante);

      /* Randsteine */
      var cc = (i % 6) < 3 ? COL.curbA : COL.curbB;
      trim.quad(pt(a, -oa, 0.08), pt(a, -ha, 0.08), pt(b, -hb, 0.08), pt(b, -ob, 0.08), cc);
      trim.quad(pt(a, ha, 0.08), pt(a, oa, 0.08), pt(b, ob, 0.08), pt(b, hb, 0.08), cc);

      /* Leitplanken */
      var ro = CURB + 0.25;
      trim.quad(pt(a, -ha - ro, RAIL_H), pt(a, -ha - ro, RAIL_H - RAIL_T),
                pt(b, -hb - ro, RAIL_H - RAIL_T), pt(b, -hb - ro, RAIL_H), COL.rail);
      trim.quad(pt(a, ha + ro, RAIL_H), pt(b, hb + ro, RAIL_H),
                pt(b, hb + ro, RAIL_H - RAIL_T), pt(a, ha + ro, RAIL_H - RAIL_T), COL.rail);
      if (i % 4 === 0) {
        var ex = new V3().copy(a.r).multiplyScalar(0.16);
        var ey = new V3().copy(a.u).multiplyScalar(RAIL_H / 2);
        var ez = new V3().copy(a.t).multiplyScalar(0.16);
        trim.box(pt(a, -ha - ro, RAIL_H / 2), ex, ey, ez, COL.post);
        trim.box(pt(a, ha + ro, RAIL_H / 2), ex, ey, ez, COL.post);
      }

      /* Turbofeld: drei Pfeilspuren */
      if (padSet[i] !== undefined) {
        var pk = padSet[i], pw = 0.17;
        for (var s = -1; s <= 1; s++) {
          pads.quad(pt(a, (s * 0.6 - pw) * ha, 0.05), pt(a, (s * 0.6 + pw) * ha, 0.05),
                    pt(b, (s * 0.6 + pw) * hb, 0.05), pt(b, (s * 0.6 - pw) * hb, 0.05),
                    (pk % 3 === 0) ? COL.padHot : COL.pad);
        }
      }

      /* Start- und Zielkaro */
      if (i < 4 || i > n - 7) {
        for (var c2 = 0; c2 < 12; c2++) {
          var x0 = -ha + 2 * ha * c2 / 12, x1 = -ha + 2 * ha * (c2 + 1) / 12;
          road.quad(pt(a, x0, 0.02), pt(a, x1, 0.02), pt(b, x1, 0.02), pt(b, x0, 0.02),
                    ((c2 + i) % 2) ? COL.checkA : COL.checkB);
        }
      }
    }

    /* Stuetzpfeiler im Tal */
    for (var j = 0; j < n; j += 7) {
      var f = F[j];
      if (f.u.y < 0.55 || f.gap) continue;
      var top = pt(f, 0, -0.6), hgt = top.y - track.ground;
      if (hgt < 2.5 || hgt > 52) continue;
      piers.box(new V3(top.x, (top.y + track.ground) / 2, top.z),
                new V3(1.1, 0, 0), new V3(0, hgt / 2, 0), new V3(0, 0, 1.1), COL.pillar);
      piers.box(new V3(top.x, track.ground + 0.6, top.z),
                new V3(2.4, 0, 0), new V3(0, 0.6, 0), new V3(0, 0, 2.4), COL.pillar);
    }

    var group = new T.Group();
    group.add(road.mesh(roadMat()));
    group.add(trim.mesh(roadMat()));
    if (!piers.leer()) group.add(piers.mesh(roadMat({ side: T.FrontSide })));
    var padMesh = pads.mesh(roadMat({ emissive: new T.Color(FIX.pad), emissiveIntensity: 0.45 }));
    group.add(padMesh);
    group.updateMatrix();
    return { group: group, padMesh: padMesh };
  }

  /* Himmelsverlauf als Textur */
  function skyTexture(stops) {
    var c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    var g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 256);
    stops.forEach(function (col, i) { grd.addColorStop(i / (stops.length - 1), col); });
    g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
    var tex = new T.CanvasTexture(c);
    tex.magFilter = T.LinearFilter;
    return tex;
  }

  function buildScenery(track, rnd) {
    var F = track.frames, n = track.count, P = track.palette, COL = palette(track);
    var G = track.ground, group = new T.Group();

    group.add(new T.Mesh(new T.SphereGeometry(3400, 24, 16),
      new T.MeshBasicMaterial({ map: skyTexture(P.himmel), side: T.BackSide, fog: false, depthWrite: false })));

    /* Sonne mit Hof */
    var sd = new V3(P.sonnePos[0], P.sonnePos[1], P.sonnePos[2]).normalize();
    var sun = new T.Mesh(new T.SphereGeometry(105, 16, 12),
      new T.MeshBasicMaterial({ color: COL.sonne, fog: false }));
    sun.position.copy(sd).multiplyScalar(3000);
    group.add(sun);
    var halo = new T.Mesh(new T.SphereGeometry(230, 16, 12),
      new T.MeshBasicMaterial({ color: COL.sonne, transparent: true, opacity: 0.22, fog: false, depthWrite: false }));
    halo.position.copy(sun.position);
    group.add(halo);

    /* Licht passend zur Farbwelt */
    group.add(new T.HemisphereLight(new T.Color(P.himmelLicht), new T.Color(P.bodenLicht), 0.72));
    var key = new T.DirectionalLight(new T.Color(P.licht), 0.85);
    key.position.copy(sd).multiplyScalar(800);
    group.add(key);
    var rim = new T.DirectionalLight(0x9ec8ff, 0.26);
    rim.position.set(-sd.x * 600, 220, -sd.z * 600);
    group.add(rim);
    var fill = new T.DirectionalLight(0xbfd8c0, 0.3);      // hebt die Unterseiten
    fill.position.set(120, -400, -80);
    group.add(fill);

    var ground = new T.Mesh(new T.CircleGeometry(3200, 48),
      new T.MeshLambertMaterial({ color: COL.boden }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = G;
    group.add(ground);

    /* Huegelkette am Horizont */
    var hills = new Builder();
    for (var h = 0; h < 46; h++) {
      var ha2 = h / 46 * Math.PI * 2 + rnd() * 0.08;
      var dist = 1300 + rnd() * 900, r = 160 + rnd() * 220, hh = 90 + rnd() * 190;
      var cx = Math.cos(ha2) * dist, cz = Math.sin(ha2) * dist;
      var col = COL.huegel.clone().lerp(COL.huegelFern, Math.min(1, (dist - 1300) / 900));
      for (var k = 0; k < 7; k++) {
        var a0 = k / 7 * Math.PI * 2, a1 = (k + 1) / 7 * Math.PI * 2;
        hills.tri(new V3(cx, G + hh, cz),
                  new V3(cx + Math.cos(a0) * r, G - 4, cz + Math.sin(a0) * r),
                  new V3(cx + Math.cos(a1) * r, G - 4, cz + Math.sin(a1) * r), col);
      }
    }
    group.add(hills.mesh(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));

    /* Massiv unter der Abfahrt; an Schluchten bleibt eine Luecke */
    var massif = new Builder();
    for (var mi = 0; mi < n; mi += 26) {
      var mf = F[mi];
      if (mf.p.y < G + 50 || mf.u.y < 0.5) continue;
      var nearGap = track.gaps.some(function (g) { return mf.d > g.s0 - 150 && mf.d < g.s1 + 150; });
      if (nearGap) continue;
      var mh = mf.p.y - G - 12, mr = 70 + (mi % 5) * 22;
      if (mh < 20) continue;
      var mcol = COL.huegel.clone().lerp(COL.fels, 0.35 + (mi % 3) * 0.12);
      for (var ms = 0; ms < 6; ms++) {
        var b0 = ms / 6 * Math.PI * 2 + mi, b1 = (ms + 1) / 6 * Math.PI * 2 + mi;
        massif.tri(new V3(mf.p.x, G + mh, mf.p.z),
                   new V3(mf.p.x + Math.cos(b0) * mr, G - 2, mf.p.z + Math.sin(b0) * mr),
                   new V3(mf.p.x + Math.cos(b1) * mr, G - 2, mf.p.z + Math.sin(b1) * mr), mcol);
      }
    }
    if (!massif.leer()) group.add(massif.mesh(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));

    /* Baeume und Felsen - mit Abstand zur Fahrbahn */
    var near = [];
    for (var i2 = 0; i2 < n; i2 += 4) near.push(F[i2].p);
    function frei(x, z, minD) {
      for (var q = 0; q < near.length; q++) {
        var dx = near[q].x - x, dz = near[q].z - z;
        if (dx * dx + dz * dz < minD * minD) return false;
      }
      return true;
    }
    var flora = new Builder(), tries = 0, placed = 0;
    while (placed < P.baeume && tries < 6000) {
      tries++;
      var ang = rnd() * Math.PI * 2, rad = 60 + rnd() * 1100;
      var x = Math.cos(ang) * rad * 1.25, z = Math.sin(ang) * rad;
      if (!frei(x, z, 26)) continue;
      placed++;
      if (rnd() < 0.16) {
        var rs = 2 + rnd() * 4;
        flora.box(new V3(x, G + rs * 0.4, z), new V3(rs, 0, rs * 0.3),
                  new V3(0, rs * 0.5, 0), new V3(rs * 0.3, 0, rs), COL.fels);
        continue;
      }
      var th = 7 + rnd() * 12, tw = 0.9 + rnd() * 0.5;
      flora.box(new V3(x, G + th * 0.25, z), new V3(tw, 0, 0),
                new V3(0, th * 0.25, 0), new V3(0, 0, tw), COL.stamm);
      var cr = 4 + rnd() * 4.5, cy = G + th * 0.5, ch = th * 0.75;
      var cc2 = rnd() < 0.5 ? COL.krone : COL.krone2;
      for (var k2 = 0; k2 < 5; k2++) {
        var c0 = k2 / 5 * Math.PI * 2, c1 = (k2 + 1) / 5 * Math.PI * 2;
        flora.tri(new V3(x, cy + ch, z),
                  new V3(x + Math.cos(c0) * cr, cy, z + Math.sin(c0) * cr),
                  new V3(x + Math.cos(c1) * cr, cy, z + Math.sin(c1) * cr), cc2);
        flora.tri(new V3(x, cy + ch * 0.45, z),
                  new V3(x + Math.cos(c1) * cr * 1.25, cy - ch * 0.15, z + Math.sin(c1) * cr * 1.25),
                  new V3(x + Math.cos(c0) * cr * 1.25, cy - ch * 0.15, z + Math.sin(c0) * cr * 1.25), cc2);
      }
    }
    if (!flora.leer()) group.add(flora.mesh(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));

    /* Tore an Start und Ziel, Tribuene am Ziel */
    var deco = new Builder(), gateR = track.roadHalf + 5;
    [{ f: F[3], band: COL.standB }, { f: F[n - 6], band: COL.checkA }].forEach(function (gate) {
      var f0 = gate.f;
      [-1, 1].forEach(function (s) {
        deco.box(pt(f0, s * gateR, 7), new V3().copy(f0.r).multiplyScalar(1.1),
                 new V3(0, 7, 0), new V3().copy(f0.t).multiplyScalar(1.1), COL.gate);
      });
      deco.box(pt(f0, 0, 15), new V3().copy(f0.r).multiplyScalar(gateR + 1.1),
               new V3(0, 1.6, 0), new V3().copy(f0.t).multiplyScalar(0.9), COL.gate);
      deco.box(pt(f0, 0, 12.6), new V3().copy(f0.r).multiplyScalar(gateR - 1),
               new V3(0, 1.5, 0), new V3().copy(f0.t).multiplyScalar(0.4), gate.band);
    });
    for (var g2 = 0; g2 < 2; g2++) {
      var fs = F[n - 30], side = g2 ? 1 : -1;
      var base = pt(fs, side * (track.roadHalf + 26), -3);
      for (var row = 0; row < 5; row++) {
        deco.box(new V3(base.x, base.y + row * 1.7, base.z),
                 new V3().copy(fs.r).multiplyScalar(9 - row * 1.4),
                 new V3(0, 0.85, 0), new V3().copy(fs.t).multiplyScalar(16),
                 row % 2 ? COL.standA : COL.standB);
      }
    }
    group.add(deco.mesh(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));

    /* Wolken */
    var clouds = new T.Group();
    var cloudGeo = new T.IcosahedronGeometry(1, 0);
    var cloudMat = new T.MeshPhongMaterial({ color: '#ffffff', shininess: 0, flatShading: true });
    for (var c3 = 0; c3 < P.wolken; c3++) {
      var puff = new T.Group();
      for (var q2 = 0; q2 < 3 + Math.floor(rnd() * 3); q2++) {
        var m = new T.Mesh(cloudGeo, cloudMat);
        m.position.set((rnd() - 0.5) * 34, (rnd() - 0.5) * 7, (rnd() - 0.5) * 22);
        m.scale.set(12 + rnd() * 16, 7 + rnd() * 5, 10 + rnd() * 10);
        puff.add(m);
      }
      var ca = rnd() * Math.PI * 2, cd = 300 + rnd() * 1500;
      puff.position.set(Math.cos(ca) * cd, G + 240 + rnd() * 170, Math.sin(ca) * cd);
      clouds.add(puff);
    }
    group.add(clouds);

    return { group: group, clouds: clouds };
  }

  /* Geometrien und Materialien eines Teilbaums freigeben */
  function dispose(obj) {
    obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
  }

  MK.world = { buildTrack: buildTrack, buildScenery: buildScenery, dispose: dispose,
               Builder: Builder, pt: pt, palette: palette };
})(typeof window !== 'undefined' ? window : global);
