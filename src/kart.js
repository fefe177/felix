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

  function makeKart(paint, accent) {
    var g = new T.Group();
    var body = new T.MeshLambertMaterial({ color: paint });
    var dark = new T.MeshLambertMaterial({ color: '#23262e' });
    var trim = new T.MeshLambertMaterial({ color: accent });
    var glass = new T.MeshLambertMaterial({ color: '#2a3550' });

    function add(geo, mat, x, y, z, sx, sy, sz) {
      var m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (sx !== undefined) m.scale.set(sx, sy, sz);
      g.add(m); return m;
    }
    var box = new T.BoxGeometry(1, 1, 1);
    add(box, body, 0, 0.52, 0, 1.75, 0.5, 3.0);           // Wanne
    add(box, body, 0, 0.86, 0.95, 1.35, 0.42, 0.9);       // Motorhaube hinten
    add(box, trim, 0, 0.80, -1.24, 1.5, 0.26, 0.6);       // Nase
    add(box, dark, 0, 1.28, 1.42, 1.5, 0.12, 0.5);        // Heckfluegel
    add(box, dark, -0.62, 1.02, 1.4, 0.12, 0.42, 0.4);
    add(box, dark, 0.62, 1.02, 1.4, 0.12, 0.42, 0.4);
    add(box, dark, 0, 0.90, -0.15, 1.1, 0.3, 0.8);        // Sitz
    add(box, trim, 0, 1.16, 0.42, 0.9, 0.5, 0.16);        // Sitzlehne

    var driver = new T.Group();
    var torso = new T.Mesh(box, new T.MeshLambertMaterial({ color: '#e8e4dc' }));
    torso.scale.set(0.66, 0.62, 0.5); torso.position.y = 1.25; driver.add(torso);
    var head = new T.Mesh(new T.SphereGeometry(0.34, 10, 8), trim);
    head.position.y = 1.78; driver.add(head);
    var visor = new T.Mesh(box, glass);
    visor.scale.set(0.5, 0.18, 0.12); visor.position.set(0, 1.78, -0.28); driver.add(visor);
    driver.position.z = 0.05;
    g.add(driver);

    var wheelGeo = new T.CylinderGeometry(0.52, 0.52, 0.42, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    var hubGeo = new T.CylinderGeometry(0.26, 0.26, 0.46, 6);
    hubGeo.rotateZ(Math.PI / 2);
    var wheels = [];
    [[-0.98, -1.05], [0.98, -1.05], [-1.0, 1.15], [1.0, 1.15]].forEach(function (w, i) {   // vorne, vorne, hinten, hinten
      var grp = new T.Group();
      grp.position.set(w[0], 0.52, w[1]);
      var tire = new T.Mesh(wheelGeo, dark);
      var hub = new T.Mesh(hubGeo, trim);
      grp.add(tire); grp.add(hub);
      if (i > 1) grp.scale.set(1.18, 1.18, 1.18);
      g.add(grp); wheels.push(grp);
    });

    var flame = new T.Mesh(new T.ConeGeometry(0.42, 1.9, 7),
      new T.MeshBasicMaterial({ color: '#ffb03a' }));
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, 0.72, 2.1);
    flame.visible = false;
    g.add(flame);

    g.userData = { wheels: wheels, flame: flame, driver: driver };
    return g;
  }

  function makeState(s, x, opts) {
    return Object.assign({
      s: s, x: x, phi: 0, v: 0, slide: 0, h: 0, vy: 0, air: false,
      boost: 0, drift: 0, driftDir: 0, charge: 0, slip: 0, touching: 0, wheel: 0,
      lap: 0, cp: 0, progress: 0, offtrack: 0, hitWall: 0, landed: 0,
      lapStart: 0, lastLap: 0, best: 0, name: 'Kart', finished: 0
    }, opts || {});
  }

  /* Ein Fahrschritt. inp: {gas, brake, steer, drift, hop} */
  function step(k, track, inp, dt) {
    var f = MK.track.frameAt(track, k.s, k._f || (k._f = null));
    k._f = f;
    var top = k.boost > 0 ? P.V_BOOST : P.V_TOP;

    /* Antrieb */
    var a = 0;
    if (inp.gas) a += P.ENGINE * Math.max(0.12, 1 - k.v / top);
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
    k.phi = clamp(k.phi, -P.PHI_MAX, P.PHI_MAX);
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
    if (k.air) {
      k.vy += aRel * dt;
      k.h += k.vy * dt;
      if (k.h <= 0) { k.h = 0; k.air = false; k.landed = 0.22; k.v *= 0.985; k.vy = 0; }
    }
    k.landed = Math.max(0, k.landed - dt);

    /* Drift und Mini-Turbo */
    if (inp.drift && k.v > 14 && !k.air) {
      if (k.drift <= 0 && Math.abs(inp.steer) > 0.2) { k.drift = 1; k.driftDir = inp.steer > 0 ? 1 : -1; }
      if (k.drift > 0) k.charge += dt * clamp(k.v / 30, 0, 1.4);
    } else if (k.drift > 0) {
      if (k.charge > 0.55) k.boost = Math.max(k.boost, 0.55 + Math.min(k.charge, 2.2) * 0.42);
      k.drift = 0; k.charge = 0; k.driftDir = 0;
    }
    if (k.drift > 0) k.v -= 1.4 * dt;

    k.boost = Math.max(0, k.boost - dt);
    k.wheel += k.v * dt * 1.6;
    k.s = (k.s % track.length + track.length) % track.length;
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
    var w = obj.userData.wheels;
    if (w) {
      var steerAng = clamp(k.phi * 0.75, -0.55, 0.55) + (k.drift > 0 ? k.driftDir * 0.3 : 0);
      w[0].rotation.y = steerAng; w[1].rotation.y = steerAng;
      for (var i = 0; i < 4; i++) w[i].children[0].rotation.x = -k.wheel;
    }
    if (obj.userData.flame) obj.userData.flame.visible = k.boost > 0;
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
              autopilot: autopilot, P: P, clamp: clamp };
})(typeof window !== 'undefined' ? window : global);
