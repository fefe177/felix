/* Schleifental GP - Spielkern: Szene, Laufablauf, Kamera, Eingabe.
 *
 * Die Strecke ist eine Abfahrt mit Anfang und Ende. Ein Lauf endet im Ziel,
 * danach beginnt er von vorn. Gefahren wird allein gegen die Uhr.
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};
  var T = root.THREE;
  var V3 = T.Vector3;
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

  var CHECKPOINTS = 8;          // Abschnitte fuer Zwischenzeiten und Rueckstart
  var RESTART_AFTER = 6;        // Sekunden im Ziel, dann von vorn
  var PAINT = '#e2453b', ACCENT = '#ffd23f';
  var BEST_KEY = 'schleifental.bestzeit';

  var G = {
    state: 'intro', time: 0, t0: 0, countdown: 0, camMode: 0, paused: false,
    autoDrive: false, shake: 0, introS: 0, dtAcc: 0, restartIn: 0, best: 0
  };
  var scene, camera, renderer, track, kart, kartObj, shadow, sparks;
  var padMesh, sceneryRefs, playerNet = null;
  var input = { gas: 0, brake: 0, steer: 0, drift: 0, hop: 0 };
  var keys = {}, touch = { steer: 0, gas: 0, brake: 0, drift: 0 }, steerSmooth = 0;
  var tmpF = null, tmpF2 = null, camFrame = null;
  var camPos = new V3(), camUp = new V3(0, 1, 0), camLook = new V3();
  var seedV = 20260902;
  function rnd() { seedV = (seedV * 1664525 + 1013904223) % 4294967296; return seedV / 4294967296; }

  /* ------------------------------------------------------------------ */
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

    kartObj = MK.kart.make(PAINT, ACCENT);
    scene.add(kartObj);
    kart = MK.kart.state(0, 0, { name: 'DU' });
    shadow = new T.Mesh(new T.CircleGeometry(1.6, 12),
      new T.MeshBasicMaterial({ color: 0x0b0f16, transparent: true, opacity: 0.32, depthWrite: false }));
    scene.add(shadow);
    sparks = makeSparks(scene);

    if (MK.brain && MK.brainWeights) {
      playerNet = MK.brain.create(Float64Array.from(MK.brainWeights.w), MK.brainWeights.shape);
      document.getElementById('aihint').hidden = false;
    }

    try { G.best = Number(root.localStorage.getItem(BEST_KEY)) || 0; } catch (e) { G.best = 0; }
    MK.hud.init(track);
    bindInput();
    resize();
    root.addEventListener('resize', resize);
    reset(true);
    requestAnimationFrame(frame);
  }

  function makeSparks(sc) {
    var g = new T.Group(), geo = new T.OctahedronGeometry(0.3, 0);
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
    kart.s = 0; kart.x = 0; kart.v = 0; kart.phi = 0; kart.slide = 0;
    kart.h = 0; kart.vy = 0; kart.air = false; kart.boost = 0; kart.drift = 0;
    kart.charge = 0; kart.slip = 0; kart.cp = 0; kart.fell = 0; kart.padSeen = -1;
    MK.kart.place(kartObj, kart, MK.track.frameAt(track, 0), 0, 0);
    G.time = 0;
    G.state = intro ? 'intro' : 'countdown';
    G.countdown = 3.999;
    G.restartIn = 0;
    G.introS = 40;
    G._lastN = null;
    document.getElementById('startPanel').classList.toggle('is-on', !!intro);
    document.getElementById('results').classList.remove('is-on');
    MK.hud.countdown('');
  }

  function startRun() {
    document.getElementById('startPanel').classList.remove('is-on');
    MK.hud.audio.init();
    G.state = 'countdown';
    G.countdown = 3.999;
    G._lastN = null;
  }

  /* ------------------------------------------------------------------ */
  function bindInput() {
    root.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var k = e.key.toLowerCase();
      keys[k] = true;
      if (k === ' ' || ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
      if (k === 'enter') {
        if (G.state === 'intro') startRun();
        else if (G.state === 'finish') reset(false);
      }
      if (k === 'r' && G.state === 'race') respawn('Zurueck auf die Strecke');
      if (k === 'c') { G.camMode = (G.camMode + 1) % 3; MK.hud.message(['VERFOLGER', 'WEIT', 'COCKPIT'][G.camMode], 'info', 1.1); }
      if (k === 'm') MK.hud.message(MK.hud.audio.setMuted(!MK.hud.audio.isMuted()) ? 'TON AUS' : 'TON AN', 'info', 1.1);
      if (k === 'p' && G.state === 'race') { G.paused = !G.paused; MK.hud.message(G.paused ? 'PAUSE' : '', 'info', G.paused ? 99 : 0.1); }
      if (k === 'k') {
        if (!playerNet) MK.hud.message('KEIN KI-FAHRER GELADEN', 'warn', 1.6);
        else {
          G.autoDrive = !G.autoDrive;
          document.getElementById('aidrive').classList.toggle('is-on', G.autoDrive);
          MK.hud.message(G.autoDrive ? 'KI ÜBERNIMMT' : 'DU FÄHRST', 'info', 1.4);
        }
      }
    });
    root.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
    root.addEventListener('blur', function () { keys = {}; });

    document.getElementById('startBtn').addEventListener('click', startRun);
    document.getElementById('againBtn').addEventListener('click', function () { reset(false); });

    Array.prototype.forEach.call(document.querySelectorAll('[data-touch]'), function (el) {
      var what = el.dataset.touch;
      function on(e) {
        e.preventDefault(); el.classList.add('is-down'); MK.hud.audio.init();
        if (what === 'left') touch.steer = 1;
        else if (what === 'right') touch.steer = -1;
        else touch[what] = 1;
      }
      function off(e) {
        e.preventDefault(); el.classList.remove('is-down');
        if (what === 'left' || what === 'right') touch.steer = 0; else touch[what] = 0;
      }
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    });
    if (root.matchMedia('(pointer: coarse)').matches) document.body.classList.add('is-touch');
  }

  /* Lenkung wird weich nachgefuehrt statt hart umgeschaltet - eine Tastatur
     kennt nur 0 und 1, das Kart soll aber einlenken und nicht springen. */
  function readInput(dt) {
    var want = clamp((keys['arrowleft'] || keys['a'] ? 1 : 0) -
                     (keys['arrowright'] || keys['d'] ? 1 : 0) + touch.steer, -1, 1);
    var rate = (Math.abs(want) > 0.01 ? 4.2 : 7.5) * dt;
    steerSmooth += clamp(want - steerSmooth, -rate, rate);
    input.steer = steerSmooth;
    input.gas = (keys['arrowup'] || keys['w'] || touch.gas) ? 1 : 0;
    input.brake = (keys['arrowdown'] || keys['s'] || touch.brake) ? 1 : 0;
    var d = (keys[' '] || keys['shift'] || touch.drift) ? 1 : 0;
    input.hop = d && !input.drift ? 1 : 0;
    input.drift = d;
    return input;
  }

  /* ------------------------------------------------------------------ */
  function respawn(text) {
    kart.s = Math.max(0, kart.cp * (track.length / CHECKPOINTS) - 6);
    kart.x = 0; kart.v = 14; kart.phi = 0; kart.slide = 0;
    kart.h = 0; kart.vy = 0; kart.air = false; kart.drift = 0; kart.charge = 0;
    kart.fell = 0; kart.padSeen = -1;
    if (text) MK.hud.message(text, 'warn', 1.4);
  }

  function progress(dt) {
    var idx = Math.min(CHECKPOINTS - 1, Math.floor(kart.s / (track.length / CHECKPOINTS)));
    if (idx > kart.cp) {
      kart.cp = idx;
      MK.hud.audio.blip(620, 0.08, 'square', 0.1);
      MK.hud.message('ABSCHNITT ' + idx + ' — ' + MK.hud.fmtTime(G.time), 'info', 1.1);
    }
    if (kart.fell) { respawn('In die Schlucht gestuerzt'); MK.hud.audio.noise(0.5, 0.25); }
    if (kart.s >= track.length - 2) finish();
  }

  function finish() {
    G.state = 'finish';
    G.restartIn = RESTART_AFTER;
    var neu = !G.best || G.time < G.best;
    if (neu) {
      G.best = G.time;
      try { root.localStorage.setItem(BEST_KEY, String(G.time)); } catch (e) { /* egal */ }
    }
    document.getElementById('resHead').textContent = neu ? 'Bestzeit' : 'Im Ziel';
    document.getElementById('resTime').textContent = MK.hud.fmtTime(G.time);
    document.getElementById('resBest').textContent = MK.hud.fmtTime(G.best);
    document.getElementById('results').classList.add('is-on');
    MK.hud.audio.blip(880, 0.4, 'triangle', 0.2);
    setTimeout(function () { MK.hud.audio.blip(neu ? 1320 : 660, 0.5, 'triangle', 0.18); }, 180);
  }

  function checkPads() {
    if (MK.kart.pads(kart, track) >= 0) {
      MK.hud.message('TURBO!', 'good', 1);
      MK.hud.audio.noise(0.4, 0.22);
    }
  }

  /* ------------------------------------------------------------------ */
  function updateCamera(dt) {
    var f = kart._f;
    if (!f) return;
    var dist = G.camMode === 1 ? 15.5 : (G.camMode === 2 ? 1.4 : 9.6);
    var high = G.camMode === 1 ? 6.2 : (G.camMode === 2 ? 2.3 : 3.7);
    /* Die Kamera sitzt auf der Strecke selbst, nicht starr hinter dem Kart -
       sonst schneidet sie im Looping durch die Fahrbahn. Vor dem Start wird
       ueber den Streckenanfang hinaus verlaengert. */
    var behind = kart.s - dist;
    camFrame = MK.track.frameAt(track, Math.max(0, behind), camFrame);
    var up = new V3().copy(camFrame.u);
    var want = new V3().copy(camFrame.p)
      .addScaledVector(camFrame.r, kart.x * 0.55)
      .addScaledVector(up, high + kart.h * 0.6);
    if (behind < 0) want.addScaledVector(camFrame.t, behind);
    var fwd = new V3().copy(f.t).multiplyScalar(Math.cos(kart.phi * 0.55))
      .addScaledVector(new V3().crossVectors(f.u, f.t), Math.sin(kart.phi * 0.55)).normalize();
    var base = new V3().copy(kartObj.position);
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
    var fov = 62 + clamp(Math.abs(kart.v) / 46, 0, 1.3) * 13 + (kart.boost > 0 ? 9 : 0);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 5);
    camera.updateProjectionMatrix();
  }

  function introCamera(dt) {
    G.introS += dt * 30;
    if (G.introS > track.length - 60) G.introS = 40;
    tmpF = MK.track.frameAt(track, G.introS, tmpF);
    tmpF2 = MK.track.frameAt(track, G.introS + 48, tmpF2);
    camera.position.copy(tmpF.p)
      .addScaledVector(MK.track.UP, 26)
      .addScaledVector(tmpF.r, 52 * Math.sin(G.introS * 0.0016));
    camera.up.set(0, 1, 0);
    camera.lookAt(tmpF2.p.x, tmpF2.p.y + 6, tmpF2.p.z);
  }

  function updateSparks() {
    var on = kart.drift > 0 && Math.abs(kart.v) > 12;
    var lvl = kart.charge > 1.6 ? 2 : (kart.charge > 0.8 ? 1 : 0);
    var col = ['#fff3d0', '#ff9c2a', '#5fd0ff'][lvl];
    for (var i = 0; i < sparks.children.length; i++) {
      var m = sparks.children[i];
      m.visible = on;
      if (!on) continue;
      m.material.color.set(col);
      m.position.copy(kartObj.position)
        .addScaledVector(kartObj.getWorldDirection(new V3()), -(1.4 + rnd() * 1.6))
        .addScaledVector(new V3().setFromMatrixColumn(kartObj.matrixWorld, 0), (i < 3 ? -1 : 1) * (0.9 + rnd() * 0.5))
        .addScaledVector(new V3().setFromMatrixColumn(kartObj.matrixWorld, 1), 0.2 + rnd() * 0.4);
      m.scale.setScalar(0.4 + rnd() * (0.5 + lvl * 0.3));
    }
  }

  /* ------------------------------------------------------------------ */
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - (G.t0 || now)) / 1000);
    G.t0 = now;
    if (dt <= 0) return;
    var real = (now - (G.tPrev || now)) / 1000; G.tPrev = now;
    if (real > 0) G.fps = G.fps ? G.fps * 0.92 + (1 / real) * 0.08 : 1 / real;

    if (G.state === 'intro') {
      introCamera(dt);
      sceneryRefs.clouds.rotation.y += dt * 0.004;
      MK.hud.drawMini(track, kart, kartObj.position);
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
        setTimeout(function () { MK.hud.countdown(''); }, 500);
      }
    }

    if (G.state === 'finish') {
      G.restartIn -= dt;
      document.getElementById('resCount').textContent = Math.max(0, Math.ceil(G.restartIn));
      if (G.restartIn <= 0) reset(false);
    }

    var racing = G.state === 'race' && !G.paused;
    if (racing) G.time += dt;

    G.dtAcc += dt;
    var STEP = 1 / 120, guard = 0;
    while (G.dtAcc >= STEP && guard++ < 14) {
      G.dtAcc -= STEP;
      stepWorld(STEP, racing);
    }

    var f = kart._f || MK.track.frameAt(track, kart.s);
    var roll = (kart.drift > 0 ? -kart.driftDir * 0.16 : 0) + clamp(-kart.slide * 0.012, -0.12, 0.12);
    MK.kart.place(kartObj, kart, f, roll, kart.slip);
    shadow.position.copy(f.p).addScaledVector(f.r, kart.x).addScaledVector(f.u, 0.06);
    shadow.quaternion.copy(kartObj.quaternion);
    shadow.rotateX(-Math.PI / 2);
    var sc = clamp(1 - kart.h / 9, 0.35, 1);
    shadow.scale.setScalar(sc);
    shadow.material.opacity = 0.34 * sc * (f.gap ? 0 : 1);
    updateSparks();

    updateCamera(dt);
    sceneryRefs.clouds.rotation.y += dt * 0.004;
    padMesh.material.emissiveIntensity = 0.35 + Math.sin(now / 260) * 0.22;

    MK.hud.update({
      v: kart.v, boostOn: kart.boost > 0,
      charge: kart.boost > 0 ? kart.boost / 1.6 : kart.charge / 2.4,
      chargeLevel: kart.boost > 0 ? 4 : (kart.charge > 1.6 ? 3 : (kart.charge > 0.8 ? 2 : 1)),
      time: G.time, best: G.best, progress: kart.s / track.length,
      wrongWay: Math.cos(kart.phi) < -0.25 && Math.abs(kart.v) > 4
    }, dt);
    MK.hud.drawMini(track, kart, kartObj.position);
    if (!MK.hud.audio.isMuted()) {
      MK.hud.audio.engine(clamp(Math.abs(kart.v) / 46, 0, 1.4), kart.boost > 0 ? 1 : (input.gas ? 0.6 : 0.2));
    }
    renderer.render(scene, camera);
  }

  function stepWorld(dt, racing) {
    var kin = readInput(dt);
    if (!racing || G.state === 'finish') {
      kin = { gas: 0, brake: G.state === 'countdown' ? 0 : 1, steer: 0, drift: 0, hop: 0 };
      if (G.state === 'countdown') kart.v *= 0.9;
    } else if (G.autoDrive && playerNet) {
      kin = MK.brain.decide(playerNet, kart, track);
    }
    var wallBefore = kart.hitWall;
    MK.kart.step(kart, track, kin, dt);
    if (kart.hitWall > wallBefore + 0.1) {
      G.shake = Math.min(0.9, G.shake + kart.hitWall * 0.5);
      MK.hud.audio.blip(90, 0.12, 'square', 0.12 * kart.hitWall);
    }
    if (racing) { checkPads(); progress(dt); }
  }

  /* Kurzer Statusabruf (Konsole / Test) */
  function status() {
    return { state: G.state, zeit: +G.time.toFixed(2), tempo: +(kart.v * 3.6).toFixed(0),
             meter: +kart.s.toFixed(0), ziel: +track.length.toFixed(0),
             fortschritt: +(kart.s / track.length * 100).toFixed(1),
             quer: +kart.x.toFixed(1), hoehe: +kart.h.toFixed(1),
             ueberKopf: kart._f ? kart._f.u.y < 0 : false,
             turbo: +kart.boost.toFixed(2), drift: kart.drift > 0,
             abschnitt: kart.cp, bestzeit: +G.best.toFixed(2),
             kiFaehrt: G.autoDrive, fps: G.fps ? Math.round(G.fps) : 0 };
  }

  MK.game = { init: init, status: status, get state() { return G.state; } };
  root.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : global);
