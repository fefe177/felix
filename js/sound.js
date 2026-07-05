/* ============================================================
   Sound – synthetisiert Töne per Web Audio API (keine Dateien)
   ============================================================ */
const Sound = (() => {
  const MUTE_KEY = "neon-casino-mute";
  let ctx = null;
  let muted = localStorage.getItem(MUTE_KEY) === "1";

  /* AudioContext erst bei erster Nutzer-Interaktion erzeugen (Autoplay-Policy). */
  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { return null; }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* Ein Ton mit Hüllkurve. */
  function tone(freq, start, dur, type = "sine", gain = 0.14) {
    const c = ac();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(0, c.currentTime + start);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    osc.connect(g).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + dur + 0.02);
  }

  const patterns = {
    click:   () => tone(320, 0, 0.06, "triangle", 0.08),
    deal:    () => tone(220, 0, 0.08, "square", 0.06),
    spin:    () => { tone(200, 0, 0.05, "sawtooth", 0.05); tone(260, 0.06, 0.05, "sawtooth", 0.05); },
    win:     () => { [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.18, "triangle", 0.12)); },
    jackpot: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.1, 0.28, "triangle", 0.14)); },
    lose:    () => { tone(300, 0, 0.18, "sawtooth", 0.1); tone(200, 0.12, 0.24, "sawtooth", 0.1); },
    coin:    () => { tone(880, 0, 0.05, "square", 0.08); tone(1200, 0.05, 0.08, "square", 0.08); },
  };

  function play(name) {
    if (muted) return;
    const p = patterns[name];
    if (p) try { p(); } catch (_) {}
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    updateBtn();
    if (!muted) play("click");
    return muted;
  }

  function updateBtn() {
    const btn = document.getElementById("muteBtn");
    if (btn) {
      btn.textContent = muted ? "🔇" : "🔊";
      btn.title = muted ? "Ton einschalten" : "Ton ausschalten";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("muteBtn");
    if (btn) btn.addEventListener("click", toggleMute);
    updateBtn();
  });

  return { play, toggleMute, isMuted: () => muted };
})();
