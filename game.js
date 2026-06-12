/* =====================================================================
   BLOX TOWER DEFENSE
   Ein Tower-Defense-Spiel im Roblox-Stil (HTML5 Canvas, kein Build nötig)
   ===================================================================== */

"use strict";

/* ---------------- Konstanten & Grundeinstellungen ---------------- */

const TILE = 48;            // Kachelgröße in Pixeln
const COLS = 20;            // Spielfeld-Spalten
const ROWS = 13;            // Spielfeld-Zeilen
const W = COLS * TILE;      // 960
const H = ROWS * TILE;      // 624
const MAX_WAVE = 40;
const START_CASH = 500;
const START_LIVES = 100;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* ---------------- Turm-Definitionen ----------------
   Jeder Turm hat 5 Level (Level 0 = Kaufzustand).
   dmg = Schaden, range = Reichweite (px), rate = Schüsse pro Sekunde */

const TOWER_TYPES = {
  gunner: {
    name: "Schütze",
    icon: "🔫",
    color: "#3b82f6",
    desc: "Günstiger Allrounder",
    cost: 250,
    unlockWave: 0,
    kind: "hitscan",
    levels: [
      { dmg: 6,  range: 130, rate: 1.2, upgradeCost: 200 },
      { dmg: 10, range: 130, rate: 1.4, upgradeCost: 400 },
      { dmg: 14, range: 140, rate: 1.7, upgradeCost: 850 },
      { dmg: 22, range: 150, rate: 2.1, upgradeCost: 1800 },
      { dmg: 40, range: 165, rate: 2.6, upgradeCost: null },
    ],
  },
  sniper: {
    name: "Scharfschütze",
    icon: "🎯",
    color: "#10b981",
    desc: "Lange Reichweite, harter Schuss",
    cost: 400,
    unlockWave: 0,
    kind: "hitscan",
    levels: [
      { dmg: 35,  range: 280, rate: 0.35, upgradeCost: 300 },
      { dmg: 60,  range: 290, rate: 0.38, upgradeCost: 700 },
      { dmg: 110, range: 305, rate: 0.42, upgradeCost: 1500 },
      { dmg: 200, range: 330, rate: 0.46, upgradeCost: 3000 },
      { dmg: 400, range: 360, rate: 0.52, upgradeCost: null },
    ],
  },
  frost: {
    name: "Eismagier",
    icon: "❄️",
    color: "#38bdf8",
    desc: "Verlangsamt Gegner",
    cost: 500,
    unlockWave: 3,
    kind: "hitscan",
    levels: [
      { dmg: 3,  range: 110, rate: 1.0, slow: 0.35, slowDur: 1.2, upgradeCost: 350 },
      { dmg: 5,  range: 120, rate: 1.1, slow: 0.42, slowDur: 1.5, upgradeCost: 700 },
      { dmg: 8,  range: 130, rate: 1.2, slow: 0.50, slowDur: 1.8, upgradeCost: 1400 },
      { dmg: 12, range: 145, rate: 1.4, slow: 0.55, slowDur: 2.2, upgradeCost: 2800 },
      { dmg: 20, range: 160, rate: 1.6, slow: 0.62, slowDur: 2.8, upgradeCost: null },
    ],
  },
  rocket: {
    name: "Raketenwerfer",
    icon: "🚀",
    color: "#ef4444",
    desc: "Flächenschaden!",
    cost: 800,
    unlockWave: 5,
    kind: "rocket",
    levels: [
      { dmg: 28,  range: 160, rate: 0.50, splash: 55, upgradeCost: 500 },
      { dmg: 45,  range: 170, rate: 0.55, splash: 60, upgradeCost: 1100 },
      { dmg: 70,  range: 180, rate: 0.60, splash: 65, upgradeCost: 2400 },
      { dmg: 110, range: 190, rate: 0.70, splash: 72, upgradeCost: 4800 },
      { dmg: 180, range: 205, rate: 0.80, splash: 82, upgradeCost: null },
    ],
  },
  minigun: {
    name: "Minigunner",
    icon: "💥",
    color: "#f59e0b",
    desc: "Extrem schnelles Feuer",
    cost: 900,
    unlockWave: 8,
    kind: "hitscan",
    levels: [
      { dmg: 4,  range: 120, rate: 5,  upgradeCost: 600 },
      { dmg: 6,  range: 125, rate: 6,  upgradeCost: 1200 },
      { dmg: 8,  range: 130, rate: 7,  upgradeCost: 2500 },
      { dmg: 12, range: 140, rate: 9,  upgradeCost: 5000 },
      { dmg: 18, range: 150, rate: 12, upgradeCost: null },
    ],
  },
  farm: {
    name: "Farm",
    icon: "🌾",
    color: "#84cc16",
    desc: "Geld am Ende jeder Welle",
    cost: 600,
    unlockWave: 0,
    kind: "farm",
    levels: [
      { income: 120,  upgradeCost: 500 },
      { income: 250,  upgradeCost: 1000 },
      { income: 450,  upgradeCost: 2000 },
      { income: 800,  upgradeCost: 4000 },
      { income: 1500, upgradeCost: null },
    ],
  },
};

/* ---------------- Gegner-Definitionen ---------------- */

const ENEMY_TYPES = {
  normal:  { name: "Zombie",   hp: 45,   speed: 55,  reward: 8,   dmg: 1,  scale: 1.0, color: "#4ade80", headColor: "#86efac" },
  fast:    { name: "Flitzer",  hp: 30,   speed: 115, reward: 10,  dmg: 1,  scale: 0.85, color: "#facc15", headColor: "#fde047" },
  heavy:   { name: "Brocken",  hp: 170,  speed: 38,  reward: 18,  dmg: 2,  scale: 1.2, color: "#94a3b8", headColor: "#cbd5e1" },
  armored: { name: "Panzer",   hp: 420,  speed: 32,  reward: 35,  dmg: 3,  scale: 1.3, color: "#475569", headColor: "#64748b" },
  demon:   { name: "Dämon",    hp: 900,  speed: 45,  reward: 70,  dmg: 5,  scale: 1.35, color: "#a855f7", headColor: "#c084fc" },
  boss:    { name: "BOSS",     hp: 3500, speed: 26,  reward: 400, dmg: 25, scale: 1.8, color: "#dc2626", headColor: "#ef4444" },
};

/* ---------------- Karte / Pfad ---------------- */

// Wegpunkte in Kachel-Koordinaten (Spalte, Zeile). Gegner laufen von links nach rechts.
const PATH_TILES_WP = [
  [-1, 2], [3, 2], [3, 6], [8, 6], [8, 2], [13, 2], [13, 9], [5, 9], [5, 11],
  [17, 11], [17, 5], [20, 5],
];

// Wegpunkte in Pixel-Koordinaten (Kachelmitte)
const PATH = PATH_TILES_WP.map(([c, r]) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }));

// Menge aller Pfad-Kacheln (für Platzierungs-Sperre & Zeichnung)
const pathTiles = new Set();
for (let i = 0; i < PATH_TILES_WP.length - 1; i++) {
  let [c1, r1] = PATH_TILES_WP[i];
  let [c2, r2] = PATH_TILES_WP[i + 1];
  const dc = Math.sign(c2 - c1), dr = Math.sign(r2 - r1);
  let c = c1, r = r1;
  while (true) {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) pathTiles.add(c + "," + r);
    if (c === c2 && r === r2) break;
    c += dc; r += dr;
  }
}

// Deko (Bäume, Steine, Blumen) deterministisch verteilen
function seededRandom(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const decorations = [];
{
  const rnd = seededRandom(1337);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (pathTiles.has(c + "," + r)) continue;
      const v = rnd();
      if (v < 0.07) decorations.push({ c, r, type: "tree", off: rnd() });
      else if (v < 0.11) decorations.push({ c, r, type: "rock", off: rnd() });
      else if (v < 0.18) decorations.push({ c, r, type: "flower", off: rnd() });
    }
  }
}

/* ---------------- Spielzustand ---------------- */

const state = {
  running: false,        // Spiel gestartet (Menü weg)?
  cash: START_CASH,
  lives: START_LIVES,
  wave: 1,
  phase: "idle",         // "idle" (zwischen Wellen) | "wave" (Welle läuft)
  speed: 1,
  soundOn: true,
  autoStart: false,
  autoTimer: 0,
  towers: [],
  enemies: [],
  projectiles: [],
  particles: [],
  texts: [],             // schwebende Texte (z.B. +8💰)
  spawnQueue: [],
  waveTime: 0,
  placing: null,         // Turmtyp-Key im Platzierungsmodus
  selected: null,        // ausgewählter Turm (Objekt)
  mouse: { x: -100, y: -100, inside: false },
  time: 0,
  shake: 0,
};

/* ---------------- Sound (WebAudio, ohne Dateien) ---------------- */

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
}
function sfx(type) {
  if (!state.soundOn || !audioCtx) return;
  const t = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.connect(audioCtx.destination);

  function tone(freq, dur, vol, shape, slideTo) {
    const o = audioCtx.createOscillator();
    o.type = shape || "square";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gain);
    o.start(t); o.stop(t + dur);
  }

  switch (type) {
    case "shoot":   tone(380, 0.07, 0.05, "square", 180); break;
    case "minigun": tone(300, 0.04, 0.03, "sawtooth", 200); break;
    case "sniper":  tone(150, 0.18, 0.09, "sawtooth", 60); break;
    case "frost":   tone(900, 0.15, 0.05, "sine", 1400); break;
    case "boom":    tone(90, 0.35, 0.18, "sawtooth", 30); break;
    case "place":   tone(500, 0.12, 0.08, "triangle", 700); break;
    case "upgrade": tone(440, 0.10, 0.08, "triangle", 880); break;
    case "sell":    tone(600, 0.15, 0.08, "triangle", 300); break;
    case "cash":    tone(880, 0.09, 0.06, "sine", 1320); break;
    case "leak":    tone(220, 0.30, 0.12, "sawtooth", 80); break;
    case "wave":    tone(330, 0.25, 0.10, "triangle", 660); break;
    case "die":     tone(200, 0.12, 0.05, "square", 80); break;
    case "win":     tone(523, 0.5, 0.12, "triangle", 1046); break;
    case "lose":    tone(300, 0.8, 0.14, "sawtooth", 50); break;
  }
}

/* ---------------- Wellen-Generator ---------------- */

function buildWave(n) {
  // Liste aus { type, count, interval }
  const list = [];
  const add = (type, count, interval) => list.push({ type, count, interval });

  if (n % 10 === 0) {
    // Boss-Welle mit Eskorte
    add("normal", 6 + n, 0.5);
    add("heavy", Math.floor(n / 3), 1.0);
    if (n >= 20) add("demon", Math.floor(n / 10), 1.5);
    add("boss", n / 10, 4.0);
    return list;
  }

  add("normal", 4 + n, Math.max(0.35, 0.9 - n * 0.012));
  if (n >= 3)  add("fast", Math.floor(n * 0.8), 0.5);
  if (n >= 5)  add("heavy", Math.floor(n / 2) - 1, 1.2);
  if (n >= 12) add("armored", Math.floor(n / 4), 1.6);
  if (n >= 22) add("demon", Math.floor((n - 18) / 3), 2.0);
  if (n >= 15) add("fast", Math.floor(n / 2), 0.3);
  return list;
}

function hpScale(wave) {
  return 1 + (wave - 1) * 0.09;
}

function startWave() {
  if (state.phase !== "idle" || !state.running) return;
  state.phase = "wave";
  state.waveTime = 0;
  state.spawnQueue = [];

  let tcursor = 0.5;
  for (const grp of buildWave(state.wave)) {
    for (let i = 0; i < grp.count; i++) {
      state.spawnQueue.push({ type: grp.type, time: tcursor });
      tcursor += grp.interval;
    }
    tcursor += 1.2; // kleine Pause zwischen Gruppen
  }

  showBanner(state.wave % 10 === 0 ? `⚠️ BOSS-WELLE ${state.wave} ⚠️` : `WELLE ${state.wave}`);
  sfx("wave");
  updateHUD();
}

function showBanner(text) {
  const el = document.getElementById("wave-banner");
  el.textContent = text;
  el.classList.remove("hidden");
  // Animation neu starten
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => el.classList.add("hidden"), 2300);
}

/* ---------------- Entities ---------------- */

function spawnEnemy(typeKey) {
  const def = ENEMY_TYPES[typeKey];
  const hp = Math.round(def.hp * hpScale(state.wave));
  state.enemies.push({
    type: typeKey,
    def,
    hp, maxHp: hp,
    x: PATH[0].x, y: PATH[0].y,
    seg: 0,                 // aktueller Pfadabschnitt
    dist: 0,                // zurückgelegte Strecke (für Zielmodus "Erster")
    slowUntil: 0, slowFactor: 1,
    walkPhase: Math.random() * Math.PI * 2,
    dead: false,
  });
}

function moveEnemy(e, dt) {
  let speed = e.def.speed;
  if (state.time < e.slowUntil) speed *= e.slowFactor;
  let remaining = speed * dt;
  while (remaining > 0 && e.seg < PATH.length - 1) {
    const target = PATH[e.seg + 1];
    const dx = target.x - e.x, dy = target.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= remaining) {
      e.x = target.x; e.y = target.y;
      e.dist += d;
      remaining -= d;
      e.seg++;
    } else {
      e.x += (dx / d) * remaining;
      e.y += (dy / d) * remaining;
      e.dist += remaining;
      remaining = 0;
    }
  }
  if (e.seg >= PATH.length - 1) {
    // Gegner ist durchgekommen!
    e.dead = true;
    state.lives -= e.def.dmg;
    state.shake = Math.min(0.35, 0.12 + e.def.dmg * 0.01);
    sfx("leak");
    addText(W - 80, PATH[PATH.length - 1].y, `-${e.def.dmg} ❤️`, "#ff6b6b");
    if (state.lives <= 0) gameOver();
  }
}

function killEnemy(e) {
  e.dead = true;
  state.cash += e.def.reward;
  addText(e.x, e.y - 22, `+${e.def.reward}💰`, "#7ee787");
  sfx("die");
  // Todespartikel
  for (let i = 0; i < 10; i++) {
    state.particles.push({
      x: e.x, y: e.y,
      vx: (Math.random() - 0.5) * 160,
      vy: (Math.random() - 0.8) * 160,
      life: 0.5 + Math.random() * 0.3,
      maxLife: 0.8,
      size: 3 + Math.random() * 4,
      color: e.def.color,
      gravity: true,
    });
  }
  updateHUD();
}

function damageEnemy(e, dmg) {
  if (e.dead) return;
  e.hp -= dmg;
  if (e.hp <= 0) killEnemy(e);
}

function addText(x, y, text, color) {
  state.texts.push({ x, y, text, color, life: 1.0 });
}

/* ---------------- Türme ---------------- */

function towerStats(tower) {
  return TOWER_TYPES[tower.type].levels[tower.level];
}

function placeTower(typeKey, c, r) {
  const def = TOWER_TYPES[typeKey];
  if (state.cash < def.cost) return false;
  state.cash -= def.cost;
  state.towers.push({
    type: typeKey,
    c, r,
    x: (c + 0.5) * TILE,
    y: (r + 0.5) * TILE,
    level: 0,
    cooldown: 0,
    angle: -Math.PI / 2,
    targetMode: 0,          // 0=Erster 1=Letzter 2=Stärkster
    invested: def.cost,
    flash: 0,               // Mündungsfeuer-Timer
    tracer: null,           // {x,y,life} Schusslinie
  });
  sfx("place");
  // Platzier-Partikel
  for (let i = 0; i < 8; i++) {
    state.particles.push({
      x: (c + 0.5) * TILE, y: (r + 0.5) * TILE,
      vx: Math.cos((i / 8) * Math.PI * 2) * 70,
      vy: Math.sin((i / 8) * Math.PI * 2) * 70,
      life: 0.4, maxLife: 0.4, size: 4, color: "#ffd24a", gravity: false,
    });
  }
  updateHUD();
  return true;
}

function canPlaceAt(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
  if (pathTiles.has(c + "," + r)) return false;
  return !state.towers.some(t => t.c === c && t.r === r);
}

const TARGET_MODES = ["Erster", "Letzter", "Stärkster"];

function pickTarget(tower) {
  const st = towerStats(tower);
  let best = null, bestVal = -Infinity;
  for (const e of state.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - tower.x, e.y - tower.y);
    if (d > st.range) continue;
    let val;
    if (tower.targetMode === 0) val = e.dist;          // Erster (am weitesten)
    else if (tower.targetMode === 1) val = -e.dist;    // Letzter
    else val = e.hp;                                   // Stärkster
    if (val > bestVal) { bestVal = val; best = e; }
  }
  return best;
}

function updateTower(tower, dt) {
  const def = TOWER_TYPES[tower.type];
  if (def.kind === "farm") return;

  tower.cooldown -= dt;
  if (tower.flash > 0) tower.flash -= dt;
  if (tower.tracer) {
    tower.tracer.life -= dt;
    if (tower.tracer.life <= 0) tower.tracer = null;
  }

  const target = pickTarget(tower);
  if (!target) return;

  // Sanft zum Ziel drehen
  const desired = Math.atan2(target.y - tower.y, target.x - tower.x);
  let diff = desired - tower.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  tower.angle += diff * Math.min(1, dt * 12);

  if (tower.cooldown > 0) return;
  const st = towerStats(tower);
  tower.cooldown = 1 / st.rate;
  tower.flash = 0.06;

  if (def.kind === "hitscan") {
    damageEnemy(target, st.dmg);
    tower.tracer = { x: target.x, y: target.y, life: 0.07 };
    if (st.slow) {
      target.slowUntil = state.time + st.slowDur;
      target.slowFactor = 1 - st.slow;
      sfx("frost");
      for (let i = 0; i < 4; i++) {
        state.particles.push({
          x: target.x, y: target.y,
          vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60,
          life: 0.5, maxLife: 0.5, size: 3, color: "#aee9ff", gravity: false,
        });
      }
    } else {
      sfx(tower.type === "sniper" ? "sniper" : tower.type === "minigun" ? "minigun" : "shoot");
    }
  } else if (def.kind === "rocket") {
    state.projectiles.push({
      x: tower.x + Math.cos(tower.angle) * 18,
      y: tower.y + Math.sin(tower.angle) * 18,
      target,
      speed: 320,
      dmg: st.dmg,
      splash: st.splash,
      angle: tower.angle,
    });
    sfx("shoot");
  }
}

function updateProjectile(p, dt) {
  // Zielposition (falls Ziel tot: weiter zur letzten Position fliegen)
  if (!p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
  if (p.tx === undefined) { p.tx = p.target.x; p.ty = p.target.y; }

  const dx = p.tx - p.x, dy = p.ty - p.y;
  const d = Math.hypot(dx, dy);
  p.angle = Math.atan2(dy, dx);

  // Rauchspur
  if (Math.random() < 0.6) {
    state.particles.push({
      x: p.x, y: p.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20,
      life: 0.35, maxLife: 0.35, size: 3, color: "#9ca3af", gravity: false,
    });
  }

  const step = p.speed * dt;
  if (d <= step + 6) {
    explode(p.tx, p.ty, p.dmg, p.splash);
    return true; // entfernen
  }
  p.x += (dx / d) * step;
  p.y += (dy / d) * step;
  return false;
}

function explode(x, y, dmg, radius) {
  sfx("boom");
  state.shake = Math.max(state.shake, 0.15);
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - x, e.y - y) <= radius + 10) damageEnemy(e, dmg);
  }
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 140;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.3 + Math.random() * 0.3, maxLife: 0.6,
      size: 4 + Math.random() * 5,
      color: Math.random() < 0.5 ? "#fb923c" : "#fde047",
      gravity: false,
    });
  }
  state.particles.push({ x, y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, size: radius, color: "ring", gravity: false });
}

/* ---------------- Welle abschließen / Spielende ---------------- */

function finishWave() {
  const bonus = 60 + state.wave * 12;
  state.cash += bonus;
  addText(W / 2, H / 2 - 40, `Welle ${state.wave} geschafft! +${bonus}💰`, "#ffd24a");
  sfx("cash");

  // Farm-Einkommen
  let farmIncome = 0;
  for (const t of state.towers) {
    if (t.type === "farm") {
      const inc = towerStats(t).income;
      farmIncome += inc;
      addText(t.x, t.y - 26, `+${inc}💰`, "#bef264");
    }
  }
  state.cash += farmIncome;

  if (state.wave >= MAX_WAVE) {
    win();
    return;
  }
  state.wave++;
  state.phase = "idle";
  state.autoTimer = 3;
  updateHUD();
  refreshShop();
}

function gameOver() {
  state.running = false;
  sfx("lose");
  document.getElementById("go-wave").textContent = state.wave;
  document.getElementById("gameover-overlay").classList.remove("hidden");
}

function win() {
  state.running = false;
  sfx("win");
  document.getElementById("win-overlay").classList.remove("hidden");
}

function resetGame() {
  state.cash = START_CASH;
  state.lives = START_LIVES;
  state.wave = 1;
  state.phase = "idle";
  state.towers = [];
  state.enemies = [];
  state.projectiles = [];
  state.particles = [];
  state.texts = [];
  state.spawnQueue = [];
  state.placing = null;
  state.selected = null;
  state.running = true;
  state.autoTimer = 0;
  document.getElementById("gameover-overlay").classList.add("hidden");
  document.getElementById("win-overlay").classList.add("hidden");
  document.getElementById("menu-overlay").classList.add("hidden");
  hideTowerPanel();
  updateHUD();
  refreshShop();
}

/* ---------------- Haupt-Update ---------------- */

function update(dt) {
  if (!state.running) return;
  state.time += dt;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

  // Spawnen
  if (state.phase === "wave") {
    state.waveTime += dt;
    while (state.spawnQueue.length && state.spawnQueue[0].time <= state.waveTime) {
      spawnEnemy(state.spawnQueue.shift().type);
    }
  }

  // Gegner
  for (const e of state.enemies) {
    if (!e.dead) {
      moveEnemy(e, dt);
      e.walkPhase += dt * 9 * (state.time < e.slowUntil ? e.slowFactor : 1);
    }
  }
  state.enemies = state.enemies.filter(e => !e.dead);

  // Türme
  for (const t of state.towers) updateTower(t, dt);

  // Projektile
  state.projectiles = state.projectiles.filter(p => !updateProjectile(p, dt));

  // Partikel
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) p.vy += 300 * dt;
  }
  state.particles = state.particles.filter(p => p.life > 0);

  // Schwebende Texte
  for (const t of state.texts) { t.life -= dt * 0.8; t.y -= 28 * dt; }
  state.texts = state.texts.filter(t => t.life > 0);

  // Wellenende prüfen
  if (state.phase === "wave" && state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.phase = "idle";
    finishWave();
  }

  // Auto-Start
  if (state.phase === "idle" && state.autoStart && state.running) {
    state.autoTimer -= dt;
    if (state.autoTimer <= 0) startWave();
  }

  updateHUD();
}

/* =====================================================================
   RENDERING
   ===================================================================== */

function draw() {
  ctx.save();
  if (state.shake > 0) {
    ctx.translate((Math.random() - 0.5) * state.shake * 18, (Math.random() - 0.5) * state.shake * 18);
  }

  drawMap();
  drawDecorations();
  drawPlacementPreview();
  drawTowers();
  drawEnemies();
  drawProjectiles();
  drawParticles();
  drawTexts();
  drawSelection();

  ctx.restore();
}

/* ---------- Karte ---------- */

function drawMap() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE, y = r * TILE;
      if (pathTiles.has(c + "," + r)) {
        // Weg
        ctx.fillStyle = "#d4b483";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        if ((c + r) % 2 === 0) ctx.fillRect(x, y, TILE, TILE);
      } else {
        // Gras (Schachbrett)
        ctx.fillStyle = (c + r) % 2 === 0 ? "#69b54c" : "#5fa844";
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }

  // Wegränder zeichnen
  ctx.strokeStyle = "#a9885c";
  ctx.lineWidth = 3;
  for (const key of pathTiles) {
    const [c, r] = key.split(",").map(Number);
    const x = c * TILE, y = r * TILE;
    ctx.beginPath();
    if (!pathTiles.has(c + "," + (r - 1)) && r > 0) { ctx.moveTo(x, y); ctx.lineTo(x + TILE, y); }
    if (!pathTiles.has(c + "," + (r + 1)) && r < ROWS - 1) { ctx.moveTo(x, y + TILE); ctx.lineTo(x + TILE, y + TILE); }
    if (!pathTiles.has((c - 1) + "," + r) && c > 0) { ctx.moveTo(x, y); ctx.lineTo(x, y + TILE); }
    if (!pathTiles.has((c + 1) + "," + r) && c < COLS - 1) { ctx.moveTo(x + TILE, y); ctx.lineTo(x + TILE, y + TILE); }
    ctx.stroke();
  }

  // Eingangs-Pfeil und Basis am Ende
  const start = PATH[0];
  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  ctx.fillText("➡️", start.x + 26, start.y + 8);

  const end = PATH[PATH.length - 1];
  ctx.font = "30px Arial";
  ctx.fillText("🏰", end.x - 24, end.y + 11);
}

function drawDecorations() {
  for (const d of decorations) {
    if (state.towers.some(t => t.c === d.c && t.r === d.r)) continue;
    const x = (d.c + 0.3 + d.off * 0.4) * TILE;
    const y = (d.r + 0.3 + d.off * 0.4) * TILE;
    if (d.type === "tree") {
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(x - 3, y, 6, 12);
      ctx.fillStyle = "#3e8e41";
      ctx.beginPath(); ctx.arc(x, y - 6, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4caf50";
      ctx.beginPath(); ctx.arc(x - 4, y - 10, 9, 0, Math.PI * 2); ctx.fill();
    } else if (d.type === "rock") {
      ctx.fillStyle = "#9aa0a6";
      ctx.beginPath(); ctx.ellipse(x, y + 5, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#b8bdc4";
      ctx.beginPath(); ctx.ellipse(x - 2, y + 3, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = d.off < 0.5 ? "#f87171" : "#fde047";
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ---------- Roblox-artige Klötzchen-Figur ---------- */

function drawMinifig(x, y, scale, bodyColor, headColor, walkPhase, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const legSwing = walkPhase !== null ? Math.sin(walkPhase) * 4 : 0;
  const bob = walkPhase !== null ? Math.abs(Math.sin(walkPhase)) * 1.5 : 0;

  // Schatten
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(0, 16, 11, 4, 0, 0, Math.PI * 2); ctx.fill();

  ctx.translate(0, -bob);

  // Beine
  ctx.fillStyle = shade(bodyColor, -25);
  ctx.fillRect(-6, 6 + legSwing * 0.4, 5, 10 - legSwing * 0.4);
  ctx.fillRect(1, 6 - legSwing * 0.4, 5, 10 + legSwing * 0.4);

  // Torso
  ctx.fillStyle = bodyColor;
  roundRect(-8, -6, 16, 13, 2);
  ctx.fillStyle = shade(bodyColor, 18);
  roundRect(-8, -6, 16, 4, 2);

  // Arme
  ctx.fillStyle = shade(bodyColor, -12);
  ctx.fillRect(-12, -5, 4, 11);
  ctx.fillRect(8, -5, 4, 11);

  // Kopf
  ctx.fillStyle = headColor;
  roundRect(-6.5, -19, 13, 12, 3);

  // Gesicht
  ctx.fillStyle = "#1f2937";
  ctx.beginPath(); ctx.arc(-3, -14.5, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(3, -14.5, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (opts.angry) {
    ctx.arc(0, -8.5, 3, Math.PI * 1.15, Math.PI * 1.85); // trauriger/böser Mund
  } else {
    ctx.arc(0, -11.5, 3, Math.PI * 0.15, Math.PI * 0.85); // Lächeln
  }
  ctx.stroke();

  // Hut / Helm
  if (opts.hat) {
    ctx.fillStyle = opts.hat;
    roundRect(-7.5, -22, 15, 4, 2);
    ctx.fillRect(-5, -25, 10, 4);
  }

  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}

// Farbe heller/dunkler machen
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

/* ---------- Türme zeichnen ---------- */

function drawTowers() {
  for (const t of state.towers) {
    const def = TOWER_TYPES[t.type];

    // Sockel-Plattform
    ctx.fillStyle = "#6b7280";
    ctx.beginPath(); ctx.ellipse(t.x, t.y + 12, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#9ca3af";
    ctx.beginPath(); ctx.ellipse(t.x, t.y + 10, 18, 8, 0, 0, Math.PI * 2); ctx.fill();

    if (def.kind === "farm") {
      // Farm: kleines Feld mit Pflanzen
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(t.x - 16, t.y - 10, 32, 22);
      ctx.fillStyle = "#a16207";
      for (let i = 0; i < 3; i++) ctx.fillRect(t.x - 16, t.y - 8 + i * 7, 32, 2);
      ctx.fillStyle = "#84cc16";
      for (let i = 0; i < 4; i++) {
        const px = t.x - 12 + i * 8;
        const sway = Math.sin(state.time * 2 + i) * 1.5;
        ctx.fillRect(px - 1 + sway, t.y - 14 + (t.level >= 2 ? -3 : 0), 3, 9);
        ctx.fillStyle = "#fde047";
        ctx.beginPath(); ctx.arc(px + sway, t.y - 15 + (t.level >= 2 ? -3 : 0), 2.5 + t.level * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#84cc16";
      }
    } else {
      // Figur
      const hat = t.level >= 2 ? shade(def.color, -40) : null;
      drawMinifig(t.x, t.y, 1 + t.level * 0.05, def.color, "#fbbf24", null, { hat });

      // Waffe in Blickrichtung
      const gunLen = t.type === "sniper" ? 24 : t.type === "minigun" ? 18 : 16;
      const gx = t.x + Math.cos(t.angle) * 6;
      const gy = t.y - 6 + Math.sin(t.angle) * 6;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(t.angle);
      ctx.fillStyle = "#374151";
      ctx.fillRect(0, -2.5, gunLen, 5);
      if (t.type === "minigun") {
        ctx.fillStyle = "#4b5563";
        ctx.fillRect(2, -4.5, 10, 9);
      }
      if (t.type === "rocket") {
        ctx.fillStyle = "#7f1d1d";
        ctx.fillRect(0, -4, gunLen, 8);
      }
      if (t.type === "frost") {
        ctx.fillStyle = "#7dd3fc";
        ctx.beginPath(); ctx.arc(gunLen, 0, 4, 0, Math.PI * 2); ctx.fill();
      }
      // Mündungsfeuer
      if (t.flash > 0 && t.type !== "frost") {
        ctx.fillStyle = "#fde047";
        ctx.beginPath(); ctx.arc(gunLen + 3, 0, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // Schusslinie (Tracer)
      if (t.tracer) {
        ctx.strokeStyle = t.type === "frost" ? "rgba(125,211,252,0.9)" : "rgba(253,224,71,0.85)";
        ctx.lineWidth = t.type === "sniper" ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(t.x + Math.cos(t.angle) * (gunLen + 4), t.y - 6 + Math.sin(t.angle) * (gunLen + 4));
        ctx.lineTo(t.tracer.x, t.tracer.y);
        ctx.stroke();
      }
    }

    // Level-Sterne
    if (t.level > 0) {
      ctx.fillStyle = "#ffd24a";
      ctx.font = "bold 9px Arial";
      ctx.textAlign = "center";
      ctx.fillText("★".repeat(t.level), t.x, t.y - (def.kind === "farm" ? 22 : 28));
    }
  }
}

/* ---------- Gegner zeichnen ---------- */

function drawEnemies() {
  // Nach y sortieren, damit weiter unten stehende Figuren vorne sind
  const sorted = [...state.enemies].sort((a, b) => a.y - b.y);
  for (const e of sorted) {
    const slowed = state.time < e.slowUntil;
    drawMinifig(e.x, e.y, e.def.scale, slowed ? "#60a5fa" : e.def.color, e.def.headColor, e.walkPhase, { angry: true });

    if (e.type === "boss") {
      ctx.fillStyle = "#ffd24a";
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText("👑", e.x, e.y - 38 * e.def.scale);
    }

    // Lebensbalken
    const bw = 30 * e.def.scale;
    const frac = Math.max(0, e.hp / e.maxHp);
    const by = e.y - 24 * e.def.scale - 6;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 6);
    ctx.fillStyle = frac > 0.5 ? "#4ade80" : frac > 0.25 ? "#facc15" : "#ef4444";
    ctx.fillRect(e.x - bw / 2, by, bw * frac, 4);

    if (slowed) {
      ctx.fillStyle = "#bae6fd";
      ctx.font = "10px Arial";
      ctx.fillText("❄", e.x + bw / 2 + 6, by + 5);
    }
  }
}

/* ---------- Projektile & Partikel ---------- */

function drawProjectiles() {
  for (const p of state.projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(-7, -3, 14, 6);
    ctx.fillStyle = "#fca5a5";
    ctx.beginPath();
    ctx.moveTo(7, -3); ctx.lineTo(12, 0); ctx.lineTo(7, 3);
    ctx.fill();
    ctx.fillStyle = "#fb923c";
    ctx.beginPath(); ctx.arc(-8, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    if (p.color === "ring") {
      // Explosionsring
      ctx.strokeStyle = `rgba(251,146,60,${a})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - a) + p.size * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }
  }
}

function drawTexts() {
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  for (const t of state.texts) {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.fillStyle = "#000";
    ctx.fillText(t.text, t.x + 1, t.y + 1);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
    ctx.globalAlpha = 1;
  }
}

/* ---------- Platzierungs-Vorschau & Auswahl ---------- */

function drawPlacementPreview() {
  if (!state.placing || !state.mouse.inside) return;
  const c = Math.floor(state.mouse.x / TILE);
  const r = Math.floor(state.mouse.y / TILE);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;

  const ok = canPlaceAt(c, r);
  const def = TOWER_TYPES[state.placing];
  const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;

  // Reichweiten-Kreis
  if (def.kind !== "farm") {
    const range = def.levels[0].range;
    ctx.fillStyle = ok ? "rgba(255,255,255,0.13)" : "rgba(255,60,60,0.13)";
    ctx.strokeStyle = ok ? "rgba(255,255,255,0.5)" : "rgba(255,60,60,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  // Kachel-Markierung
  ctx.fillStyle = ok ? "rgba(126,231,135,0.4)" : "rgba(255,60,60,0.45)";
  ctx.fillRect(c * TILE, r * TILE, TILE, TILE);

  // Geister-Turm
  ctx.globalAlpha = 0.65;
  if (def.kind === "farm") {
    ctx.fillStyle = "#854d0e";
    ctx.fillRect(x - 16, y - 10, 32, 22);
  } else {
    drawMinifig(x, y, 1, def.color, "#fbbf24", null, {});
  }
  ctx.globalAlpha = 1;
}

function drawSelection() {
  const t = state.selected;
  if (!t) return;
  const def = TOWER_TYPES[t.type];
  if (def.kind !== "farm") {
    const range = towerStats(t).range;
    ctx.fillStyle = "rgba(255,210,74,0.10)";
    ctx.strokeStyle = "rgba(255,210,74,0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.strokeStyle = "#ffd24a";
  ctx.lineWidth = 3;
  ctx.strokeRect(t.c * TILE + 2, t.r * TILE + 2, TILE - 4, TILE - 4);
}

/* =====================================================================
   UI / DOM
   ===================================================================== */

function updateHUD() {
  document.getElementById("cash").textContent = state.cash;
  document.getElementById("lives").textContent = Math.max(0, state.lives);
  document.getElementById("wave").textContent = state.wave;
  document.getElementById("maxwave").textContent = MAX_WAVE;

  const btn = document.getElementById("btn-start");
  btn.disabled = state.phase !== "idle" || !state.running;
  btn.textContent = state.phase === "wave" ? "🌊 Welle läuft…" : "▶ Welle starten";

  // Shop-Karten: bezahlbar/gesperrt aktualisieren
  for (const [key, def] of Object.entries(TOWER_TYPES)) {
    const card = document.getElementById("card-" + key);
    if (!card) continue;
    const locked = state.wave < def.unlockWave;
    card.classList.toggle("locked", locked);
    const costEl = card.querySelector(".shop-cost");
    costEl.style.color = state.cash >= def.cost && !locked ? "#7ee787" : "#f87171";
  }

  if (state.selected) refreshTowerPanel();
}

function refreshShop() {
  const shop = document.getElementById("shop");
  if (!shop.dataset.built) {
    shop.dataset.built = "1";
    for (const [key, def] of Object.entries(TOWER_TYPES)) {
      const card = document.createElement("div");
      card.className = "shop-card";
      card.id = "card-" + key;
      card.innerHTML = `
        <div class="shop-icon" style="background:${def.color}">${def.icon}</div>
        <div class="shop-info">
          <div class="shop-name">${def.name}</div>
          <div class="shop-desc">${def.desc}</div>
        </div>
        <div class="shop-cost">$${def.cost}</div>`;
      card.addEventListener("click", () => {
        ensureAudio();
        if (state.wave < def.unlockWave) {
          addText(W / 2, H / 2, `${def.name} ab Welle ${def.unlockWave}!`, "#f87171");
          return;
        }
        if (state.cash < def.cost) {
          addText(W / 2, H / 2, "Nicht genug Geld!", "#f87171");
          return;
        }
        selectTower(null);
        state.placing = state.placing === key ? null : key;
        refreshShopSelection();
      });
      shop.appendChild(card);
    }
  }
  // Gesperrte Türme anzeigen
  for (const [key, def] of Object.entries(TOWER_TYPES)) {
    const card = document.getElementById("card-" + key);
    const descEl = card.querySelector(".shop-desc");
    descEl.textContent = state.wave < def.unlockWave ? `🔒 Ab Welle ${def.unlockWave}` : def.desc;
  }
  refreshShopSelection();
  updateHUD();
}

function refreshShopSelection() {
  for (const key of Object.keys(TOWER_TYPES)) {
    document.getElementById("card-" + key).classList.toggle("selected", state.placing === key);
  }
}

function selectTower(tower) {
  state.selected = tower;
  if (tower) {
    state.placing = null;
    refreshShopSelection();
    refreshTowerPanel();
    document.getElementById("tower-panel").classList.remove("hidden");
  } else {
    hideTowerPanel();
  }
}

function hideTowerPanel() {
  document.getElementById("tower-panel").classList.add("hidden");
}

function refreshTowerPanel() {
  const t = state.selected;
  if (!t) return;
  const def = TOWER_TYPES[t.type];
  const st = towerStats(t);

  document.getElementById("tp-name").textContent = `${def.icon} ${def.name}`;
  document.getElementById("tp-level").textContent =
    `Level ${t.level + 1}/5 ${"★".repeat(t.level)}`;

  let stats = "";
  if (def.kind === "farm") {
    stats = `💰 Einkommen: <b>${st.income}</b> / Welle`;
  } else {
    stats = `⚔️ Schaden: <b>${st.dmg}</b><br>📏 Reichweite: <b>${st.range}</b><br>⏱️ Feuerrate: <b>${st.rate}/s</b>`;
    if (st.slow) stats += `<br>❄️ Verlangsamung: <b>${Math.round(st.slow * 100)}%</b> für ${st.slowDur}s`;
    if (st.splash) stats += `<br>💥 Splash-Radius: <b>${st.splash}</b>`;
  }
  document.getElementById("tp-stats").innerHTML = stats;

  const upBtn = document.getElementById("btn-upgrade");
  if (st.upgradeCost === null) {
    upBtn.textContent = "✅ MAX LEVEL";
    upBtn.disabled = true;
  } else {
    upBtn.textContent = `🆙 Upgrade ($${st.upgradeCost})`;
    upBtn.disabled = state.cash < st.upgradeCost;
  }

  const tgtBtn = document.getElementById("btn-target");
  tgtBtn.style.display = def.kind === "farm" ? "none" : "";
  tgtBtn.textContent = `🎯 Ziel: ${TARGET_MODES[t.targetMode]}`;

  document.getElementById("btn-sell").textContent =
    `💸 Verkaufen ($${Math.floor(t.invested * 0.7)})`;
}

/* ---------------- Eingaben ---------------- */

function canvasPos(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (W / rect.width),
    y: (ev.clientY - rect.top) * (H / rect.height),
  };
}

canvas.addEventListener("mousemove", (ev) => {
  const p = canvasPos(ev);
  state.mouse.x = p.x; state.mouse.y = p.y; state.mouse.inside = true;
});
canvas.addEventListener("mouseleave", () => { state.mouse.inside = false; });

canvas.addEventListener("click", (ev) => {
  ensureAudio();
  if (!state.running) return;
  const p = canvasPos(ev);
  const c = Math.floor(p.x / TILE), r = Math.floor(p.y / TILE);

  if (state.placing) {
    if (canPlaceAt(c, r)) {
      const ok = placeTower(state.placing, c, r);
      if (ok && state.cash < TOWER_TYPES[state.placing].cost) {
        // Kein Geld mehr für einen weiteren → Platzierungsmodus beenden
        state.placing = null;
        refreshShopSelection();
      }
    } else {
      addText(p.x, p.y, "Hier nicht möglich!", "#f87171");
    }
    return;
  }

  // Turm auswählen?
  const hit = state.towers.find(t => t.c === c && t.r === r);
  selectTower(hit || null);
});

canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  state.placing = null;
  selectTower(null);
  refreshShopSelection();
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    state.placing = null;
    selectTower(null);
    refreshShopSelection();
  }
  if (ev.key === " " && state.running) {
    ev.preventDefault();
    if (state.phase === "idle") startWave();
  }
});

/* ---------------- Buttons ---------------- */

document.getElementById("btn-play").addEventListener("click", () => { ensureAudio(); resetGame(); });
document.getElementById("btn-retry").addEventListener("click", () => { ensureAudio(); resetGame(); });
document.getElementById("btn-again").addEventListener("click", () => { ensureAudio(); resetGame(); });

document.getElementById("btn-start").addEventListener("click", () => { ensureAudio(); startWave(); });

document.getElementById("chk-auto").addEventListener("change", (ev) => {
  state.autoStart = ev.target.checked;
  state.autoTimer = 2;
});

document.getElementById("btn-speed").addEventListener("click", (ev) => {
  state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1;
  ev.target.textContent = `⏩ ${state.speed}x`;
});

document.getElementById("btn-sound").addEventListener("click", (ev) => {
  ensureAudio();
  state.soundOn = !state.soundOn;
  ev.target.textContent = state.soundOn ? "🔊" : "🔇";
});

document.getElementById("btn-upgrade").addEventListener("click", () => {
  const t = state.selected;
  if (!t) return;
  const st = towerStats(t);
  if (st.upgradeCost === null || state.cash < st.upgradeCost) return;
  state.cash -= st.upgradeCost;
  t.invested += st.upgradeCost;
  t.level++;
  sfx("upgrade");
  addText(t.x, t.y - 30, "LEVEL UP!", "#ffd24a");
  updateHUD();
});

document.getElementById("btn-target").addEventListener("click", () => {
  const t = state.selected;
  if (!t) return;
  t.targetMode = (t.targetMode + 1) % TARGET_MODES.length;
  refreshTowerPanel();
});

document.getElementById("btn-sell").addEventListener("click", () => {
  const t = state.selected;
  if (!t) return;
  state.cash += Math.floor(t.invested * 0.7);
  state.towers = state.towers.filter(x => x !== t);
  selectTower(null);
  sfx("sell");
  updateHUD();
});

/* ---------------- Game-Loop ---------------- */

let lastTime = performance.now();
function loop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 0.05); // bei Tab-Wechsel keine Riesensprünge

  // Spielgeschwindigkeit: Simulation mehrfach pro Frame
  for (let i = 0; i < state.speed; i++) update(dt);

  draw();
  requestAnimationFrame(loop);
}

refreshShop();
updateHUD();
requestAnimationFrame(loop);
