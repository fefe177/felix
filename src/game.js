/* Schleifental GP - Spielkern: Szene, Rennlogik, Kamera, Gegner, Eingabe. */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};
  var T = root.THREE;
  var V3 = T.Vector3;
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

  /* Rundenzahl per Adresszeile: index.html?runden=1 */
  var LAPS = (function () {
    var m = /(?:\?|&)runden=(\d+)/.exec(root.location ? root.location.search : '');
    var n = m ? parseInt(m[1], 10) : 3;
    return n >= 1 && n <= 9 ? n : 3;
  })();
  var FIELD = [
    { name: 'DU',      paint: '#e2453b', accent: '#ffd23f', top: 46.0, line:  0.0 },
    { name: 'BLITZ',   paint: '#2f7fe0', accent: '#eef3ff', top: 43.6, line: -0.5 },
    { name: 'KAKTUS',  paint: '#3fb56b', accent: '#0f1a14', top: 43.0, line:  0.5 },
    { name: 'ZITRONE', paint: '#f0bd2e', accent: '#2a2410', top: 42.4, line: -0.2 }
  ];

  var G = {
    state: 'intro', time: 0, t0: 0, countdown: 0, camMode: 0, paused: false,
    shake: 0, introS: 0, dtAcc: 0
  };
  var scene, camera, renderer, track, karts = [], player, padMesh, sceneryRefs;
  var input = { gas: 0, brake: 0, steer: 0, drift: 0, hop: 0 };
  var keys = {}, touch = { steer: 0, gas: 0, brake: 0, drift: 0 };
  var tmpF = null, tmpF2 = null;
  var camPos = new V3(), camUp = new V3(0, 1, 0), camLook = new V3();
  var seedV = 20260902;
  function rnd() { seedV = (seedV * 1664525 + 1013904223) % 4294967296; return seedV / 4294967296; }

  function init() {
    var host = document.getElementById('app');
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.85));
    renderer.setSize(root.innerWidth, root.innerHeight);
    host.appendChild(renderer.domElement);

    scene = new T.Scene();
    scene.fog = new T.Fog(new T.Color('#cfe3f0'), 420, 2600);
    camera = new T.PerspectiveCamera(64, root.innerWidth / root.innerHeight, 0.5, 6000);

    scene.add(new T.HemisphereLight(new T.Color('#dcefff'), new T.Color('#5d7f45'), 0.72));
    var sun = new T.DirectionalLight(0xfff2dc, 0.85);
    sun.position.set(-420, 640, 320);
    scene.add(sun);
    var rim = new T.DirectionalLight(0x9ec8ff, 0.28);
    rim.position.set(380, 220, -420);
    scene.add(rim);
    var fill = new T.DirectionalLight(0xbfd8c0, 0.3);   // hebt die Unterseiten der Loopings
    fill.position.set(120, -400, -80);
    scene.add(fill);

    track = MK.track.build();
    var built = MK.world.buildTrack(track);
    scene.add(built.group);
    padMesh = built.padMesh;
    sceneryRefs = MK.world.buildScenery(scene, track, rnd);

    /* Startaufstellung: zwei Reihen hinter der Linie */
    FIELD.forEach(function (spec, i) {
      var obj = MK.kart.make(spec.paint, spec.accent);
      scene.add(obj);
      var st = MK.kart.state(track.length - 14 - Math.floor(i / 2) * 11,
                             (i % 2 ? 1 : -1) * 4.2, { name: spec.name });
      st.top = spec.top; st.line = spec.line; st.phase = i * 2.1;
      var shadow = new T.Mesh(new T.CircleGeometry(1.6, 12),
        new T.MeshBasicMaterial({ color: 0x0b0f16, transparent: true, opacity: 0.32, depthWrite: false }));
      scene.add(shadow);
      karts.push({ obj: obj, st: st, color: spec.paint, ai: i > 0, shadow: shadow,
                   sector: 4, prevPad: -1, spark: makeSparks(scene) });
    });
    player = karts[0];
    player.st.name = 'DU';

    MK.hud.init(track, LAPS);
    bindInput();
    resize();
    root.addEventListener('resize', resize);
    reset(true);
    requestAnimationFrame(frame);
  }

  function makeSparks(sc) {
    var g = new T.Group();
    var geo = new T.OctahedronGeometry(0.3, 0);
    for (var i = 0; i < 6; i++) {
      var m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: '#ffffff' }));
      m.visible = false;
      g.add(m);
    }
    sc.add(g);
    return g;
  }

  function resize() {
    camera.aspect = root.innerWidth / root.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(root.innerWidth, root.innerHeight);
  }

  /* ------------------------------------------------------------------ */
  function reset(intro) {
    karts.forEach(function (k, i) {
      var st = k.st;
      st.s = track.length - 14 - Math.floor(i / 2) * 11;
      st.x = (i % 2 ? 1 : -1) * 4.2;
      st.v = 0; st.phi = 0; st.slide = 0; st.h = 0; st.vy = 0; st.air = false;
      st.boost = 0; st.drift = 0; st.charge = 0; st.lap = 0; st.finished = 0;
      st.lapStart = 0; st.lastLap = 0;
      k.sector = 4; k.prevPad = -1;
      var f = MK.track.frameAt(track, st.s);
      MK.kart.place(k.obj, st, f, 0);
    });
    G.time = 0;
    G.state = intro ? 'intro' : 'countdown';
    G.countdown = 3.999;
    G.introS = track.length * 0.02;
    document.getElementById('startPanel').classList.toggle('is-on', !!intro);
    document.getElementById('results').classList.remove('is-on');
    MK.hud.countdown('');
  }

  function startRace() {
    document.getElementById('startPanel').classList.remove('is-on');
    MK.hud.audio.init();
    G.state = 'countdown';
    G.countdown = 3.999;
  }

  /* ------------------------------------------------------------------ */
  function bindInput() {
    root.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var k = e.key.toLowerCase();
      keys[k] = true;
      if (k === ' ') e.preventDefault();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
      if (k === 'enter') {
        if (G.state === 'intro') startRace();
        else if (G.state === 'finish') reset(false);
      }
      if (k === 'r' && G.state === 'race') respawn(player);
      if (k === 'c') { G.camMode = (G.camMode + 1) % 3; MK.hud.message(['VERFOLGER', 'WEIT', 'COCKPIT'][G.camMode], 'info', 1.1); }
      if (k === 'm') MK.hud.message(MK.hud.audio.setMuted(!MK.hud.audio.isMuted()) ? 'TON AUS' : 'TON AN', 'info', 1.1);
      if (k === 'p' && (G.state === 'race')) { G.paused = !G.paused; MK.hud.message(G.paused ? 'PAUSE' : '', 'info', G.paused ? 99 : 0.1); }
    });
    root.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
    root.addEventListener('blur', function () { keys = {}; });

    document.getElementById('startBtn').addEventListener('click', startRace);
    document.getElementById('againBtn').addEventListener('click', function () { reset(false); });

    /* Touch */
    var pads = document.querySelectorAll('[data-touch]');
    Array.prototype.forEach.call(pads, function (el) {
      var what = el.dataset.touch;
      function on(e) { e.preventDefault(); el.classList.add('is-down'); MK.hud.audio.init();
        if (what === 'left') touch.steer = 1; else if (what === 'right') touch.steer = -1; else touch[what] = 1; }
      function off(e) { e.preventDefault(); el.classList.remove('is-down');
        if (what === 'left' || what === 'right') touch.steer = 0; else touch[what] = 0; }
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    });
    if (root.matchMedia('(pointer: coarse)').matches) document.body.classList.add('is-touch');
  }

  function readInput() {
    var left = keys['arrowleft'] || keys['a'] ? 1 : 0;
    var right = keys['arrowright'] || keys['d'] ? 1 : 0;
    input.gas = (keys['arrowup'] || keys['w'] || touch.gas) ? 1 : 0;
    input.brake = (keys['arrowdown'] || keys['s'] || touch.brake) ? 1 : 0;
    input.steer = clamp(left - right + touch.steer, -1, 1);
    var d = (keys[' '] || keys['shift'] || touch.drift) ? 1 : 0;
    input.hop = d && !input.drift ? 1 : 0;
    input.drift = d;
    return input;
  }

  /* ------------------------------------------------------------------ */
  function respawn(k) {
    var st = k.st;
    var back = track.length * (k.sector / 5);
    st.s = back; st.x = 0; st.v = 12; st.phi = 0; st.slide = 0;
    st.h = 0; st.vy = 0; st.air = false; st.drift = 0; st.charge = 0;
    MK.hud.message('ZURÜCK AUF DIE STRECKE', 'warn', 1.3);
  }

  function sectorLap(k, dt) {
    var st = k.st, L = track.length;
    var sec = Math.floor(st.s / (L / 5));
    if (sec === (k.sector + 1) % 5) {
      k.sector = sec;
      if (sec === 0) {
        st.lap++;
        if (!k.ai) {
          var t = G.time - st.lapStart;
          if (st.lap > 1) {
            st.lastLap = t;
            if (!st.best || t < st.best) { st.best = t; MK.hud.message('BESTE RUNDE ' + MK.hud.fmtTime(t), 'good', 2); }
            else MK.hud.message('RUNDE ' + MK.hud.fmtTime(t), 'info', 1.6);
          }
          st.lapStart = G.time;
          if (st.lap >= LAPS + 1) finish();
          else if (st.lap === LAPS) MK.hud.message('LETZTE RUNDE!', 'warn', 2.2);
          MK.hud.audio.blip(660, 0.12, 'square', 0.12);
        } else if (st.lap >= LAPS + 1) st.finished = 1;
      }
    }
    st.progress = st.lap * L + st.s;
  }

  function finish() {
    G.state = 'finish';
    var order = karts.slice().sort(function (a, b) { return b.st.progress - a.st.progress; });
    var place = order.indexOf(player) + 1;
    document.getElementById('resPlace').textContent = place + '.';
    document.getElementById('resTotal').textContent = MK.hud.fmtTime(G.time);
    document.getElementById('resBest').textContent = MK.hud.fmtTime(player.st.best);
    document.getElementById('resHead').textContent =
      place === 1 ? 'SIEG' : (place === 2 ? 'ZWEITER' : (place === 3 ? 'DRITTER' : 'VIERTER'));
    document.getElementById('results').classList.add('is-on');
    MK.hud.audio.blip(880, 0.4, 'triangle', 0.2);
    setTimeout(function () { MK.hud.audio.blip(1320, 0.5, 'triangle', 0.18); }, 180);
  }

  /* Turbofelder */
  var PAD_R = 7;                       // Wirkradius eines Turbofelds in Metern
  function checkPads(k) {
    var st = k.st, L = track.length;
    for (var i = 0; i < track.pads.length; i++) {
      var d = Math.abs((st.s - track.pads[i] + L * 1.5) % L - L * 0.5);   // Abstand ueber die Runde hinweg
      if (d < PAD_R) {
        if (k.prevPad !== i) {
          k.prevPad = i;
          st.boost = Math.max(st.boost, 1.5);
          if (!k.ai) {
            MK.hud.message('TURBO!', 'good', 1);
            MK.hud.audio.noise(0.4, 0.22);
          }
        }
        return;
      }
    }
    k.prevPad = -1;
  }

  function kartCollisions() {
    for (var i = 0; i < karts.length; i++) {
      for (var j = i + 1; j < karts.length; j++) {
        var a = karts[i].st, b = karts[j].st;
        var ds = a.s - b.s;
        if (Math.abs(ds) > track.length / 2) ds -= Math.sign(ds) * track.length;
        if (Math.abs(ds) > 3.4) continue;
        var dx = a.x - b.x;
        if (Math.abs(dx) > 2.9) continue;
        var push = (2.9 - Math.abs(dx)) * 0.5 * (dx >= 0 ? 1 : -1);
        a.x += push; b.x -= push;
        var m = (a.v + b.v) / 2;
        a.v = a.v * 0.72 + m * 0.28; b.v = b.v * 0.72 + m * 0.28;
        if ((!karts[i].ai || !karts[j].ai)) MK.hud.audio.blip(140, 0.09, 'square', 0.14);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  var camFrame = null;
  function updateCamera(dt) {
    var st = player.st, f = st._f;
    if (!f) return;
    var dist = G.camMode === 1 ? 15.5 : (G.camMode === 2 ? 1.4 : 9.6);
    var high = G.camMode === 1 ? 6.2 : (G.camMode === 2 ? 2.3 : 3.7);
    /* Die Kamera haengt nicht starr hinter dem Kart, sondern sitzt auf der
       Strecke selbst - sonst schneidet sie im Looping durch die Fahrbahn. */
    camFrame = MK.track.frameAt(track, st.s - dist, camFrame);
    var up = new V3().copy(camFrame.u);
    var fwd = new V3().copy(f.t).multiplyScalar(Math.cos(st.phi * 0.55))
      .addScaledVector(new V3().crossVectors(f.u, f.t), Math.sin(st.phi * 0.55)).normalize();
    var base = new V3().copy(player.obj.position);
    var want = new V3().copy(camFrame.p)
      .addScaledVector(camFrame.r, st.x * 0.55)
      .addScaledVector(up, high + st.h * 0.6);
    var lag = 1 - Math.exp(-(G.camMode === 2 ? 30 : 13) * dt);
    camPos.lerp(want, lag);
    camUp.lerp(up, 1 - Math.exp(-11 * dt)).normalize();
    camLook.lerp(base.clone().addScaledVector(fwd, 12).addScaledVector(up, 1.6), 1 - Math.exp(-16 * dt));
    camera.position.copy(camPos);
    if (G.shake > 0) {
      camera.position.x += (rnd() - 0.5) * G.shake;
      camera.position.y += (rnd() - 0.5) * G.shake;
      camera.position.z += (rnd() - 0.5) * G.shake;
      G.shake = Math.max(0, G.shake - dt * 2.4);
    }
    camera.up.copy(camUp);
    camera.lookAt(camLook);
    var want2 = 62 + clamp(Math.abs(st.v) / 46, 0, 1.3) * 13 + (st.boost > 0 ? 9 : 0);
    camera.fov += (want2 - camera.fov) * Math.min(1, dt * 5);
    camera.updateProjectionMatrix();
  }

  function introCamera(dt) {
    G.introS += dt * 26;
    tmpF = MK.track.frameAt(track, G.introS, tmpF);
    tmpF2 = MK.track.frameAt(track, G.introS + 48, tmpF2);
    camera.position.copy(tmpF.p)
      .addScaledVector(MK.track.UP, 26)
      .addScaledVector(tmpF.r, 52 * Math.sin(G.introS * 0.0016));
    camera.up.set(0, 1, 0);
    camera.lookAt(tmpF2.p.x, tmpF2.p.y + 6, tmpF2.p.z);
    if (G.introS > track.length) G.introS -= track.length;
  }

  function updateSparks(k) {
    var st = k.st, g = k.spark, on = st.drift > 0 && Math.abs(st.v) > 12;
    var lvl = st.charge > 1.6 ? 2 : (st.charge > 0.55 ? 1 : 0);
    var col = ['#fff3d0', '#ff9c2a', '#5fd0ff'][lvl];
    for (var i = 0; i < g.children.length; i++) {
      var m = g.children[i];
      m.visible = on;
      if (!on) continue;
      m.material.color.set(col);
      var side = i < 3 ? -1 : 1;
      m.position.copy(k.obj.position)
        .addScaledVector(k.obj.getWorldDirection(new V3()), -(1.4 + rnd() * 1.6))
        .addScaledVector(new V3().setFromMatrixColumn(k.obj.matrixWorld, 0), side * (0.9 + rnd() * 0.5))
        .addScaledVector(new V3().setFromMatrixColumn(k.obj.matrixWorld, 1), 0.2 + rnd() * 0.4);
      m.scale.setScalar(0.4 + rnd() * (0.5 + lvl * 0.3));
    }
  }

  /* ------------------------------------------------------------------ */
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - (G.t0 || now)) / 1000);   // bei Rucklern lieber grosse Schritte als Zeitlupe
    G.t0 = now;
    if (dt <= 0) return;
    var real = (now - (G.tPrev || now)) / 1000; G.tPrev = now;
    if (real > 0) G.fps = G.fps ? G.fps * 0.92 + (1 / real) * 0.08 : 1 / real;

    if (G.state === 'intro') {
      introCamera(dt);
      sceneryRefs.clouds.rotation.y += dt * 0.004;
      MK.hud.drawMini(karts, 0);
      renderer.render(scene, camera);
      return;
    }

    if (G.state === 'countdown') {
      G.countdown -= dt;
      var n = Math.ceil(G.countdown);
      if (n !== G._lastN) {
        G._lastN = n;
        MK.hud.countdown(n > 0 ? String(n) : 'LOS!');
        MK.hud.audio.blip(n > 0 ? 440 : 880, n > 0 ? 0.12 : 0.35, 'square', 0.16);
      }
      if (G.countdown <= 0) {
        G.state = 'race';
        G.time = 0;
        karts.forEach(function (k) { k.st.lapStart = 0; });
        setTimeout(function () { MK.hud.countdown(''); }, 500);
      }
    }

    var racing = G.state === 'race' && !G.paused;
    if (racing) G.time += dt;

    /* Physik in festen Schritten - stabil auch bei Ruckeln */
    G.dtAcc += dt;
    var STEP = 1 / 120, guard = 0;
    while (G.dtAcc >= STEP && guard++ < 14) {
      G.dtAcc -= STEP;
      stepWorld(STEP, racing);
    }

    karts.forEach(function (k) {
      var f = k.st._f || MK.track.frameAt(track, k.st.s);
      var roll = (k.st.drift > 0 ? -k.st.driftDir * 0.16 : 0) + clamp(-k.st.slide * 0.012, -0.12, 0.12);
      MK.kart.place(k.obj, k.st, f, roll, k.st.slip);
      k.shadow.position.copy(f.p).addScaledVector(f.r, k.st.x).addScaledVector(f.u, 0.06);
      k.shadow.quaternion.copy(k.obj.quaternion);
      k.shadow.rotateX(-Math.PI / 2);
      var sc = clamp(1 - k.st.h / 9, 0.35, 1);
      k.shadow.scale.setScalar(sc);
      k.shadow.material.opacity = 0.34 * sc;
      updateSparks(k);
    });

    updateCamera(dt);
    sceneryRefs.clouds.rotation.y += dt * 0.004;
    padMesh.material.emissiveIntensity = 0.35 + Math.sin(now / 260) * 0.22;

    /* Anzeige */
    var st = player.st;
    var order = karts.slice().sort(function (a, b) { return b.st.progress - a.st.progress; });
    var wrong = Math.cos(st.phi) < -0.25 && Math.abs(st.v) > 4;
    MK.hud.update({
      v: st.v, boostOn: st.boost > 0, charge: st.boost > 0 ? st.boost / 1.6 : st.charge / 2.2,
      chargeLevel: st.boost > 0 ? 4 : (st.charge > 1.6 ? 3 : (st.charge > 0.55 ? 2 : 1)),
      lap: st.lap, laps: LAPS, time: G.time, best: st.best, last: st.lastLap,
      place: order.indexOf(player) + 1, field: karts.length, wrongWay: wrong
    }, dt);
    MK.hud.drawMini(karts, 0);
    if (!MK.hud.audio.isMuted() && G.state !== 'intro') {
      MK.hud.audio.engine(clamp(Math.abs(st.v) / 46, 0, 1.4), st.boost > 0 ? 1 : (input.gas ? 0.6 : 0.2));
    }
    renderer.render(scene, camera);
  }

  function stepWorld(dt, racing) {
    var inp = readInput();
    var frozen = !racing;
    karts.forEach(function (k) {
      var st = k.st;
      var kin;
      if (k.ai) {
        var rubber = clamp(1 + (player.st.progress - st.progress) / 900, 0.9, 1.12);
        kin = MK.kart.autopilot(st, track, { top: st.top * rubber, line: st.line, weave: 0.35, phase: st.phase });
        if (st.v > 24 && Math.abs(kin.steer) > 0.45 && rnd() < 0.02) kin.drift = 1;
      } else {
        kin = inp;
      }
      if (frozen || st.finished) {
        kin = { gas: 0, brake: G.state === 'countdown' ? 0 : 1, steer: 0, drift: 0, hop: 0 };
        if (G.state === 'countdown') { st.v *= 0.9; }
      }
      var wallBefore = st.hitWall;
      MK.kart.step(st, track, kin, dt);
      if (!k.ai && st.hitWall > wallBefore + 0.1) {
        G.shake = Math.min(0.9, G.shake + st.hitWall * 0.5);
        MK.hud.audio.blip(90, 0.12, 'square', 0.12 * st.hitWall);
      }
      if (racing) { checkPads(k); sectorLap(k, dt); }
    });
    if (racing) kartCollisions();
  }

  /* Kurzer Statusabruf (Konsole / Test) */
  function status() {
    var st = player.st;
    return { state: G.state, zeit: +G.time.toFixed(2), runde: st.lap,
             tempo: +(st.v * 3.6).toFixed(0), meter: +st.s.toFixed(0),
             quer: +st.x.toFixed(1), hoehe: +st.h.toFixed(1),
             ueberKopf: st._f ? st._f.u.y < 0 : false,
             turbo: +st.boost.toFixed(2), ladung: +st.charge.toFixed(2), drift: st.drift > 0,
             platz: karts.slice().sort(function (a, b) { return b.st.progress - a.st.progress; }).indexOf(player) + 1,
             fps: G.fps ? Math.round(G.fps) : 0 };
  }
  MK.game = { init: init, status: status, get state() { return G.state; } };
  root.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : global);
