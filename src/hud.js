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

  function init(track) {
    ['speed', 'time', 'best', 'progPct', 'progFill', 'boostFill', 'message',
     'countdown', 'gear', 'wrongway'].forEach(function (k) { el[k] = $(k); });
    mini = $('minimap');
    miniCtx = mini.getContext('2d');

    /* Streckenverlauf fuer die Minimap vorberechnen (Draufsicht).
       Ueber der Schlucht bleibt die Linie unterbrochen. */
    var pts = [], i, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (i = 0; i < track.count; i += 4) {
      var f = track.frames[i];
      pts.push([f.p.x, f.p.z, f.gap]);
      minX = Math.min(minX, f.p.x); maxX = Math.max(maxX, f.p.x);
      minZ = Math.min(minZ, f.p.z); maxZ = Math.max(maxZ, f.p.z);
    }
    var w = mini.width, hh = mini.height, pad2 = 14;
    var sc = Math.min((w - pad2 * 2) / (maxX - minX), (hh - pad2 * 2) / (maxZ - minZ));
    function map(x, z) {
      return [(x - (minX + maxX) / 2) * sc + w / 2, (z - (minZ + maxZ) / 2) * sc + hh / 2];
    }
    miniPts = pts.map(function (p) { return map(p[0], p[1]).concat(p[2]); });
    mini._map = function (p) { return map(p.x, p.z); };
  }

  function drawMini(track, kart, worldPos) {
    var g = miniCtx, w = mini.width, h = mini.height, i;
    g.clearRect(0, 0, w, h);
    g.lineJoin = 'round'; g.lineCap = 'round';
    /* Verlauf zweimal zeichnen: dunkle Kontur, helle Linie darueber */
    [['rgba(12,15,22,0.55)', 7], ['rgba(233,238,250,0.5)', 2.4]].forEach(function (st) {
      g.strokeStyle = st[0]; g.lineWidth = st[1];
      g.beginPath();
      var pen = false;
      for (i = 0; i < miniPts.length; i++) {
        if (miniPts[i][2]) { pen = false; continue; }      // Schlucht: Linie unterbrechen
        g[pen ? 'lineTo' : 'moveTo'](miniPts[i][0], miniPts[i][1]);
        pen = true;
      }
      g.stroke();
    });
    var s = miniPts[0], z = miniPts[miniPts.length - 1];
    g.fillStyle = '#35d9a0';
    g.beginPath(); g.arc(s[0], s[1], 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd23f';
    g.fillRect(z[0] - 4, z[1] - 4, 8, 8);
    var p = mini._map(worldPos);
    g.beginPath(); g.arc(p[0], p[1], 5, 0, Math.PI * 2);
    g.fillStyle = '#e2453b'; g.fill();
    g.strokeStyle = '#0c0f16'; g.lineWidth = 1.6; g.stroke();
  }

  function update(st, dt) {
    el.speed.textContent = Math.round(Math.abs(st.v) * 3.6);
    el.gear.textContent = st.boostOn ? 'TURBO' : (st.v < -0.5 ? 'R' : Math.min(6, 1 + Math.floor(Math.abs(st.v) / 8)));
    el.gear.classList.toggle('is-turbo', !!st.boostOn);
    el.boostFill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, st.charge)) + ')';
    el.boostFill.dataset.level = st.chargeLevel;
    el.time.textContent = fmtTime(st.time);
    el.best.textContent = fmtTime(st.best);
    el.progPct.textContent = Math.round(st.progress * 100);
    el.progFill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, st.progress)) + ')';
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
