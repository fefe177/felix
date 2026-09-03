/* Schleifental GP - Kart-Modell und Fahrphysik.
 *
 * Die Physik rechnet streckenrelativ:
 *   s    Bogenlaenge auf der Strecke
 *   x    Querversatz zur Fahrbahnmitte
 *   phi  Kurswinkel gegenueber der Fahrbahntangente
 *   h/vy Hoehe ueber der Fahrbahn beim Sprung
 * Dadurch bleiben Loopings, Korkenzieher und Ueberkopf-Passagen stabil -
 * die Schwerkraft wirkt trotzdem echt: sie bremst bergauf, beschleunigt
 * bergab und zieht in ueberhoehten Kurven zur Innenseite.
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};
  var T = root.THREE;
  var V3 = T.Vector3;
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

  var P = {
    G: 20,            // Schwerkraft
    SLOPE: 0.55,      // wie stark Steigung die Geschwindigkeit aendert
    V_TOP: 46,        // Hoechstgeschwindigkeit
    V_BOOST: 68,
    ENGINE: 30,
    BRAKE: 40,
    COAST: 4.5,
    STEER: 2.35,
    DRIFT_STEER: 1.3,   // Faktor auf die Lenkrate im Drift
    PHI_MAX: 0.55,      // Fahrtrichtung gegen die Fahrbahn
    SLIP_MAX: 0.6,      // zusaetzlicher Schraegstand, nur optisch
    ALIGN: 2.6,
    GRIP: 3.4,
    CURB: 9,          // Bremsen auf dem Randstein
    WALL: 1.5,        // Leitplanke ausserhalb des Randsteins
    DOWN: 15          // Anpresskraft: haelt das Kart auch ueber Kopf auf der Bahn
  };

  /* Ein Koerper mit zwei verschieden grossen Enden - damit bekommt das Kart
     verjuengte Formen statt lauter Kisten. Laenge liegt auf der z-Achse. */
  function frustum(w0, h0, w1, h1, len, dy) {
    dy = dy || 0;
    var a = [[-w0 / 2, -h0 / 2, -len / 2], [w0 / 2, -h0 / 2, -len / 2],
             [w0 / 2, h0 / 2, -len / 2], [-w0 / 2, h0 / 2, -len / 2]];
    var b = [[-w1 / 2, -h1 / 2 + dy, len / 2], [w1 / 2, -h1 / 2 + dy, len / 2],
             [w1 / 2, h1 / 2 + dy, len / 2], [-w1 / 2, h1 / 2 + dy, len / 2]];
    var quads = [[a[0], a[1], a[2], a[3]], [b[1], b[0], b[3], b[2]],
                 [a[1], b[1], b[2], a[2]], [b[0], a[0], a[3], b[3]],
                 [a[3], a[2], b[2], b[3]], [b[0], b[1], a[1], a[0]]];
    var pos = [];
    quads.forEach(function (q) {
      [0, 1, 2, 0, 2, 3].forEach(function (i) { pos.push(q[i][0], q[i][1], q[i][2]); });
    });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  function makeKart(paint, accent) {
    var g = new T.Group();
    var lack = new T.Color(paint);
    var mat = {
      lack:   new T.MeshLambertMaterial({ color: lack }),
      dunkel: new T.MeshLambertMaterial({ color: lack.clone().multiplyScalar(0.55) }),
      zier:   new T.MeshLambertMaterial({ color: accent }),
      schwarz: new T.MeshLambertMaterial({ color: '#23262e' }),
      gummi:  new T.MeshLambertMaterial({ color: '#191c22' }),
      metall: new T.MeshLambertMaterial({ color: '#98a2b4' }),
      glas:   new T.MeshLambertMaterial({ color: '#1b2740' }),
      anzug:  new T.MeshLambertMaterial({ color: '#eae7df' })
    };
    var box = new T.BoxGeometry(1, 1, 1);
    var karosse = new T.Group();          // nickt und waenkt, die Raeder nicht
    g.add(karosse);

    function teil(parent, geo, m, x, y, z, rx, ry, rz) {
      var o = new T.Mesh(geo, m);
      o.position.set(x, y, z);
      if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0);
      parent.add(o);
      return o;
    }
    function kasten(parent, m, x, y, z, sx, sy, sz, rx) {
      var o = teil(parent, box, m, x, y, z, rx);
      o.scale.set(sx, sy, sz);
      return o;
    }

    /* --- Chassis --- */
    teil(karosse, frustum(0.30, 0.24, 0.88, 0.46, 1.10), mat.lack, 0, 0.44, -1.16);   // Nasenkegel
    teil(karosse, frustum(0.88, 0.46, 1.12, 0.54, 1.18), mat.lack, 0, 0.50, -0.02);   // Monocoque
    teil(karosse, frustum(1.12, 0.54, 0.46, 0.34, 0.92, -0.06), mat.lack, 0, 0.60, 1.02); // Motorhaube
    kasten(karosse, mat.dunkel, 0, 0.20, 0.30, 1.24, 0.16, 2.4);                      // Unterboden
    kasten(karosse, mat.zier, 0, 0.66, -1.20, 0.16, 0.05, 1.05);                      // Zierstreifen Nase
    kasten(karosse, mat.zier, 0, 0.80, 1.10, 0.14, 0.05, 0.80);                       // Zierstreifen Heck
    teil(karosse, frustum(1.02, 0.30, 0.62, 0.22, 0.62), mat.schwarz, 0, 0.22, 1.44); // Diffusor
    kasten(karosse, mat.schwarz, 0, 0.78, -0.18, 0.74, 0.30, 0.72);                   // Cockpitoeffnung
    teil(karosse, frustum(0.86, 0.10, 0.96, 0.10, 0.92), mat.dunkel, 0, 0.86, -0.16);  // Cockpitrand

    /* Seitenkaesten mit Lufteinlass und Zierstreifen */
    [-1, 1].forEach(function (s) {
      teil(karosse, frustum(0.44, 0.42, 0.30, 0.26, 1.15), mat.lack, s * 0.74, 0.46, 0.42);
      kasten(karosse, mat.schwarz, s * 0.74, 0.50, -0.14, 0.40, 0.30, 0.10);
      kasten(karosse, mat.zier, s * 0.97, 0.50, 0.42, 0.04, 0.12, 1.0);
      /* Spiegel */
      kasten(karosse, mat.dunkel, s * 0.52, 0.88, -0.30, 0.34, 0.03, 0.1);
      kasten(karosse, mat.schwarz, s * 0.66, 0.92, -0.30, 0.14, 0.12, 0.05);
    });

    /* Ueberrollbuegel und Airbox */
    teil(karosse, new T.CylinderGeometry(0.20, 0.26, 0.42, 10), mat.lack, 0, 1.10, 0.60);
    teil(karosse, frustum(0.40, 0.34, 0.24, 0.20, 0.70), mat.lack, 0, 1.02, 1.02);

    /* Frontfluegel */
    kasten(karosse, mat.schwarz, 0, 0.19, -1.80, 1.90, 0.05, 0.40);
    kasten(karosse, mat.zier, 0, 0.29, -1.72, 1.66, 0.04, 0.22, -0.22);
    [-1, 1].forEach(function (s) {
      kasten(karosse, mat.lack, s * 0.93, 0.30, -1.78, 0.05, 0.30, 0.46);
      kasten(karosse, mat.schwarz, s * 0.30, 0.24, -1.62, 0.06, 0.14, 0.3);
    });

    /* Heckfluegel */
    kasten(karosse, mat.schwarz, 0, 1.14, 1.62, 1.44, 0.06, 0.42);
    kasten(karosse, mat.zier, 0, 1.28, 1.70, 1.44, 0.05, 0.24, -0.3);
    [-1, 1].forEach(function (s) {
      kasten(karosse, mat.lack, s * 0.72, 1.16, 1.62, 0.05, 0.44, 0.5);
      kasten(karosse, mat.dunkel, s * 0.22, 0.94, 1.58, 0.07, 0.40, 0.18);
    });

    /* Auspuffrohre */
    [-1, 1].forEach(function (s) {
      teil(karosse, new T.CylinderGeometry(0.075, 0.09, 0.5, 8), mat.metall,
           s * 0.19, 0.80, 1.50, Math.PI / 2 - 0.22);
    });

    /* Bremslichter */
    var lichter = [-1, 1].map(function (s) {
      var m = new T.MeshBasicMaterial({ color: '#2a0806' });
      return kasten(karosse, m, s * 0.40, 0.50, 1.70, 0.20, 0.10, 0.05);
    });

    /* --- Fahrer --- */
    var fahrer = new T.Group();
    fahrer.position.set(0, 0, 0.06);
    karosse.add(fahrer);
    teil(fahrer, frustum(0.56, 0.44, 0.68, 0.40, 0.46), mat.anzug, 0, 0.92, 0.06, 0.25);
    teil(fahrer, frustum(0.30, 0.26, 0.34, 0.30, 0.22), mat.anzug, 0, 1.16, 0.14);      // Hals
    var kopf = new T.Group();
    kopf.position.set(0, 1.34, 0.10);
    fahrer.add(kopf);
    teil(kopf, new T.SphereGeometry(0.245, 12, 10), mat.zier, 0, 0, 0);                  // Helm
    kasten(kopf, mat.glas, 0, 0.01, -0.185, 0.31, 0.14, 0.13);                           // Visier
    kasten(kopf, mat.lack, 0, 0.20, 0.02, 0.09, 0.13, 0.40);                             // Helmstreifen
    [-1, 1].forEach(function (s) {                                                       // Arme zum Lenkrad
      teil(fahrer, frustum(0.16, 0.16, 0.13, 0.13, 0.52), mat.anzug,
           s * 0.26, 0.98, -0.22, -0.5, s * 0.22, 0);
      kasten(fahrer, mat.schwarz, s * 0.20, 0.94, -0.46, 0.13, 0.11, 0.12);              // Handschuh
    });
    var lenkrad = new T.Group();
    lenkrad.position.set(0, 0.95, -0.50);
    lenkrad.rotation.x = -0.55;
    fahrer.add(lenkrad);
    teil(lenkrad, new T.TorusGeometry(0.17, 0.035, 6, 14), mat.schwarz, 0, 0, 0);
    kasten(lenkrad, mat.zier, 0, 0, 0.01, 0.26, 0.05, 0.03);

    /* --- Raeder --- */
    var wheels = [];
    [[-0.92, -1.12, 0.50, 0.40], [0.92, -1.12, 0.50, 0.40],
     [-0.96, 1.26, 0.58, 0.54], [0.96, 1.26, 0.58, 0.54]].forEach(function (w, i) {
      var grp = new T.Group();
      grp.position.set(w[0], w[2], w[1]);
      grp.userData.y0 = w[2];
      var dreh = new T.Group();                    // dreht sich beim Fahren
      grp.add(dreh);
      var reifen = new T.CylinderGeometry(w[2], w[2], w[3], 14);
      reifen.rotateZ(Math.PI / 2);
      teil(dreh, reifen, mat.gummi, 0, 0, 0);
      var felge = new T.CylinderGeometry(w[2] * 0.58, w[2] * 0.58, w[3] * 1.02, 10);
      felge.rotateZ(Math.PI / 2);
      teil(dreh, felge, mat.zier, 0, 0, 0);
      var nabe = new T.CylinderGeometry(w[2] * 0.2, w[2] * 0.2, w[3] * 1.06, 8);
      nabe.rotateZ(Math.PI / 2);
      teil(dreh, nabe, mat.schwarz, 0, 0, 0);
      for (var sp = 0; sp < 5; sp++) {             // Speichen
        var s2 = kasten(dreh, mat.dunkel, 0, 0, 0, w[3] * 1.04, w[2] * 0.9, 0.07);
        s2.rotation.x = sp * Math.PI / 5;
      }
      var scheibe = new T.CylinderGeometry(w[2] * 0.42, w[2] * 0.42, 0.06, 10);
      scheibe.rotateZ(Math.PI / 2);
      teil(grp, scheibe, mat.metall, -Math.sign(w[0]) * w[3] * 0.55, 0, 0);
      grp.userData.dreh = dreh;
      /* Querlenker zum Chassis */
      var arm = kasten(karosse, mat.metall, w[0] * 0.55, w[2] * 0.85, w[1], Math.abs(w[0]) * 0.8, 0.06, 0.08);
      arm.rotation.y = w[0] > 0 ? 0.12 : -0.12;
      g.add(grp);
      wheels.push(grp);
    });

    /* Turboflammen */
    var flammen = [-1, 1].map(function (s) {
      var f = new T.Mesh(new T.ConeGeometry(0.2, 1.5, 7),
        new T.MeshBasicMaterial({ color: '#ffb03a' }));
      f.rotation.x = -Math.PI / 2;
      f.position.set(s * 0.19, 0.80, 2.05);
      f.visible = false;
      karosse.add(f);
      return f;
    });

    g.userData = { wheels: wheels, flammen: flammen, karosse: karosse,
                   fahrer: fahrer, kopf: kopf, lenkrad: lenkrad, lichter: lichter };
    return g;
  }

  function makeState(s, x, opts) {
    return Object.assign({
      s: s, x: x, phi: 0, v: 0, slide: 0, h: 0, vy: 0, air: false,
      boost: 0, drift: 0, driftDir: 0, charge: 0, slip: 0, touching: 0, wheel: 0,
      dv: 0, braking: 0,
      lap: 0, cp: 0, progress: 0, offtrack: 0, hitWall: 0, landed: 0, padSeen: -1, fell: 0,
      lapStart: 0, lastLap: 0, best: 0, name: 'Kart', finished: 0
    }, opts || {});
  }

  /* Ein Fahrschritt. inp: {gas, brake, steer, drift, hop} */
  function step(k, track, inp, dt) {
    var vVorher = k.v;
    var f = MK.track.frameAt(track, k.s, k._f || (k._f = null));
    k._f = f;
    var top = k.boost > 0 ? P.V_BOOST : P.V_TOP;

    /* Antrieb */
    var a = 0;
    if (inp.gas) a += P.ENGINE * Math.max(0, 1 - k.v / top);   // Schub endet an der Hoechstgeschwindigkeit
    if (inp.brake) a -= (k.v > 0.5 ? P.BRAKE : 16);
    if (!inp.gas && !inp.brake) a -= P.COAST * (k.v > 0 ? 1 : -1);
    if (k.boost > 0) a += 20;
    a -= P.G * P.SLOPE * f.t.y;                    // Steigung
    if (Math.abs(k.x) > f.half) a -= P.CURB;       // Randstein
    k.v += a * dt;
    if (k.v > top * 1.02) k.v -= (k.v - top) * 3 * dt;
    if (k.v < -14) k.v = -14;
    if (!inp.gas && !inp.brake && Math.abs(k.v) < 0.4) k.v = 0;

    /* Lenkung */
    var grip = clamp(Math.abs(k.v) / 13, 0, 1);
    var rate = P.STEER * (k.drift > 0 ? P.DRIFT_STEER : 1) * grip * (1 - 0.3 * clamp(k.v / P.V_TOP, 0, 1));
    if (k.v < 0) rate = -rate;
    k.phi += inp.steer * rate * dt;
    if (Math.abs(inp.steer) < 0.15 && k.drift <= 0) k.phi -= k.phi * P.ALIGN * dt;
    if (k.drift > 0) k.phi += k.driftDir * 0.2 * dt;      // treibt sanft nach aussen
    var phiMax = P.PHI_MAX * (1 - 0.38 * clamp(Math.abs(k.v) / P.V_TOP, 0, 1));
    k.phi = clamp(k.phi, -phiMax, phiMax);
    var slipWant = k.drift > 0 ? k.driftDir * P.SLIP_MAX * clamp(k.v / 26, 0, 1) : 0;
    k.slip += (slipWant - k.slip) * Math.min(1, dt * 6);

    /* Vortrieb entlang der Strecke, Querversatz */
    var ds = k.v * Math.cos(k.phi) * dt;
    var corr = clamp(1 + k.x * f.yaw, 0.6, 1.4);
    k.s += ds / corr;
    k.phi -= f.yaw * ds;
    var latG = -P.G * f.r.y * 0.42 * Math.max(0, f.u.y);
    k.slide = (k.slide + latG * dt) * Math.exp(-P.GRIP * dt);
    k.x += (-k.v * Math.sin(k.phi) + k.slide) * dt;

    /* Randstein und Leitplanke */
    var wall = f.half + P.WALL;
    k.offtrack = Math.max(0, Math.abs(k.x) - f.half);
    if (Math.abs(k.x) > wall) {
      var into = -k.v * Math.sin(k.phi) + k.slide;      // Quergeschwindigkeit
      if (!k.touching && (k.x > 0) === (into > 0)) {    // einmaliger Anprall
        k.v *= 1 - 0.22 * clamp(Math.abs(into) / 14, 0, 1);
        k.hitWall = Math.max(k.hitWall, clamp(Math.abs(into) / 12, 0.15, 1));
      }
      k.x = k.x > 0 ? wall : -wall;
      k.slide *= -0.25;
      k.phi *= 0.75;
      k.v -= 6 * dt;                                    // Schleifen an der Planke
      k.touching = 1;
    } else k.touching = 0;
    k.hitWall = Math.max(0, k.hitWall - dt * 3);

    /* Sprung: Bahn hebt ab, wenn die Kuppe schneller faellt als die Schwerkraft zieht */
    var aRel = -(k.v * k.v * f.vk) - Math.max(P.G * f.u.y, P.DOWN);
    if (inp.hop && !k.air && k.h <= 0.001) { k.air = true; k.vy = 6.2; }
    if (!k.air && aRel > 0 && k.v > 8) { k.air = true; k.vy = 0; }
    if (!k.air && f.gap) { k.air = true; k.vy = 0; }      // ueber der Schlucht faellt der Boden weg
    if (k.air) {
      k.vy += aRel * dt;
      k.h += k.vy * dt;
      if (f.gap) {
        if (k.h < -2) k.fell = 1;                         // unter die Flugbahn gesackt
      } else if (k.h <= 0) {
        k.h = 0; k.air = false; k.landed = 0.22; k.v *= 0.985; k.vy = 0;
      }
    }
    k.landed = Math.max(0, k.landed - dt);

    /* Drift und Mini-Turbo */
    if (inp.drift && k.v > 14 && !k.air) {
      if (k.drift <= 0 && Math.abs(inp.steer) > 0.2) { k.drift = 1; k.driftDir = inp.steer > 0 ? 1 : -1; }
      /* Geladen wird nur, solange wirklich in die Driftrichtung gelenkt wird -
         sonst liesse sich auf der Geraden endlos Turbo nachladen. */
      if (k.drift > 0 && inp.steer * k.driftDir > 0.25) k.charge += dt * clamp(k.v / 30, 0, 1.3);
    } else if (k.drift > 0) {
      if (k.charge > 0.8) k.boost = Math.max(k.boost, 0.45 + Math.min(k.charge, 2.4) * 0.35);
      k.drift = 0; k.charge = 0; k.driftDir = 0;
    }
    if (k.drift > 0) k.v -= 1.4 * dt;

    k.boost = Math.max(0, k.boost - dt);
    k.wheel += k.v * dt * 1.6;
    /* nur fuer die Darstellung: geglaettete Laengsbeschleunigung und Bremslicht */
    k.dv = k.dv * 0.88 + ((k.v - vVorher) / dt) * 0.12;
    k.braking = inp.brake ? 1 : 0;
    if (track.open) {
      if (k.s < 0) { k.s = 0; if (k.v < 0) k.v = 0; }
      if (k.s > track.length) k.s = track.length;
    } else {
      k.s = (k.s % track.length + track.length) % track.length;
    }
    return f;
  }

  /* Kart-Objekt an die Streckenlage setzen */
  var _m = new T.Matrix4(), _q = new T.Quaternion();
  var _fw = new V3(), _up = new V3(), _rt = new V3();
  function place(obj, k, f, extraRoll, slip) {
    var yaw = k.phi + (slip || 0);
    _up.copy(f.u);
    _fw.copy(f.t).multiplyScalar(Math.cos(yaw))
       .addScaledVector(new V3().crossVectors(f.u, f.t), Math.sin(yaw)).normalize();
    if (extraRoll) _up.copy(MK.track.rotAxis(_up, _fw, extraRoll));
    _rt.crossVectors(_fw, _up).normalize();
    _up.crossVectors(_rt, _fw).normalize();
    obj.position.copy(f.p)
       .addScaledVector(f.r, k.x)
       .addScaledVector(f.u, k.h + 0.02);
    _m.makeBasis(_rt, _up, _fw.clone().negate());
    _q.setFromRotationMatrix(_m);
    obj.quaternion.copy(_q);
    var ud = obj.userData, i;
    var steerAng = clamp(k.phi * 0.75, -0.55, 0.55) + (k.drift > 0 ? k.driftDir * 0.3 : 0);
    if (ud.wheels) {
      var einfedern = k.landed * 0.55;                        // Landung drueckt ein
      var nicken = clamp(k.dv * 0.004, -0.05, 0.05);
      for (i = 0; i < 4; i++) {
        var rad = ud.wheels[i];
        var vorne = i < 2;
        rad.position.y = rad.userData.y0 - einfedern * (vorne ? 0.6 : 1) +
                         (vorne ? -nicken : nicken) * 1.2;
        rad.userData.dreh.rotation.x = -k.wheel;
        if (vorne) rad.rotation.y = steerAng;
      }
      if (ud.karosse) {
        ud.karosse.rotation.x = -nicken * 0.8 - einfedern * 0.12;
        ud.karosse.rotation.z = clamp(k.slide * 0.004 + (k.drift > 0 ? k.driftDir * 0.05 : 0), -0.09, 0.09);
        ud.karosse.position.y = -einfedern * 0.35;
      }
    }
    if (ud.lenkrad) ud.lenkrad.rotation.z = -steerAng * 1.7;
    if (ud.kopf) { ud.kopf.rotation.y = steerAng * 0.45; ud.kopf.rotation.z = -steerAng * 0.12; }
    if (ud.lichter) {
      var hell = k.braking ? 1 : (k.v < -0.5 ? 0.6 : 0);
      for (i = 0; i < ud.lichter.length; i++) {
        ud.lichter[i].material.color.setRGB(0.16 + hell * 0.84, 0.03 + hell * 0.14, 0.02 + hell * 0.06);
      }
    }
    if (ud.flammen) {
      for (i = 0; i < ud.flammen.length; i++) {
        ud.flammen[i].visible = k.boost > 0;
        if (k.boost > 0) {
          var f2 = 0.7 + Math.random() * 0.6;
          ud.flammen[i].scale.set(1, f2, 1);
          ud.flammen[i].material.color.setHSL(0.08 - Math.random() * 0.05, 1, 0.55 + Math.random() * 0.2);
        }
      }
    }
  }

  /* Turbofeld unter dem Kart? Gibt den Index zurueck (oder -1) und setzt den
     Schub. k.padSeen verhindert mehrfaches Ausloesen auf demselben Feld. */
  var PAD_R = 7;
  function pads(k, track) {
    var L = track.length, hit = -1;
    for (var i = 0; i < track.pads.length; i++) {
      if (Math.abs((k.s - track.pads[i] + L * 1.5) % L - L * 0.5) < PAD_R) { hit = i; break; }
    }
    var fresh = hit >= 0 && k.padSeen !== hit;
    k.padSeen = hit;
    if (fresh) k.boost = Math.max(k.boost, 1.5);
    return fresh ? hit : -1;
  }

  /* Autopilot: Pure Pursuit auf einen Punkt voraus - fuer die Gegner
   * und fuer den Streckentest. */
  var _t1 = null, _d = new V3(), _tp = new V3();
  function autopilot(k, track, opt) {
    opt = opt || {};
    var f = k._f || MK.track.frameAt(track, k.s);
    var look = 14 + k.v * 0.62;
    _t1 = MK.track.frameAt(track, k.s + look, _t1);
    var line = (opt.line || 0) + (opt.weave ? Math.sin(k.s * 0.012 + (opt.phase || 0)) * opt.weave : 0);
    _tp.copy(_t1.p).addScaledVector(_t1.r, clamp(line, -1, 1) * _t1.half * 0.55 * _t1.w);
    _d.subVectors(_tp, f.p).addScaledVector(f.r, -k.x);
    var lateral = _d.dot(f.r), forward = Math.max(6, _d.dot(f.t));
    var want = -Math.atan2(lateral, forward);
    var steer = clamp((want - k.phi) * 3.2, -1, 1);

    /* Wunschtempo aus der schaerfsten Kruemmung voraus */
    var worst = 0, narrow = 1;
    for (var d2 = 8; d2 < 120; d2 += 11) {
      var ff = MK.track.frameAt(track, k.s + d2, _t1);
      worst = Math.max(worst, Math.abs(ff.yaw) * (1 - d2 / 190));
      narrow = Math.min(narrow, ff.w);
    }
    if (narrow < 0.95) steer *= 1.1;                 // im Looping mittig bleiben
    var vT = Math.min(opt.top || P.V_TOP, Math.sqrt(42 / Math.max(worst, 1e-4)));
    return { gas: k.v < vT ? 1 : 0, brake: k.v > vT * 1.14 ? 1 : 0, steer: steer,
             drift: 0, hop: 0, vT: vT };
  }

  MK.kart = { make: makeKart, state: makeState, step: step, place: place,
              autopilot: autopilot, pads: pads, P: P, clamp: clamp };
})(typeof window !== 'undefined' ? window : global);
