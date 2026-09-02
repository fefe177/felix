/* Schleifental GP - Fahrbahn-Mesh und Landschaft.
 * Die gesamte Strecke wird als wenige zusammengefasste BufferGeometries
 * gebaut (Vertexfarben, Flat Shading) - das haelt die Draw Calls klein.
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};
  var T = root.THREE;
  var V3 = T.Vector3;

  var GROUND_Y = -9;

  var COL = {
    asphalt:  new T.Color('#3b414f'),
    asphalt2: new T.Color('#343a47'),
    line:     new T.Color('#e8e2d2'),
    edge:     new T.Color('#2b3040'),
    under:    new T.Color('#333a4b'),
    curbA:    new T.Color('#d64b3f'),
    curbB:    new T.Color('#f0ece2'),
    rail:     new T.Color('#c9d2e0'),
    post:     new T.Color('#59627a'),
    pillar:   new T.Color('#8a93a5'),
    pad:      new T.Color('#ff7a1f'),
    padHot:   new T.Color('#ffd23f'),
    checkA:   new T.Color('#f2f2f2'),
    checkB:   new T.Color('#1d2029'),
    ground:   new T.Color('#6f9e4e'),
    hill:     new T.Color('#5c8a52'),
    hillFar:  new T.Color('#6f8f92'),
    trunk:    new T.Color('#6a4a30'),
    crown:    new T.Color('#3f7f3c'),
    crown2:   new T.Color('#4f9445'),
    rock:     new T.Color('#8d8f93'),
    standA:   new T.Color('#e0e4ec'),
    standB:   new T.Color('#c8443c'),
    gate:     new T.Color('#2c3140')
  };

  function Builder() { this.p = []; this.c = []; }
  Builder.prototype.tri = function (a, b, c, col) {
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (var i = 0; i < 3; i++) this.c.push(col.r, col.g, col.b);
  };
  Builder.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  /* Quader aus Mittelpunkt und drei Halbachsen */
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
    var F = track.frames, n = track.count, H = track.roadHalf;
    var road = new Builder(), trim = new Builder(), pads = new Builder();
    var CURB = 1.7, RAIL_H = 1.75, RAIL_T = 0.42, THICK = 0.75;
    var padSet = {};
    track.pads.forEach(function (s) {
      var i0 = 0;
      while (i0 < n - 1 && F[i0].d < s) i0++;
      for (var k = -4; k < 5; k++) padSet[(i0 + k + n) % n] = k;
    });
    var startCells = 12;

    for (var i = 0; i < n; i++) {
      var a = F[i], b = F[(i + 1) % n];
      var ha = H * a.w, hb = H * b.w;
      var dark = (i % 12) < 6;
      var asp = dark ? COL.asphalt : COL.asphalt2;

      /* Fahrbahn oben: links | Mittellinie | rechts */
      var lineOn = (i % 8) < 4;
      var mid = lineOn ? COL.line : asp;
      road.quad(pt(a, -ha, 0), pt(a, -0.45, 0), pt(b, -0.45, 0), pt(b, -hb, 0), asp);
      road.quad(pt(a, -0.45, 0), pt(a, 0.45, 0), pt(b, 0.45, 0), pt(b, -0.45, 0), mid);
      road.quad(pt(a, 0.45, 0), pt(a, ha, 0), pt(b, hb, 0), pt(b, 0.45, 0), asp);
      /* Unterseite und Flanken - ueber die volle Breite inklusive Randstein,
         sonst sieht man im Looping von unten die helle Randsteinoberseite */
      var oa = ha + CURB, ob = hb + CURB;
      road.quad(pt(b, -ob, -THICK), pt(b, ob, -THICK), pt(a, oa, -THICK), pt(a, -oa, -THICK), COL.under);
      road.quad(pt(a, -oa, 0.08), pt(a, -oa, -THICK), pt(b, -ob, -THICK), pt(b, -ob, 0.08), COL.edge);
      road.quad(pt(a, oa, 0.08), pt(b, ob, 0.08), pt(b, ob, -THICK), pt(a, oa, -THICK), COL.edge);

      /* Randsteine */
      var cc = (i % 6) < 3 ? COL.curbA : COL.curbB;
      trim.quad(pt(a, -ha - CURB, 0.08), pt(a, -ha, 0.08), pt(b, -hb, 0.08), pt(b, -hb - CURB, 0.08), cc);
      trim.quad(pt(a, ha, 0.08), pt(a, ha + CURB, 0.08), pt(b, hb + CURB, 0.08), pt(b, hb, 0.08), cc);

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

      /* Turbofeld */
      if (padSet[i] !== undefined) {
        var k = padSet[i], t0 = (k + 4) / 9, t1 = (k + 5) / 9;
        for (var s = -1; s <= 1; s++) {
          var w0 = ha * 0.3;
          pads.quad(pt(a, s * ha * 0.62 - w0, 0.05), pt(a, s * ha * 0.62 + w0, 0.05),
                    pt(b, s * hb * 0.62 + w0, 0.05), pt(b, s * hb * 0.62 - w0, 0.05),
                    (k % 3 === 0) ? COL.padHot : COL.pad);
        }
      }

      /* Start-Ziel-Karo */
      if (i < 4) {
        for (var c = 0; c < startCells; c++) {
          var x0 = -ha + 2 * ha * c / startCells, x1 = -ha + 2 * ha * (c + 1) / startCells;
          road.quad(pt(a, x0, 0.02), pt(a, x1, 0.02), pt(b, x1, 0.02), pt(b, x0, 0.02),
                    ((c + i) % 2) ? COL.checkA : COL.checkB);
        }
      }
    }

    /* Stuetzpfeiler */
    var piers = new Builder();
    for (var j = 0; j < n; j += 7) {
      var f = F[j];
      if (f.u.y < 0.55) continue;
      var top = pt(f, 0, -0.6), h = top.y - GROUND_Y;
      if (h < 2.5) continue;
      var ex2 = new V3(1.1, 0, 0), ez2 = new V3(0, 0, 1.1);
      piers.box(new V3(top.x, (top.y + GROUND_Y) / 2, top.z), ex2, new V3(0, h / 2, 0), ez2, COL.pillar);
      piers.box(new V3(top.x, GROUND_Y + 0.6, top.z), new V3(2.4, 0, 0), new V3(0, 0.6, 0), new V3(0, 0, 2.4), COL.pillar);
    }

    var group = new T.Group();
    group.add(road.mesh(roadMat()));
    group.add(trim.mesh(roadMat()));
    group.add(piers.mesh(roadMat({ side: T.FrontSide })));
    var padMesh = pads.mesh(roadMat({ emissive: new T.Color('#ff7a1f'), emissiveIntensity: 0.45 }));
    group.add(padMesh);
    group.updateMatrix();
    return { group: group, padMesh: padMesh };
  }

  /* Himmelsverlauf als Textur */
  function skyTexture() {
    var c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    var g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.00, '#2f6fb5');
    grd.addColorStop(0.45, '#79b6e8');
    grd.addColorStop(0.72, '#bfe0f2');
    grd.addColorStop(1.00, '#e9f1e2');
    g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
    var tex = new T.CanvasTexture(c);
    tex.magFilter = T.LinearFilter;
    return tex;
  }

  function buildScenery(scene, track, rnd) {
    var F = track.frames, n = track.count;

    var sky = new T.Mesh(new T.SphereGeometry(3400, 24, 16),
      new T.MeshBasicMaterial({ map: skyTexture(), side: T.BackSide, fog: false, depthWrite: false }));
    scene.add(sky);

    var ground = new T.Mesh(new T.CircleGeometry(3200, 48),
      new T.MeshLambertMaterial({ color: COL.ground }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_Y;
    scene.add(ground);

    /* Huegelkette am Horizont */
    var hills = new Builder();
    for (var h = 0; h < 46; h++) {
      var a = h / 46 * Math.PI * 2 + rnd() * 0.08;
      var dist = 1300 + rnd() * 900, r = 160 + rnd() * 220, hh = 90 + rnd() * 190;
      var cx = Math.cos(a) * dist, cz = Math.sin(a) * dist;
      var col = COL.hill.clone().lerp(COL.hillFar, Math.min(1, (dist - 1300) / 900));
      var segs = 7;
      for (var k = 0; k < segs; k++) {
        var a0 = k / segs * Math.PI * 2, a1 = (k + 1) / segs * Math.PI * 2;
        hills.tri(new V3(cx, GROUND_Y + hh, cz),
                  new V3(cx + Math.cos(a0) * r, GROUND_Y - 4, cz + Math.sin(a0) * r),
                  new V3(cx + Math.cos(a1) * r, GROUND_Y - 4, cz + Math.sin(a1) * r), col);
      }
    }
    scene.add(hills.mesh(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));

    /* Baeume und Felsen im Tal - Punkte mit Abstand zur Fahrbahn */
    var near = [];
    for (var i = 0; i < n; i += 4) near.push(F[i].p);
    function clearOf(x, z, minD) {
      for (var i2 = 0; i2 < near.length; i2++) {
        var dx = near[i2].x - x, dz = near[i2].z - z;
        if (dx * dx + dz * dz < minD * minD) return false;
      }
      return true;
    }
    var flora = new Builder(), tries = 0, placed = 0;
    while (placed < 260 && tries < 6000) {
      tries++;
      var ang = rnd() * Math.PI * 2, rad = 60 + rnd() * 1100;
      var x = Math.cos(ang) * rad * 1.25, z = Math.sin(ang) * rad;
      if (!clearOf(x, z, 26)) continue;
      placed++;
      if (rnd() < 0.13) {
        var rs = 2 + rnd() * 4;
        flora.box(new V3(x, GROUND_Y + rs * 0.4, z), new V3(rs, 0, rs * 0.3),
                  new V3(0, rs * 0.5, 0), new V3(rs * 0.3, 0, rs), COL.rock);
        continue;
      }
      var th = 7 + rnd() * 12, tw = 0.9 + rnd() * 0.5;
      flora.box(new V3(x, GROUND_Y + th * 0.25, z), new V3(tw, 0, 0),
                new V3(0, th * 0.25, 0), new V3(0, 0, tw), COL.trunk);
      var cr = 4 + rnd() * 4.5, cy = GROUND_Y + th * 0.5, ch = th * 0.75;
      var cc = rnd() < 0.5 ? COL.crown : COL.crown2;
      for (var k2 = 0; k2 < 5; k2++) {
        var b0 = k2 / 5 * Math.PI * 2, b1 = (k2 + 1) / 5 * Math.PI * 2;
        flora.tri(new V3(x, cy + ch, z),
                  new V3(x + Math.cos(b0) * cr, cy, z + Math.sin(b0) * cr),
                  new V3(x + Math.cos(b1) * cr, cy, z + Math.sin(b1) * cr), cc);
        flora.tri(new V3(x, cy + ch * 0.45, z),
                  new V3(x + Math.cos(b1) * cr * 1.25, cy - ch * 0.15, z + Math.sin(b1) * cr * 1.25),
                  new V3(x + Math.cos(b0) * cr * 1.25, cy - ch * 0.15, z + Math.sin(b0) * cr * 1.25), cc);
      }
    }
    scene.add(flora.mesh(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));

    /* Start-Ziel-Bogen und Tribuenen */
    var deco = new Builder();
    var f0 = F[2];
    var gateR = track.roadHalf + 5;
    [-1, 1].forEach(function (s) {
      deco.box(pt(f0, s * gateR, 7), new V3().copy(f0.r).multiplyScalar(1.1),
               new V3(0, 7, 0), new V3().copy(f0.t).multiplyScalar(1.1), COL.gate);
    });
    deco.box(pt(f0, 0, 15), new V3().copy(f0.r).multiplyScalar(gateR + 1.1),
             new V3(0, 1.6, 0), new V3().copy(f0.t).multiplyScalar(0.9), COL.gate);
    deco.box(pt(f0, 0, 12.6), new V3().copy(f0.r).multiplyScalar(gateR - 1),
             new V3(0, 1.5, 0), new V3().copy(f0.t).multiplyScalar(0.4), COL.standB);
    for (var g2 = 0; g2 < 2; g2++) {
      var side = g2 ? 1 : -1;
      var base = pt(F[16 + g2 * 26], side * (track.roadHalf + 26), -3);
      for (var row = 0; row < 5; row++) {
        deco.box(new V3(base.x, base.y + row * 1.7, base.z),
                 new V3().copy(F[16].r).multiplyScalar(9 - row * 1.4),
                 new V3(0, 0.85, 0), new V3().copy(F[16].t).multiplyScalar(16),
                 row % 2 ? COL.standA : COL.standB);
      }
    }
    scene.add(deco.mesh(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));

    /* Wolken */
    var clouds = new T.Group();
    var cloudGeo = new T.IcosahedronGeometry(1, 0);
    var cloudMat = new T.MeshPhongMaterial({ color: '#ffffff', shininess: 0, flatShading: true });
    for (var c2 = 0; c2 < 26; c2++) {
      var puff = new T.Group();
      var parts = 3 + Math.floor(rnd() * 3);
      for (var q = 0; q < parts; q++) {
        var m = new T.Mesh(cloudGeo, cloudMat);
        m.position.set((rnd() - 0.5) * 34, (rnd() - 0.5) * 7, (rnd() - 0.5) * 22);
        m.scale.set(12 + rnd() * 16, 7 + rnd() * 5, 10 + rnd() * 10);
        puff.add(m);
      }
      var ca = rnd() * Math.PI * 2, cd = 300 + rnd() * 1500;
      puff.position.set(Math.cos(ca) * cd, 120 + rnd() * 130, Math.sin(ca) * cd);
      puff.userData.spin = 0.6 + rnd();
      clouds.add(puff);
    }
    scene.add(clouds);

    return { sky: sky, clouds: clouds, ground: ground };
  }

  MK.world = { buildTrack: buildTrack, buildScenery: buildScenery, COL: COL, GROUND_Y: GROUND_Y, Builder: Builder, pt: pt };
})(typeof window !== 'undefined' ? window : global);
