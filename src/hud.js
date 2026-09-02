/* Schleifental GP - Anzeige, Minimap und Sound. */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};

  function $(id) { return document.getElementById(id); }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function fmtTime(t) {
    if (!t) return '--:--.--';        // 0 = noch keine Zeit gefahren
    var m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100);
    return pad(m, 1) + ':' + pad(s, 2) + '.' + pad(c, 2);
  }

  var el = {}, mini = null, miniPts = [], miniCtx = null, msgTimer = 0;

  function init(track, laps) {
    ['speed', 'lapNo', 'lapAll', 'time', 'best', 'last', 'place', 'placeAll',
     'boostFill', 'message', 'countdown', 'gear', 'wrongway'].forEach(function (k) { el[k] = $(k); });
    el.lapAll.textContent = laps;
    mini = $('minimap');
    miniCtx = mini.getContext('2d');

    /* Streckenumriss fuer die Minimap vorberechnen (Draufsicht) */
    var pts = [], i, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (i = 0; i < track.count; i += 4) {
      var p = track.frames[i].p;
      pts.push([p.x, p.z]);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    var w = mini.width, h = mini.height, pad2 = 12;
    var sc = Math.min((w - pad2 * 2) / (maxX - minX), (h - pad2 * 2) / (maxZ - minZ));
    miniPts = pts.map(function (p) {
      return [(p[0] - (minX + maxX) / 2) * sc + w / 2, (p[1] - (minZ + maxZ) / 2) * sc + h / 2];
    });
    mini._map = function (p) {
      return [(p.x - (minX + maxX) / 2) * sc + w / 2, (p.z - (minZ + maxZ) / 2) * sc + h / 2];
    };
  }

  function drawMini(karts, playerIdx) {
    var g = miniCtx, w = mini.width, h = mini.height, i;
    g.clearRect(0, 0, w, h);
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(12,15,22,0.55)'; g.lineWidth = 7;
    g.beginPath();
    for (i = 0; i < miniPts.length; i++) g[i ? 'lineTo' : 'moveTo'](miniPts[i][0], miniPts[i][1]);
    g.closePath(); g.stroke();
    g.strokeStyle = 'rgba(233,238,250,0.55)'; g.lineWidth = 2.4;
    g.stroke();
    /* Start-Ziel */
    g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(miniPts[0][0] - 4, miniPts[0][1] - 4);
    g.lineTo(miniPts[0][0] + 4, miniPts[0][1] + 4); g.stroke();
    for (i = 0; i < karts.length; i++) {
      var k = karts[i], p = mini._map(k.obj.position);
      g.beginPath();
      g.arc(p[0], p[1], i === playerIdx ? 5 : 3.6, 0, Math.PI * 2);
      g.fillStyle = k.color;
      g.fill();
      if (i === playerIdx) { g.strokeStyle = '#0c0f16'; g.lineWidth = 1.6; g.stroke(); }
    }
  }

  function update(st, dt) {
    var kmh = Math.round(Math.abs(st.v) * 3.6);
    el.speed.textContent = kmh;
    el.gear.textContent = st.boostOn ? 'TURBO' : (st.v < -0.5 ? 'R' : Math.min(6, 1 + Math.floor(Math.abs(st.v) / 8)));
    el.gear.classList.toggle('is-turbo', !!st.boostOn);
    el.boostFill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, st.charge)) + ')';
    el.boostFill.dataset.level = st.chargeLevel;
    el.lapNo.textContent = Math.min(Math.max(st.lap, 1), st.laps);
    el.time.textContent = fmtTime(st.time);
    el.best.textContent = fmtTime(st.best);
    el.last.textContent = fmtTime(st.last);
    el.place.textContent = st.place;
    el.placeAll.textContent = st.field;
    el.wrongway.classList.toggle('is-on', !!st.wrongWay);
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) el.message.classList.remove('is-on');
    }
  }

  function message(text, kind, secs) {
    el.message.textContent = text;
    el.message.className = 'message is-on' + (kind ? ' is-' + kind : '');
    msgTimer = secs || 1.6;
  }

  function countdown(text) {
    var c = el.countdown;
    c.textContent = text;
    c.classList.remove('is-on');
    void c.offsetWidth;                       // Animation neu starten
    if (text) c.classList.add('is-on');
  }

  /* ---- Sound: kleine WebAudio-Engine, erst nach der ersten Eingabe ---- */
  var actx = null, engine = null, master = null, muted = false;
  function audioInit() {
    if (actx || muted) return;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = 0.5;
    master.connect(actx.destination);
    var osc = actx.createOscillator(), osc2 = actx.createOscillator();
    var filt = actx.createBiquadFilter(), gain = actx.createGain();
    osc.type = 'sawtooth'; osc2.type = 'square';
    osc.frequency.value = 60; osc2.frequency.value = 30;
    filt.type = 'lowpass'; filt.frequency.value = 700; filt.Q.value = 3;
    gain.gain.value = 0.0;
    osc.connect(filt); osc2.connect(filt); filt.connect(gain); gain.connect(master);
    osc.start(); osc2.start();
    engine = { osc: osc, osc2: osc2, filt: filt, gain: gain };
  }
  function engineSound(rpm, load) {
    if (!engine || !actx) return;
    var f = 42 + rpm * 145;
    engine.osc.frequency.setTargetAtTime(f, actx.currentTime, 0.05);
    engine.osc2.frequency.setTargetAtTime(f * 0.5, actx.currentTime, 0.05);
    engine.filt.frequency.setTargetAtTime(420 + rpm * 1500, actx.currentTime, 0.08);
    engine.gain.gain.setTargetAtTime(0.055 + load * 0.05, actx.currentTime, 0.1);
  }
  function blip(freq, dur, type, vol) {
    if (!actx) return;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, actx.currentTime);
    g.gain.setValueAtTime(vol || 0.22, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(actx.currentTime + dur + 0.02);
  }
  function noise(dur, vol) {
    if (!actx) return;
    var n = actx.sampleRate * dur, buf = actx.createBuffer(1, n, actx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 900;
    g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
    return muted;
  }

  MK.hud = {
    init: init, update: update, message: message, countdown: countdown,
    drawMini: drawMini, fmtTime: fmtTime,
    audio: { init: audioInit, engine: engineSound, blip: blip, noise: noise,
             setMuted: setMuted, isMuted: function () { return muted; } }
  };
})(typeof window !== 'undefined' ? window : global);
