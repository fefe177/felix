/* =====================================================================
   BLOX TOWER DEFENSE 3D
   Ein Tower-Defense-Spiel im Roblox-Stil mit echter 3D-Ansicht (Three.js)
   – Menüsystem mit Modus- & Kartenauswahl, 5 Karten, Shop, Rekorde –
   ===================================================================== */

"use strict";

/* ---------------- Konstanten & Grundeinstellungen ---------------- */

const TILE = 48;            // Kachelgröße in Welt-Einheiten
const COLS = 20;            // Spielfeld-Spalten
const ROWS = 13;            // Spielfeld-Zeilen
const W = COLS * TILE;      // 960
const D = ROWS * TILE;      // 624 (Tiefe des Felds)
const MAX_WAVE = 40;
const START_CASH = 500;
const START_LIVES = 100;

/* ---------------- Turm-Definitionen ----------------
   Jeder Turm hat 5 Level (Level 0 = Kaufzustand). */

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
  flame: {
    name: "Flammenwerfer",
    icon: "🔥",
    color: "#f97316",
    desc: "Verbrennt ganze Gruppen",
    cost: 650,
    unlockWave: 6,
    kind: "flame",
    levels: [
      { dmg: 3,  range: 95,  rate: 4, burn: 4,  burnDur: 2.0, targets: 3, upgradeCost: 450 },
      { dmg: 5,  range: 100, rate: 4, burn: 7,  burnDur: 2.2, targets: 3, upgradeCost: 900 },
      { dmg: 7,  range: 110, rate: 5, burn: 10, burnDur: 2.5, targets: 4, upgradeCost: 1900 },
      { dmg: 10, range: 120, rate: 5, burn: 16, burnDur: 3.0, targets: 5, upgradeCost: 3800 },
      { dmg: 16, range: 130, rate: 6, burn: 26, burnDur: 3.0, targets: 6, upgradeCost: null },
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
  tesla: {
    name: "Tesla",
    icon: "⚡",
    color: "#8b5cf6",
    desc: "Kettenblitz auf mehrere Gegner",
    cost: 1100,
    unlockWave: 12,
    kind: "tesla",
    levels: [
      { dmg: 30,  range: 150, rate: 0.8, chains: 3, upgradeCost: 700 },
      { dmg: 45,  range: 160, rate: 0.9, chains: 4, upgradeCost: 1400 },
      { dmg: 70,  range: 170, rate: 1.0, chains: 5, upgradeCost: 2800 },
      { dmg: 110, range: 180, rate: 1.1, chains: 6, upgradeCost: 5500 },
      { dmg: 170, range: 195, rate: 1.3, chains: 8, upgradeCost: null },
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
  normal:  { name: "Zombie",   hp: 45,   speed: 55,  reward: 8,   dmg: 1,  scale: 1.0,  color: "#4ade80", headColor: "#86efac" },
  fast:    { name: "Flitzer",  hp: 30,   speed: 115, reward: 10,  dmg: 1,  scale: 0.85, color: "#facc15", headColor: "#fde047" },
  heavy:   { name: "Brocken",  hp: 170,  speed: 38,  reward: 18,  dmg: 2,  scale: 1.2,  color: "#94a3b8", headColor: "#cbd5e1" },
  armored: { name: "Panzer",   hp: 420,  speed: 32,  reward: 35,  dmg: 3,  scale: 1.3,  color: "#475569", headColor: "#64748b" },
  demon:   { name: "Dämon",    hp: 900,  speed: 45,  reward: 70,  dmg: 5,  scale: 1.35, color: "#a855f7", headColor: "#c084fc" },
  healer:  { name: "Heiler",   hp: 260,  speed: 40,  reward: 30,  dmg: 2,  scale: 1.1,  color: "#f8fafc", headColor: "#fde68a", heals: { radius: 95, frac: 0.05, interval: 1 } },
  boss:    { name: "BOSS",     hp: 3500, speed: 26,  reward: 400, dmg: 25, scale: 1.8,  color: "#dc2626", headColor: "#ef4444" },
};

/* ---------------- Die 5 Karten ----------------
   Jede Karte hat eigenen Weg, Farben, Deko-Thema und Schwierigkeit. */

const MAPS = {
  grasslands: {
    name: "Grasslands", icon: "🌲", stars: 1, diffName: "Einfach", hpMult: 1.0,
    desc: "Grüne Wiesen, Holzbrücken, kleine Häuser",
    grass: [0x69b54c, 0x5fa844], path: [0xd4b483, 0xcaa973],
    sky: 0x87ceeb, water: 0x2f7fd1, earth: 0x8a6437,
    deco: "grass", clouds: true,
    waypoints: [[-1, 2], [3, 2], [3, 6], [8, 6], [8, 2], [13, 2], [13, 9], [5, 9], [5, 11], [17, 11], [17, 5], [20, 5]],
  },
  desert: {
    name: "Desert Valley", icon: "🏜", stars: 2, diffName: "Mittel", hpMult: 1.15,
    desc: "Sand, Kakteen und alte Ruinen",
    grass: [0xe3c47f, 0xd8b76d], path: [0xb5916b, 0xa8845f],
    sky: 0xf0c98c, water: 0x3a98c9, earth: 0xa07840,
    deco: "desert", clouds: true,
    waypoints: [[-1, 6], [4, 6], [4, 2], [9, 2], [9, 10], [14, 10], [14, 4], [20, 4]],
  },
  frozen: {
    name: "Frozen Base", icon: "❄", stars: 3, diffName: "Mittel", hpMult: 1.3,
    desc: "Schnee, Eiswege, gefrorene Gebäude",
    grass: [0xeef4f8, 0xdfe9f0], path: [0xa8d8ec, 0x97cce4],
    sky: 0xbcd8e8, water: 0x6fb1d8, earth: 0x9aa7b5,
    deco: "snow", clouds: true,
    waypoints: [[-1, 10], [3, 10], [3, 3], [7, 3], [7, 8], [12, 8], [12, 3], [16, 3], [16, 10], [20, 10]],
  },
  volcano: {
    name: "Volcano Island", icon: "🌋", stars: 4, diffName: "Schwer", hpMult: 1.5,
    desc: "Lava, Vulkane und schwarze Felsen",
    grass: [0x4a4a52, 0x404048], path: [0x705a4a, 0x665142],
    sky: 0x5a3845, water: 0xe25822, waterGlow: 0x892a0a, earth: 0x332f33,
    deco: "volcano", clouds: false,
    waypoints: [[-1, 2], [6, 2], [6, 11], [11, 11], [11, 5], [15, 5], [15, 9], [20, 9]],
  },
  space: {
    name: "Space Station", icon: "🌌", stars: 5, diffName: "Extrem", hpMult: 1.75,
    desc: "Weltraum, Neonblöcke, schwebende Plattformen",
    grass: [0x2b3052, 0x242a48], path: [0x3a9aa8, 0x32909e],
    sky: 0x070b1a, water: 0x0a0e22, earth: 0x141831,
    deco: "space", clouds: false,
    waypoints: [[-1, 6], [2, 6], [2, 2], [6, 2], [6, 10], [10, 10], [10, 2], [14, 2], [14, 10], [18, 10], [18, 6], [20, 6]],
  },
};
const MAP_ORDER = ["grasslands", "desert", "frozen", "volcano", "space"];

// Pfad-Kacheln aus Wegpunkten berechnen
function computePathTiles(waypoints) {
  const tiles = new Set();
  for (let i = 0; i < waypoints.length - 1; i++) {
    let [c1, r1] = waypoints[i];
    let [c2, r2] = waypoints[i + 1];
    const dc = Math.sign(c2 - c1), dr = Math.sign(r2 - r1);
    let c = c1, r = r1;
    while (true) {
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) tiles.add(c + "," + r);
      if (c === c2 && r === r2) break;
      c += dc; r += dr;
    }
  }
  return tiles;
}

// Aktive Karte (wird von buildMap gesetzt)
let PATH = [];
let pathTiles = new Set();

function seededRandom(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/* ---------------- Spielzustand ---------------- */

const state = {
  mode: "menu",          // "menu" | "lobby" | "game"
  map: localStorage.getItem("btd_map") || "grasslands",
  running: false,
  paused: false,
  cash: START_CASH,
  lives: START_LIVES,
  wave: 1,
  kills: 0,
  phase: "idle",         // "idle" | "wave"
  speed: 1,
  autoStart: false,
  autoTimer: 0,
  towers: [],
  enemies: [],
  dying: [],             // sterbende Gegner (Umfall-Animation)
  projectiles: [],
  particles: [],
  tracers: [],
  rings: [],
  bolts: [],             // Tesla-Blitze
  spawnQueue: [],
  waveTime: 0,
  placing: null,
  selected: null,
  hoverTile: null,
  time: 0,
  shake: 0,
  settings: { sound: true, music: true, shadows: true, dmgNumbers: true },
};

/* ---------------- Speicherstände (localStorage) ---------------- */

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch (e) { return fallback; }
}

// Rekorde pro Karte: { mapKey: besteWelle }
function loadRecords() { return loadJSON("btd_records", {}); }
function saveRecord(mapKey, wave) {
  const rec = loadRecords();
  if (!rec[mapKey] || wave > rec[mapKey]) {
    rec[mapKey] = wave;
    localStorage.setItem("btd_records", JSON.stringify(rec));
    return true;
  }
  return false;
}
function recordText(mapKey) {
  const rec = loadRecords()[mapKey];
  if (!rec) return "Noch kein Rekord";
  if (rec > MAX_WAVE) return "✅ Geschafft!";
  return `Rekord: Welle ${rec}`;
}

// Münzen (Meta-Währung für Skins)
function getCoins() { return loadJSON("btd_coins", 0); }
function addCoins(n) { localStorage.setItem("btd_coins", JSON.stringify(Math.max(0, getCoins() + n))); }

// Skins für die Lobby-Figur
const SKINS = [
  { id: "classic", name: "Classic",       body: "#3b82f6", hat: "#dc2626", price: 0 },
  { id: "ritter",  name: "Roter Ritter",  body: "#dc2626", hat: "#7f1d1d", price: 50 },
  { id: "ninja",   name: "Grüner Ninja",  body: "#16a34a", hat: "#064e3b", price: 50 },
  { id: "magier",  name: "Magier",        body: "#8b5cf6", hat: "#4c1d95", price: 120 },
  { id: "gold",    name: "Goldener Held", body: "#f59e0b", hat: "#fbbf24", price: 200 },
  { id: "schatten", name: "Schatten",     body: "#1f2937", hat: "#111827", price: 300 },
];
function getOwnedSkins() { return loadJSON("btd_skins", ["classic"]); }
function getEquippedSkin() {
  const id = localStorage.getItem("btd_skin") || "classic";
  return SKINS.find(s => s.id === id) || SKINS[0];
}

// Einstellungen
function loadSettings() {
  Object.assign(state.settings, loadJSON("btd_settings", {}));
}
function saveSettings() {
  localStorage.setItem("btd_settings", JSON.stringify(state.settings));
}

/* ---------------- Sound (WebAudio, ohne Dateien) ---------------- */

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
}
function sfx(type) {
  if (!state.settings.sound || !audioCtx) return;
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
    case "zap":     tone(1400, 0.10, 0.07, "sawtooth", 250); break;
    case "flame":   tone(110, 0.12, 0.035, "sawtooth", 55); break;
    case "heal":    tone(660, 0.12, 0.05, "sine", 990); break;
    case "click":   tone(700, 0.06, 0.05, "triangle", 500); break;
    case "win":     tone(523, 0.5, 0.12, "triangle", 1046); break;
    case "lose":    tone(300, 0.8, 0.14, "sawtooth", 50); break;
  }
}

/* ---------------- Hintergrundmusik (WebAudio-Sequencer) ---------------- */

const MELODY = [
  523, 0, 659, 0, 784, 0, 659, 0, 523, 0, 659, 0, 880, 784, 659, 0,
  587, 0, 659, 0, 784, 0, 880, 0, 1047, 0, 880, 0, 784, 659, 587, 0,
];
const BASS = [131, 0, 0, 0, 165, 0, 0, 0, 110, 0, 0, 0, 196, 0, 0, 0];
let musicStep = 0;

function musicTick() {
  const active = state.running || state.mode === "lobby";
  if (!state.settings.music || !audioCtx || !active || state.paused) return;
  const t = audioCtx.currentTime;

  const note = MELODY[musicStep % MELODY.length];
  if (note) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "triangle";
    o.frequency.value = note;
    g.gain.setValueAtTime(0.030, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.22);
  }
  const bass = BASS[musicStep % BASS.length];
  if (bass) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "square";
    o.frequency.value = bass;
    g.gain.setValueAtTime(0.022, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.3);
  }
  musicStep++;
}
setInterval(musicTick, 200);

/* =====================================================================
   THREE.JS – SZENE, KAMERA, LICHT
   ===================================================================== */

const container = document.getElementById("game3d");
const fxLayer = document.getElementById("fx-layer");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 1600, 3200);

const camera = new THREE.PerspectiveCamera(55, 3 / 2, 1, 6000);
const CAM_HOME = { pos: new THREE.Vector3(W / 2, 470, D + 300), target: new THREE.Vector3(W / 2, 0, D / 2 - 20) };
camera.position.copy(CAM_HOME.pos);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.copy(CAM_HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 180;
controls.maxDistance = 1500;
controls.maxPolarAngle = 1.35;
controls.screenSpacePanning = false;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.update();

// Licht
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x6da14e, 0.85));
const sun = new THREE.DirectionalLight(0xfff2cc, 1.0);
sun.position.set(W * 0.25, 700, D * 0.05);
sun.target.position.set(W / 2, 0, D / 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -750;
sun.shadow.camera.right = 750;
sun.shadow.camera.top = 600;
sun.shadow.camera.bottom = -600;
sun.shadow.camera.far = 2000;
scene.add(sun, sun.target);

// Welt-Gruppe (für Kamera-Wackeln bei Treffern)
const world = new THREE.Group();
scene.add(world);

// Karten-Inhalt (wird pro Karte neu gebaut)
const mapGroup = new THREE.Group();
world.add(mapGroup);

// Wasser rund um Insel und Lobby (Farbe je nach Karte – auf Volcano: Lava!)
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(12000, 12000),
  new THREE.MeshLambertMaterial({ color: 0x2f7fd1, transparent: true, opacity: 0.92 })
);
water.rotation.x = -Math.PI / 2;
water.position.set(W / 2, -44, D / 2);
water.receiveShadow = true;
scene.add(water);

// Größe an Container anpassen
function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);
resize();

/* ---------------- Hilfsfunktionen ---------------- */

function shadeColor(hex, amt) {
  const c = new THREE.Color(hex);
  c.r = Math.max(0, Math.min(1, c.r + amt));
  c.g = Math.max(0, Math.min(1, c.g + amt));
  c.b = Math.max(0, Math.min(1, c.b + amt));
  return c;
}

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function box(wd, ht, dp, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(wd, ht, dp), material);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true;
  return m;
}

function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    }
  });
}

function approachAngle(current, target, k) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, k);
}

/* =====================================================================
   KARTEN-AUFBAU – baut die Spiel-Insel je nach Thema neu
   ===================================================================== */

let startArrow = null;
let decoByTile = new Map();

// Wolken (global, werden auf dunklen Karten ausgeblendet)
const cloudGroup = new THREE.Group();
world.add(cloudGroup);
const clouds = [];
{
  const rnd = seededRandom(777);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    g.add(box(70 + rnd() * 50, 22, 40, m, 0, 0, 0));
    g.add(box(45, 18, 30, m, 35 + rnd() * 20, 12, 5));
    g.add(box(40, 16, 28, m, -38, 8, -4));
    g.children.forEach(c => { c.castShadow = false; });
    g.position.set(rnd() * W, 330 + rnd() * 120, rnd() * D);
    g.userData.speed = 6 + rnd() * 8;
    cloudGroup.add(g);
    clouds.push(g);
  }
}

// Themen-Deko: liefert je nach Karte eine kleine Deko-Gruppe (oder null)
function makeThemeDeco(theme, v, off) {
  let g = null;
  if (theme === "grass") {
    if (v < 0.07) {
      g = new THREE.Group();
      g.add(box(7, 18, 7, lambert(0x7a5230), 0, 9, 0));
      g.add(box(26, 18, 26, lambert(0x3e8e41), 0, 26, 0));
      g.add(box(18, 13, 18, lambert(0x4caf50), 0, 41, 0));
    } else if (v < 0.11) {
      g = new THREE.Group();
      const rock = box(16, 11, 13, lambert(0x9aa0a6), 0, 5, 0);
      rock.rotation.y = off * 2;
      g.add(rock);
      g.add(box(8, 6, 7, lambert(0xb8bdc4), 5, 11, 2));
    } else if (v < 0.18) {
      g = new THREE.Group();
      g.add(box(1.6, 7, 1.6, lambert(0x3e8e41), 0, 3.5, 0));
      g.add(box(5, 4, 5, lambert(off < 0.5 ? 0xf87171 : 0xfde047), 0, 8.5, 0));
    }
  } else if (theme === "desert") {
    if (v < 0.07) {
      // Kaktus
      g = new THREE.Group();
      g.add(box(9, 32, 9, lambert(0x3f9b4f), 0, 16, 0));
      g.add(box(7, 14, 7, lambert(0x44a655), -10, 22, 0));
      g.add(box(7, 11, 7, lambert(0x44a655), 10, 18, 0));
    } else if (v < 0.11) {
      // Ruinen-Säule (oben abgebrochen)
      g = new THREE.Group();
      g.add(box(13, 10, 13, lambert(0xcdb088), 0, 5, 0));
      const pillar = box(10, 22 + off * 14, 10, lambert(0xd9bd92), 0, 16 + off * 7, 0);
      pillar.rotation.y = off;
      g.add(pillar);
    } else if (v < 0.18) {
      g = new THREE.Group();
      const rock = box(12, 8, 10, lambert(0xc4a06a), 0, 4, 0);
      rock.rotation.y = off * 2;
      g.add(rock);
    }
  } else if (theme === "snow") {
    if (v < 0.07) {
      // Verschneiter Baum
      g = new THREE.Group();
      g.add(box(7, 16, 7, lambert(0x6b4a30), 0, 8, 0));
      g.add(box(26, 16, 26, lambert(0x2f6e4f), 0, 24, 0));
      g.add(box(28, 5, 28, lambert(0xf0f6fa), 0, 34, 0));
      g.add(box(17, 11, 17, lambert(0x37805c), 0, 42, 0));
      g.add(box(19, 4, 19, lambert(0xffffff), 0, 49, 0));
    } else if (v < 0.10) {
      // Schneemann
      g = new THREE.Group();
      g.add(box(16, 14, 16, lambert(0xffffff), 0, 7, 0));
      g.add(box(12, 11, 12, lambert(0xf4f8fb), 0, 19, 0));
      const nose = box(2.5, 2.5, 7, lambert(0xf97316), 0, 21, 8);
      g.add(nose);
    } else if (v < 0.17) {
      // Eiskristall
      g = new THREE.Group();
      const ice = new THREE.Mesh(
        new THREE.IcosahedronGeometry(7 + off * 4, 0),
        new THREE.MeshLambertMaterial({ color: 0xbfeaff, emissive: 0x2a6e96, emissiveIntensity: 0.35 })
      );
      ice.position.y = 7;
      ice.rotation.set(off, off * 2, 0);
      ice.castShadow = true;
      g.add(ice);
    }
  } else if (theme === "volcano") {
    if (v < 0.08) {
      // Schwarzer Felsen
      g = new THREE.Group();
      const rock = box(18, 16, 15, lambert(0x26262c), 0, 8, 0);
      rock.rotation.y = off * 2;
      g.add(rock);
      g.add(box(9, 8, 8, lambert(0x33333a), 6, 18, 2));
    } else if (v < 0.13) {
      // Lava-Pfütze
      g = new THREE.Group();
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(9 + off * 5, 10),
        new THREE.MeshLambertMaterial({ color: 0xff7a33, emissive: 0xd64018, emissiveIntensity: 0.8 })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.6;
      g.add(pool);
    } else if (v < 0.18) {
      // Glut-Stein
      g = new THREE.Group();
      const rock = box(9, 7, 8, lambert(0x33333a), 0, 3.5, 0);
      g.add(rock);
      g.add(box(3, 3, 3, new THREE.MeshLambertMaterial({ color: 0xff9a4d, emissive: 0xd64018, emissiveIntensity: 0.9 }), 3, 7, 1));
    }
  } else if (theme === "space") {
    if (v < 0.07) {
      // Neon-Pylon
      g = new THREE.Group();
      g.add(box(10, 26, 10, lambert(0x1b2040), 0, 13, 0));
      g.add(box(12, 4, 12, new THREE.MeshLambertMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.9 }), 0, 28, 0));
    } else if (v < 0.11) {
      // Schwebende Plattform
      g = new THREE.Group();
      const plat = box(20, 5, 20, lambert(0x2a3158), 0, 22 + off * 10, 0);
      g.add(plat);
      g.add(box(22, 1.5, 22, new THREE.MeshLambertMaterial({ color: 0xa78bfa, emissive: 0x7c3aed, emissiveIntensity: 0.7 }), 0, 25.5 + off * 10, 0));
    } else if (v < 0.18) {
      // Leucht-Stud
      g = new THREE.Group();
      g.add(box(5, 5, 5, new THREE.MeshLambertMaterial({ color: 0x67e8f9, emissive: 0x0ea5e9, emissiveIntensity: 0.8 }), 0, 2.5, 0));
    }
  }
  return g;
}

// Große, fest platzierte Extras pro Karte
function buildMapExtras(mapKey, registerDeco) {
  const extras = [];
  if (mapKey === "grasslands") {
    // Kleine Häuser
    for (const [c, r] of [[1, 11], [18, 1]]) {
      const h = new THREE.Group();
      h.add(box(32, 24, 28, lambert(0xd9c089), 0, 12, 0));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(26, 18, 4), lambert(0xb33939));
      roof.position.y = 32; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
      h.add(roof);
      h.add(box(9, 13, 3, lambert(0x5b3a1e), 0, 6.5, 14.5));
      h.add(box(7, 7, 2, lambert(0x9cc8e8), 10, 15, 14));
      h.position.set((c + 0.5) * TILE, 0, (r + 0.5) * TILE);
      registerDeco(c, r, h);
      extras.push(h);
    }
    // Teich mit Holzbrücke
    const pondG = new THREE.Group();
    const pond = new THREE.Mesh(new THREE.CircleGeometry(34, 18), lambert(0x4aa3df));
    pond.rotation.x = -Math.PI / 2;
    pond.position.y = 0.7;
    pondG.add(pond);
    for (let i = 0; i < 5; i++) {
      pondG.add(box(10, 2.5, 13, lambert(0x9a6b3f), -22 + i * 11, 3.5, 0));
    }
    pondG.add(box(54, 2.5, 2.5, lambert(0x7a5230), 0, 8, 7.5));
    pondG.add(box(54, 2.5, 2.5, lambert(0x7a5230), 0, 8, -7.5));
    pondG.position.set(10.5 * TILE, 0, 12.4 * TILE);
    registerDeco(10, 12, pondG);
    extras.push(pondG);
  } else if (mapKey === "desert") {
    // Große Ruine (Torbogen)
    const ruin = new THREE.Group();
    ruin.add(box(12, 44, 12, lambert(0xd9bd92), -20, 22, 0));
    ruin.add(box(12, 34, 12, lambert(0xcdb088), 20, 17, 0));
    ruin.add(box(34, 9, 13, lambert(0xd9bd92), -6, 46, 0));
    ruin.add(box(14, 6, 14, lambert(0xc4a06a), 22, 3, 14));
    ruin.position.set(1.5 * TILE, 0, 1.5 * TILE);
    ruin.rotation.y = 0.5;
    registerDeco(1, 1, ruin);
    extras.push(ruin);
  } else if (mapKey === "frozen") {
    // Gefrorenes Gebäude (Eis-Bunker)
    const bunker = new THREE.Group();
    bunker.add(box(40, 26, 34, new THREE.MeshLambertMaterial({ color: 0xcfe9f5, transparent: true, opacity: 0.92 }), 0, 13, 0));
    bunker.add(box(44, 6, 38, lambert(0xffffff), 0, 29, 0));
    bunker.add(box(10, 14, 3, lambert(0x7eb8d8), 0, 7, 17.5));
    bunker.position.set(1.5 * TILE, 0, 1.5 * TILE);
    registerDeco(1, 1, bunker);
    extras.push(bunker);
  } else if (mapKey === "volcano") {
    // Großer Vulkan
    const volcano = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(55, 80, 8), lambert(0x2b2b31));
    cone.position.y = 36;
    cone.castShadow = true;
    volcano.add(cone);
    const lavaTop = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 16, 6, 8),
      new THREE.MeshLambertMaterial({ color: 0xff7a33, emissive: 0xd64018, emissiveIntensity: 1 })
    );
    lavaTop.position.y = 74;
    volcano.add(lavaTop);
    volcano.position.set(18.2 * TILE, 0, 1.4 * TILE);
    registerDeco(18, 1, volcano);
    extras.push(volcano);
  } else if (mapKey === "space") {
    // Funkturm mit blinkender Spitze
    const antenna = new THREE.Group();
    antenna.add(box(14, 8, 14, lambert(0x2a3158), 0, 4, 0));
    antenna.add(box(4, 70, 4, lambert(0x39406e), 0, 43, 0));
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(5, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xff5b7f, emissive: 0xe11d48, emissiveIntensity: 1 })
    );
    tip.position.y = 82;
    antenna.add(tip);
    antenna.userData.blink = tip;
    antenna.position.set(0.5 * TILE, 0, 12.4 * TILE);
    registerDeco(0, 12, antenna);
    extras.push(antenna);

    // Sternenfeld
    const stars = new THREE.Group();
    const rndS = seededRandom(4242);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < 120; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 2.5), starMat);
      const a = rndS() * Math.PI * 2;
      const dist = 700 + rndS() * 1500;
      s.position.set(W / 2 + Math.cos(a) * dist, -300 + rndS() * 900, D / 2 + Math.sin(a) * dist);
      s.castShadow = false;
      stars.add(s);
    }
    extras.push(stars);
  }
  return extras;
}

function buildMap(mapKey) {
  const map = MAPS[mapKey];

  // Alte Karte abbauen
  while (mapGroup.children.length) {
    const c = mapGroup.children.pop();
    mapGroup.remove(c);
    disposeObject(c);
  }
  decoByTile = new Map();

  // Pfad setzen
  PATH = map.waypoints.map(([c, r]) => ({ x: (c + 0.5) * TILE, z: (r + 0.5) * TILE }));
  pathTiles = computePathTiles(map.waypoints);

  // Himmel, Nebel, Wasser/Lava
  scene.background.set(map.sky);
  scene.fog.color.set(map.sky);
  water.material.color.set(map.water);
  water.material.emissive = new THREE.Color(map.waterGlow || 0x000000);
  cloudGroup.visible = map.clouds;

  // Boden-Kacheln
  const tileGeo = new THREE.BoxGeometry(TILE, 12, TILE);
  const tileMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const ground = new THREE.InstancedMesh(tileGeo, tileMat, COLS * ROWS);
  ground.receiveShadow = true;
  const mat4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isPath = pathTiles.has(c + "," + r);
      const y = isPath ? -9 : -6;
      mat4.setPosition((c + 0.5) * TILE, y, (r + 0.5) * TILE);
      ground.setMatrixAt(i, mat4);
      col.set((c + r) % 2 === 0 ? (isPath ? map.path[0] : map.grass[0]) : (isPath ? map.path[1] : map.grass[1]));
      ground.setColorAt(i, col);
      i++;
    }
  }
  ground.instanceColor.needsUpdate = true;
  mapGroup.add(ground);

  // Erd-Sockel
  const base = box(W + 24, 40, D + 24, lambert(map.earth), W / 2, -32, D / 2);
  base.castShadow = false;
  mapGroup.add(base);

  // Zufalls-Deko nach Thema
  const rnd = seededRandom(1337);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = rnd();
      const off = rnd();
      if (pathTiles.has(c + "," + r)) continue;
      if (decoByTile.has(c + "," + r)) continue;
      const g = makeThemeDeco(map.deco, v, off);
      if (g) {
        g.position.set((c + 0.3 + off * 0.4) * TILE, 0, (r + 0.3 + off * 0.4) * TILE);
        mapGroup.add(g);
        decoByTile.set(c + "," + r, g);
      }
    }
  }

  // Feste Extras (Häuser, Ruinen, Vulkan, …)
  const registerDeco = (c, r, g) => { decoByTile.set(c + "," + r, g); };
  for (const e of buildMapExtras(mapKey, registerDeco)) mapGroup.add(e);

  // Burg (Basis) am Wegende
  {
    const castle = new THREE.Group();
    const stone = lambert(0xa8a29e);
    const stoneDark = lambert(0x78716c);
    castle.add(box(110, 14, 110, lambert(map.grass[0]), 0, -7, 0));
    castle.add(box(80, 55, 80, stone, 0, 27, 0));
    for (const [dx, dz] of [[-38, -38], [38, -38], [-38, 38], [38, 38]]) {
      castle.add(box(24, 85, 24, stoneDark, dx, 42, dz));
      castle.add(box(30, 10, 30, stone, dx, 90, dz));
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(34, 40, 4), lambert(0xdc2626));
    roof.position.y = 75; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    castle.add(roof);
    castle.add(box(26, 32, 6, lambert(0x5b3a1e), -40, 16, 0));
    const endRow = map.waypoints[map.waypoints.length - 1][1];
    castle.position.set(W + 62, 0, (endRow + 0.5) * TILE);
    mapGroup.add(castle);
  }

  // Start-Pfeil am Weganfang
  startArrow = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(14, 30, 4), new THREE.MeshLambertMaterial({ color: 0x22c55e, emissive: 0x14532d }));
  cone.rotation.z = -Math.PI / 2;
  cone.rotation.y = Math.PI / 4;
  startArrow.add(cone);
  startArrow.position.set(PATH[0].x - 20, 45, PATH[0].z);
  mapGroup.add(startArrow);
}

/* =====================================================================
   LOBBY – Plaza mit SPIELEN-Portal
   ===================================================================== */

const LOBBY = {
  origin: new THREE.Vector3(-2400, 0, 312),
  playPortal: null,    // { trigger: Vector3, glow }
  spawn: null,
  bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
  board: null,
};

const lobbyGroup = new THREE.Group();
lobbyGroup.visible = false;
scene.add(lobbyGroup);

// Text-Schild als Canvas-Textur
function makeTextPanel(lines, bgColor, w, h) {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 256;
  const g = cv.getContext("2d");
  g.fillStyle = bgColor;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 16;
  g.strokeRect(8, 8, 496, 240);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.shadowColor = "rgba(0,0,0,0.5)";
  g.shadowOffsetY = 5;
  const lineH = 256 / (lines.length + 1);
  lines.forEach((line, i) => {
    g.font = `bold ${i === 0 ? 84 : 56}px Arial`;
    g.fillText(line, 256, lineH * (i + 1) + (i === 0 ? 30 : 20));
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
  );
  mesh.userData.canvas = cv;
  mesh.userData.texture = tex;
  return mesh;
}

{
  const L = LOBBY.origin;

  // Stein-Plaza (Schachbrett)
  const tileGeo = new THREE.BoxGeometry(40, 8, 40);
  const tileMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const PCOLS = 14, PROWS = 10;
  const plaza = new THREE.InstancedMesh(tileGeo, tileMat, PCOLS * PROWS);
  plaza.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const pcol = new THREE.Color();
  let pi = 0;
  for (let r = 0; r < PROWS; r++) {
    for (let c = 0; c < PCOLS; c++) {
      m4.setPosition(L.x + (c - PCOLS / 2 + 0.5) * 40, -4, L.z + (r - PROWS / 2 + 0.5) * 40);
      plaza.setMatrixAt(pi, m4);
      pcol.set((c + r) % 2 === 0 ? 0xc9c4bd : 0xb5afa6);
      plaza.setColorAt(pi, pcol);
      pi++;
    }
  }
  plaza.instanceColor.needsUpdate = true;
  lobbyGroup.add(plaza);

  // Gras-Insel drumherum + Erdsockel
  const grass = box(660, 10, 500, lambert(0x69b54c), L.x, -10, L.z);
  grass.castShadow = false;
  grass.receiveShadow = true;
  lobbyGroup.add(grass);
  const earth = box(680, 36, 520, lambert(0x8a6437), L.x, -33, L.z);
  earth.castShadow = false;
  lobbyGroup.add(earth);

  LOBBY.bounds = { minX: L.x - 300, maxX: L.x + 300, minZ: L.z - 200, maxZ: L.z + 220 };
  LOBBY.spawn = new THREE.Vector3(L.x, 0, L.z + 130);

  // Deko-Bäume an den Ecken
  for (const [dx, dz] of [[-290, -210], [290, -210], [-290, 215], [290, 215], [-160, 225], [160, 225]]) {
    const t = new THREE.Group();
    t.add(box(8, 22, 8, lambert(0x7a5230), 0, 11, 0));
    t.add(box(30, 22, 30, lambert(0x3e8e41), 0, 32, 0));
    t.add(box(20, 15, 20, lambert(0x4caf50), 0, 50, 0));
    t.position.set(L.x + dx, 0, L.z + dz);
    lobbyGroup.add(t);
  }

  // Großes Lobby-Schild
  const title = makeTextPanel(["BLOX TOWER", "DEFENSE 3D"], "#232f4b", 170, 70);
  title.position.set(L.x, 130, L.z - 235);
  lobbyGroup.add(title);
  lobbyGroup.add(box(10, 110, 10, lambert(0x4b5563), L.x - 70, 55, L.z - 235));
  lobbyGroup.add(box(10, 110, 10, lambert(0x4b5563), L.x + 70, 55, L.z - 235));

  // Das goldene SPIELEN-Portal (öffnet die Modus-Auswahl)
  {
    const g = new THREE.Group();
    const px = L.x, pz = L.z - 150;
    const frameMat = lambert(0xb8941f);

    g.add(box(110, 8, 55, lambert(0x9ca3af), 0, 4, 0));
    g.add(box(16, 88, 16, frameMat, -40, 52, 0));
    g.add(box(16, 88, 16, frameMat, 40, 52, 0));
    g.add(box(108, 16, 18, frameMat, 0, 104, 0));

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(62, 80),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    glow.position.set(0, 54, 0);
    g.add(glow);

    const sign = makeTextPanel(["🎮 SPIELEN", "Modus wählen"], "#8a6d1f", 110, 48);
    sign.position.set(0, 140, 0);
    g.add(sign);

    g.position.set(px, 0, pz);
    lobbyGroup.add(g);
    LOBBY.playPortal = { trigger: new THREE.Vector3(px, 0, pz + 14), glow };
  }

  // Rekord-Tafel
  const board = makeTextPanel(["🏆 REKORD", "–"], "#7a5230", 120, 58);
  board.position.set(L.x + 250, 70, L.z + 40);
  board.rotation.y = -Math.PI / 2.4;
  lobbyGroup.add(board);
  lobbyGroup.add(box(8, 60, 8, lambert(0x5b3a1e), L.x + 250, 25, L.z + 40));
  LOBBY.board = board;
}

function bestRecordText() {
  const rec = loadRecords();
  let bestWave = 0, bestMap = null;
  for (const key of MAP_ORDER) {
    if (rec[key] && rec[key] > bestWave) { bestWave = rec[key]; bestMap = key; }
  }
  if (!bestMap) return null;
  if (bestWave > MAX_WAVE) return `Alle ${MAX_WAVE} Wellen (${MAPS[bestMap].name})`;
  return `Welle ${bestWave} (${MAPS[bestMap].name})`;
}

function refreshLobbyBoard() {
  const cv = LOBBY.board.userData.canvas;
  const g = cv.getContext("2d");
  g.fillStyle = "#7a5230";
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 16;
  g.strokeRect(8, 8, 496, 240);
  g.fillStyle = "#ffd24a";
  g.textAlign = "center";
  g.font = "bold 76px Arial";
  g.fillText("🏆 REKORD", 256, 100);
  g.fillStyle = "#ffffff";
  g.font = "bold 48px Arial";
  g.fillText(bestRecordText() || "Noch keiner!", 256, 190);
  LOBBY.board.userData.texture.needsUpdate = true;
}

// Spieler-Figur für die Lobby (mit Skin aus dem Shop)
const player = {
  group: null,
  x: 0, z: 0,
  yaw: Math.PI,
  walkPhase: 0,
  moving: false,
};
function rebuildPlayerFigure() {
  if (player.group) {
    lobbyGroup.remove(player.group);
    disposeObject(player.group);
  }
  const skin = getEquippedSkin();
  player.group = makeMinifig(skin.body, "#fbbf24", { hat: skin.hat });
  player.group.position.set(player.x, 0, player.z);
  lobbyGroup.add(player.group);
}
function ensurePlayerFigure() {
  if (!player.group) rebuildPlayerFigure();
}

/* ---------------- Roblox-Minifigur (3D) ---------------- */

const faceCache = new Map();
function faceTexture(headHex, angry) {
  const key = headHex + (angry ? "a" : "s");
  if (faceCache.has(key)) return faceCache.get(key);
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d");
  g.fillStyle = headHex;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#1f2937";
  g.beginPath(); g.arc(22, 26, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(42, 26, 5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#1f2937";
  g.lineWidth = 3.5;
  g.beginPath();
  if (angry) {
    g.arc(32, 52, 9, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
    g.beginPath(); g.moveTo(14, 16); g.lineTo(27, 21); g.stroke();
    g.beginPath(); g.moveTo(50, 16); g.lineTo(37, 21); g.stroke();
  } else {
    g.arc(32, 38, 10, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  faceCache.set(key, tex);
  return tex;
}

/* Baut eine Klötzchen-Figur. Schaut in +Z-Richtung, Ursprung am Boden. */
function makeMinifig(bodyHex, headHex, opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Color(bodyHex);
  const bodyDark = shadeColor(bodyHex, -0.12);

  function limb(wd, ht, dp, color) {
    const geo = new THREE.BoxGeometry(wd, ht, dp);
    geo.translate(0, -ht / 2, 0);
    const m = new THREE.Mesh(geo, lambert(color));
    m.castShadow = true;
    return m;
  }
  const legL = limb(7, 14, 7, bodyDark); legL.position.set(-4.5, 14, 0);
  const legR = limb(7, 14, 7, bodyDark); legR.position.set(4.5, 14, 0);

  const torso = box(16, 16, 9, lambert(body), 0, 22, 0);

  const armMat = lambert(shadeColor(bodyHex, -0.06));
  const armL = limb(5.5, 15, 6, armMat.color); armL.position.set(-11, 29, 0);
  const armR = limb(5.5, 15, 6, armMat.color); armR.position.set(11, 29, 0);

  const headMats = [];
  const plain = lambert(new THREE.Color(opts.headColor || headHex || "#fbbf24"));
  for (let i = 0; i < 6; i++) headMats.push(plain);
  headMats[4] = new THREE.MeshLambertMaterial({ map: faceTexture(opts.headColor || headHex || "#fbbf24", !!opts.angry) });
  const head = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), headMats);
  head.position.y = 36;
  head.castShadow = true;

  g.add(legL, legR, torso, armL, armR, head);

  if (opts.hat) {
    g.add(box(14, 3, 14, lambert(new THREE.Color(opts.hat)), 0, 43, 0));
    g.add(box(9, 5, 9, lambert(new THREE.Color(opts.hat)), 0, 46.5, 0));
  }
  if (opts.crown) {
    const gold = lambert(0xfacc15);
    g.add(box(13, 3, 13, gold, 0, 43.5, 0));
    for (const dx of [-4.5, 0, 4.5]) g.add(box(3, 5, 3, gold, dx, 47, 0));
  }

  g.userData = { legL, legR, armL, armR, head, torso };
  return g;
}

/* ---------------- Lebensbalken (Billboard aus 2 Flächen) ---------------- */

const billboards = [];
function makeHealthBar(width) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 2, 6),
    new THREE.MeshBasicMaterial({ color: 0x111111 })
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 4),
    new THREE.MeshBasicMaterial({ color: 0x4ade80 })
  );
  fill.position.z = 0.5;
  g.add(bg, fill);
  g.userData = { fill, width };
  billboards.push(g);
  return g;
}

function setHealthBar(bar, frac) {
  const { fill, width } = bar.userData;
  frac = Math.max(0, Math.min(1, frac));
  fill.scale.x = Math.max(frac, 0.001);
  fill.position.x = -width * (1 - frac) / 2;
  fill.material.color.set(frac > 0.5 ? 0x4ade80 : frac > 0.25 ? 0xfacc15 : 0xef4444);
}

/* ---------------- Partikel-Pool ---------------- */

const PARTICLE_POOL = 260;
const particlePool = [];
{
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < PARTICLE_POOL; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    m.visible = false;
    scene.add(m);
    particlePool.push(m);
  }
}

function spawnParticle(x, y, z, vx, vy, vz, life, size, colorHex, gravity) {
  const mesh = particlePool.find(p => !p.visible);
  if (!mesh) return;
  mesh.visible = true;
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(size);
  mesh.material.color.set(colorHex);
  mesh.material.opacity = 1;
  state.particles.push({ mesh, vx, vy, vz, life, maxLife: life, gravity: !!gravity });
}

function burst(x, y, z, colorHex, count, speed, gravity) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const up = (Math.random() - 0.2) * speed;
    spawnParticle(
      x, y, z,
      Math.cos(a) * speed * (0.4 + Math.random() * 0.6),
      up,
      Math.sin(a) * speed * (0.4 + Math.random() * 0.6),
      0.4 + Math.random() * 0.4,
      3 + Math.random() * 4,
      colorHex,
      gravity
    );
  }
}

/* ---------------- Tracer-Pool (Schusslinien) ---------------- */

const TRACER_POOL = 40;
const tracerPool = [];
{
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfde047, transparent: true }));
    line.visible = false;
    world.add(line);
    tracerPool.push(line);
  }
}

function spawnTracer(from, to, colorHex) {
  const line = tracerPool.find(l => !l.visible);
  if (!line) return;
  line.visible = true;
  line.material.color.set(colorHex);
  line.material.opacity = 0.9;
  const pos = line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  state.tracers.push({ line, life: 0.07, maxLife: 0.07 });
}

/* ---------------- Explosionsringe ---------------- */

function spawnRing(x, z, radius, colorHex) {
  const geo = new THREE.RingGeometry(0.85, 1, 40);
  const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 1.5, z);
  world.add(ring);
  state.rings.push({ mesh: ring, life: 0.3, maxLife: 0.3, radius });
}

/* ---------------- Tesla-Blitze (gezackte Linien) ---------------- */

function spawnLightning(points) {
  const jagged = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    for (let s = 0; s < 4; s++) {
      const t = s / 4;
      const jx = s === 0 ? 0 : (Math.random() - 0.5) * 14;
      const jy = s === 0 ? 0 : (Math.random() - 0.5) * 10;
      jagged.push(new THREE.Vector3(
        a.x + (b.x - a.x) * t + jx,
        a.y + (b.y - a.y) * t + jy,
        a.z + (b.z - a.z) * t + jx
      ));
    }
  }
  jagged.push(new THREE.Vector3(points[points.length - 1].x, points[points.length - 1].y, points[points.length - 1].z));
  const geo = new THREE.BufferGeometry().setFromPoints(jagged);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 1 }));
  world.add(line);
  state.bolts.push({ line, life: 0.13, maxLife: 0.13 });
}

/* ---------------- Marker: Platzierung & Auswahl ---------------- */

const tileMarker = new THREE.Mesh(
  new THREE.PlaneGeometry(TILE - 2, TILE - 2),
  new THREE.MeshBasicMaterial({ color: 0x7ee787, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
);
tileMarker.rotation.x = -Math.PI / 2;
tileMarker.position.y = 1;
tileMarker.visible = false;
world.add(tileMarker);

function makeRangeRing(colorHex) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false })
  );
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 48),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
  );
  disc.rotation.x = edge.rotation.x = -Math.PI / 2;
  g.add(disc, edge);
  g.position.y = 1.2;
  g.visible = false;
  g.userData = { disc, edge };
  world.add(g);
  return g;
}
const placeRing = makeRangeRing(0xffffff);
const selectRing = makeRangeRing(0xffd24a);

function setRingColor(ring, colorHex) {
  ring.userData.disc.material.color.set(colorHex);
  ring.userData.edge.material.color.set(colorHex);
}

const ghostCache = new Map();
function getGhost(typeKey) {
  if (ghostCache.has(typeKey)) return ghostCache.get(typeKey);
  const def = TOWER_TYPES[typeKey];
  let g;
  if (def.kind === "farm") {
    g = new THREE.Group();
    g.add(box(36, 6, 30, lambert(0x854d0e), 0, 3, 0));
  } else {
    g = makeMinifig(def.color, "#fbbf24", {});
  }
  g.traverse((o) => {
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.length === 1 ? mats[0].clone() : mats.map(m => m.clone());
      const newMats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of newMats) { m.transparent = true; m.opacity = 0.55; }
    }
    o.castShadow = false;
  });
  g.visible = false;
  world.add(g);
  ghostCache.set(typeKey, g);
  return g;
}

/* =====================================================================
   TURM-MODELLE
   ===================================================================== */

function makeTowerMesh(typeKey, level) {
  const def = TOWER_TYPES[typeKey];
  const group = new THREE.Group();
  const staticG = new THREE.Group();
  const rotG = new THREE.Group();
  group.add(staticG, rotG);

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(19, 21, 6, 20), lambert(0x9ca3af));
  plate.position.y = 3;
  plate.receiveShadow = true;
  staticG.add(plate);

  const studs = new THREE.Group();
  staticG.add(studs);
  group.userData.studs = studs;

  let muzzle = null, flash = null, figure = null, cropTips = [];

  if (def.kind === "farm") {
    const soil = box(38, 8, 32, lambert(0x854d0e), 0, 8, 0);
    rotG.add(soil);
    for (let i = 0; i < 4; i++) {
      const stem = box(2.5, 12, 2.5, lambert(0x84cc16), -13 + i * 8.6, 18, (i % 2 === 0 ? -5 : 5));
      const tip = box(6, 6, 6, lambert(0xfde047), 0, 8, 0);
      stem.add(tip);
      rotG.add(stem);
      cropTips.push(stem);
    }
  } else {
    const hat = level >= 2 ? "#" + shadeColor(def.color, -0.25).getHexString() : null;
    figure = makeMinifig(def.color, "#fbbf24", { hat });
    figure.position.y = 6;
    rotG.add(figure);

    const gun = new THREE.Group();
    const gunMat = lambert(0x374151);
    if (typeKey === "sniper") {
      gun.add(box(3.5, 3.5, 30, gunMat, 0, 0, 13));
      gun.add(box(5, 5, 8, lambert(0x1f2937), 0, 1, 2));
    } else if (typeKey === "minigun") {
      const barrels = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 18, 8), lambert(0x4b5563));
      barrels.rotation.x = Math.PI / 2;
      barrels.position.z = 10;
      barrels.castShadow = true;
      gun.add(barrels);
      gun.add(box(7, 7, 8, gunMat, 0, 0, 1));
      group.userData.spinBarrels = barrels;
    } else if (typeKey === "rocket") {
      gun.add(box(8, 8, 24, lambert(0x7f1d1d), 0, 2, 8));
      gun.add(box(9.5, 9.5, 4, lambert(0x450a0a), 0, 2, 20));
    } else if (typeKey === "frost") {
      gun.add(box(2.5, 2.5, 22, lambert(0x7dd3fc), 0, 0, 9));
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(5, 0), new THREE.MeshLambertMaterial({ color: 0xaee9ff, emissive: 0x38bdf8, emissiveIntensity: 0.45 }));
      orb.position.z = 21;
      gun.add(orb);
      group.userData.frostOrb = orb;
    } else if (typeKey === "flame") {
      gun.add(box(6, 6, 14, lambert(0xb91c1c), 0, 0, 6));
      gun.add(box(8.5, 8.5, 4, lambert(0x7f1d1d), 0, 0, 13));
      const pilot = new THREE.Mesh(new THREE.SphereGeometry(2.5, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfb923c }));
      pilot.position.z = 16;
      gun.add(pilot);
      group.userData.pilotFlame = pilot;
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 14, 10), lambert(0xdc2626));
      tank.position.set(-6, 26, -8);
      tank.castShadow = true;
      rotG.add(tank);
    } else if (typeKey === "tesla") {
      gun.add(box(2.5, 2.5, 20, lambert(0x6d28d9), 0, 0, 8));
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(5.5, 0), new THREE.MeshLambertMaterial({ color: 0xddd6fe, emissive: 0x8b5cf6, emissiveIntensity: 0.7 }));
      orb.position.z = 20;
      gun.add(orb);
      group.userData.teslaOrb = orb;
      const rod = box(1.5, 12, 1.5, lambert(0x4c1d95), 0, 50, 0);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(2.5, 6, 6), new THREE.MeshBasicMaterial({ color: 0xc4b5fd }));
      tip.position.set(0, 57, 0);
      rotG.add(rod, tip);
    } else {
      gun.add(box(3.5, 3.5, 18, gunMat, 0, 0, 8));
    }
    gun.position.set(6, 28, 6);
    rotG.add(gun);

    muzzle = new THREE.Object3D();
    muzzle.position.set(6, 28, 28);
    rotG.add(muzzle);
    flash = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfde047 })
    );
    flash.visible = false;
    muzzle.add(flash);
  }

  group.userData.rotG = rotG;
  group.userData.muzzle = muzzle;
  group.userData.flash = flash;
  group.userData.figure = figure;
  group.userData.crops = cropTips;
  return group;
}

function refreshTowerStuds(tower) {
  const studs = tower.group.userData.studs;
  while (studs.children.length) {
    const c = studs.children.pop();
    disposeObject(c);
    studs.remove(c);
  }
  const gold = lambert(0xfacc15);
  for (let i = 0; i < tower.level; i++) {
    const stud = box(4, 4, 4, gold, (i - (tower.level - 1) / 2) * 6.5, 8, 19);
    studs.add(stud);
  }
}

/* =====================================================================
   GEGNER
   ===================================================================== */

function spawnEnemy(typeKey) {
  const def = ENEMY_TYPES[typeKey];
  const hp = Math.round(def.hp * hpScale(state.wave));

  const fig = makeMinifig(def.color, def.headColor, { angry: typeKey !== "healer", crown: typeKey === "boss" });
  fig.scale.setScalar(def.scale);

  if (def.heals) {
    const red = lambert(0xdc2626);
    fig.add(box(3, 9, 1.5, red, 0, 22, 5));
    fig.add(box(9, 3, 1.5, red, 0, 22, 5));
  }

  const bar = makeHealthBar(30 * def.scale);
  bar.position.y = 52 * def.scale;
  bar.visible = false;
  setHealthBar(bar, 1);

  const g = new THREE.Group();
  g.add(fig, bar);
  g.position.set(PATH[0].x, 0, PATH[0].z);
  world.add(g);

  state.enemies.push({
    type: typeKey,
    def,
    hp, maxHp: hp,
    x: PATH[0].x, z: PATH[0].z,
    seg: 0,
    dist: 0,
    slowUntil: 0, slowFactor: 1,
    burnUntil: 0, burnDps: 0,
    flash: 0, flashTinted: false,
    dmgAccum: 0, dmgTimer: 0,
    healTimer: 1,
    walkPhase: Math.random() * Math.PI * 2,
    yaw: Math.PI / 2,
    dead: false,
    killed: false,
    group: g,
    figure: fig,
    bar,
    tinted: false,
  });
}

function removeEnemyMesh(e) {
  const idx = billboards.indexOf(e.bar);
  if (idx >= 0) billboards.splice(idx, 1);
  world.remove(e.group);
  disposeObject(e.group);
}

function moveEnemy(e, dt) {
  let speed = e.def.speed;
  if (state.time < e.slowUntil) speed *= e.slowFactor;
  let remaining = speed * dt;
  while (remaining > 0 && e.seg < PATH.length - 1) {
    const target = PATH[e.seg + 1];
    const dx = target.x - e.x, dz = target.z - e.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001) e.yaw = approachAngle(e.yaw, Math.atan2(dx, dz), dt * 10);
    if (d <= remaining) {
      e.x = target.x; e.z = target.z;
      e.dist += d;
      remaining -= d;
      e.seg++;
    } else {
      e.x += (dx / d) * remaining;
      e.z += (dz / d) * remaining;
      e.dist += remaining;
      remaining = 0;
    }
  }
  if (e.seg >= PATH.length - 1) {
    e.dead = true;
    state.lives -= e.def.dmg;
    state.shake = Math.min(0.35, 0.12 + e.def.dmg * 0.01);
    sfx("leak");
    addText(PATH[PATH.length - 1].x - 40, 40, PATH[PATH.length - 1].z, `-${e.def.dmg} ❤️`, "#ff6b6b");
    if (state.lives <= 0) gameOver();
  }
}

function killEnemy(e) {
  e.dead = true;
  e.killed = true;
  state.cash += e.def.reward;
  state.kills++;
  addText(e.x, 45 * e.def.scale, e.z, `+${e.def.reward}💰`, "#7ee787");
  sfx("die");
  burst(e.x, 22 * e.def.scale, e.z, e.def.color, 12, 90, true);

  const idx = billboards.indexOf(e.bar);
  if (idx >= 0) billboards.splice(idx, 1);
  e.bar.visible = false;
  e.group.traverse((o) => {
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.transparent = true;
    }
  });
  state.dying.push({ group: e.group, figure: e.figure, t: 0 });
  updateHUD();
}

function damageEnemy(e, dmg) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = 0.08;
  e.dmgAccum += dmg;
  if (e.hp <= 0) killEnemy(e);
  else {
    e.bar.visible = true;
    setHealthBar(e.bar, e.hp / e.maxHp);
  }
}

function flushDamageText(e) {
  if (!state.settings.dmgNumbers) { e.dmgAccum = 0; return; }
  const n = Math.round(e.dmgAccum);
  if (n < 1) return;
  e.dmgAccum = 0;
  _projV.set(e.x, 50 * e.def.scale, e.z).project(camera);
  if (_projV.z > 1) return;
  const el = document.createElement("div");
  el.className = "fx-text fx-dmg";
  el.textContent = "-" + n;
  el.style.left = ((_projV.x * 0.5 + 0.5) * container.clientWidth + (Math.random() - 0.5) * 18) + "px";
  el.style.top = ((-_projV.y * 0.5 + 0.5) * container.clientHeight) + "px";
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 850);
}

/* ---------------- Schwebende Texte (HTML über der 3D-Szene) ---------------- */

const _projV = new THREE.Vector3();
function addText(wx, wy, wz, text, color) {
  _projV.set(wx, wy, wz).project(camera);
  if (_projV.z > 1) return;
  const x = (_projV.x * 0.5 + 0.5) * container.clientWidth;
  const y = (-_projV.y * 0.5 + 0.5) * container.clientHeight;
  const el = document.createElement("div");
  el.className = "fx-text";
  el.textContent = text;
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.style.color = color;
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 1250);
}

function centerText(text, color) {
  addTextScreen(container.clientWidth / 2, container.clientHeight / 2, text, color);
}
function addTextScreen(x, y, text, color) {
  const el = document.createElement("div");
  el.className = "fx-text";
  el.textContent = text;
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.style.color = color;
  el.style.fontSize = "19px";
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 1250);
}

/* =====================================================================
   TÜRME – LOGIK
   ===================================================================== */

function towerStats(tower) {
  return TOWER_TYPES[tower.type].levels[tower.level];
}

function placeTower(typeKey, c, r) {
  const def = TOWER_TYPES[typeKey];
  if (state.cash < def.cost) return false;
  state.cash -= def.cost;

  const x = (c + 0.5) * TILE, z = (r + 0.5) * TILE;
  const group = makeTowerMesh(typeKey, 0);
  group.position.set(x, 0, z);
  world.add(group);

  const tower = {
    type: typeKey,
    c, r, x, z,
    level: 0,
    cooldown: 0,
    yaw: 0,
    targetMode: 0,
    invested: def.cost,
    flash: 0,
    group,
  };
  state.towers.push(tower);

  const deco = decoByTile.get(c + "," + r);
  if (deco) deco.visible = false;

  sfx("place");
  burst(x, 10, z, "#ffd24a", 10, 70, false);
  updateHUD();
  return true;
}

function removeTower(tower) {
  state.towers = state.towers.filter(t => t !== tower);
  world.remove(tower.group);
  disposeObject(tower.group);
  const deco = decoByTile.get(tower.c + "," + tower.r);
  if (deco) deco.visible = true;
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
    const d = Math.hypot(e.x - tower.x, e.z - tower.z);
    if (d > st.range) continue;
    let val;
    if (tower.targetMode === 0) val = e.dist;
    else if (tower.targetMode === 1) val = -e.dist;
    else val = e.hp;
    if (val > bestVal) { bestVal = val; best = e; }
  }
  return best;
}

const _muzzlePos = new THREE.Vector3();
function updateTower(tower, dt) {
  const def = TOWER_TYPES[tower.type];
  if (def.kind === "farm") return;

  tower.cooldown -= dt;
  if (tower.flash > 0) tower.flash -= dt;

  const target = pickTarget(tower);
  if (!target) {
    tower.yaw += dt * 0.4;
    return;
  }

  const desired = Math.atan2(target.x - tower.x, target.z - tower.z);
  tower.yaw = approachAngle(tower.yaw, desired, dt * 12);

  if (tower.cooldown > 0) return;
  const st = towerStats(tower);
  tower.cooldown = 1 / st.rate;
  tower.flash = 0.06;

  tower.group.userData.rotG.rotation.y = tower.yaw;
  tower.group.updateMatrixWorld(true);
  tower.group.userData.muzzle.getWorldPosition(_muzzlePos);
  const targetPos = { x: target.x, y: 24 * target.def.scale, z: target.z };

  if (def.kind === "hitscan") {
    damageEnemy(target, st.dmg);
    if (st.slow) {
      target.slowUntil = state.time + st.slowDur;
      target.slowFactor = 1 - st.slow;
      spawnTracer(_muzzlePos, targetPos, 0x7dd3fc);
      sfx("frost");
      burst(target.x, 24, target.z, "#aee9ff", 5, 50, false);
    } else {
      spawnTracer(_muzzlePos, targetPos, 0xfde047);
      sfx(tower.type === "sniper" ? "sniper" : tower.type === "minigun" ? "minigun" : "shoot");
    }
  } else if (def.kind === "flame") {
    const inRange = state.enemies
      .filter(e => !e.dead && Math.hypot(e.x - tower.x, e.z - tower.z) <= st.range)
      .sort((a, b) => Math.hypot(a.x - tower.x, a.z - tower.z) - Math.hypot(b.x - tower.x, b.z - tower.z))
      .slice(0, st.targets);
    for (const e of inRange) {
      damageEnemy(e, st.dmg);
      if (!e.dead) {
        e.burnUntil = state.time + st.burnDur;
        e.burnDps = st.burn;
      }
      const dx = e.x - _muzzlePos.x, dz = e.z - _muzzlePos.z;
      const dist = Math.hypot(dx, dz) || 1;
      for (let i = 0; i < 3; i++) {
        const sp = 120 + Math.random() * 80;
        spawnParticle(
          _muzzlePos.x, _muzzlePos.y, _muzzlePos.z,
          (dx / dist) * sp + (Math.random() - 0.5) * 30,
          (Math.random() - 0.3) * 25,
          (dz / dist) * sp + (Math.random() - 0.5) * 30,
          0.3 + Math.random() * 0.2,
          3.5 + Math.random() * 3,
          Math.random() < 0.5 ? "#fb923c" : "#fde047",
          false
        );
      }
    }
    sfx("flame");
  } else if (def.kind === "tesla") {
    const chain = [target];
    const hitSet = new Set([target]);
    while (chain.length < st.chains) {
      const last = chain[chain.length - 1];
      let next = null, bestD = 110;
      for (const e of state.enemies) {
        if (e.dead || hitSet.has(e)) continue;
        const d = Math.hypot(e.x - last.x, e.z - last.z);
        if (d < bestD) { bestD = d; next = e; }
      }
      if (!next) break;
      chain.push(next);
      hitSet.add(next);
    }
    const points = [{ x: _muzzlePos.x, y: _muzzlePos.y, z: _muzzlePos.z }];
    for (const e of chain) {
      points.push({ x: e.x, y: 24 * e.def.scale, z: e.z });
      burst(e.x, 24, e.z, "#c4b5fd", 4, 60, false);
      damageEnemy(e, st.dmg);
    }
    spawnLightning(points);
    sfx("zap");
  } else if (def.kind === "rocket") {
    const mesh = new THREE.Group();
    mesh.add(box(5, 5, 12, lambert(0xdc2626), 0, 0, 0));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 8), lambert(0xfca5a5));
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 9;
    mesh.add(nose);
    mesh.position.copy(_muzzlePos);
    world.add(mesh);
    state.projectiles.push({
      x: _muzzlePos.x, y: _muzzlePos.y, z: _muzzlePos.z,
      target,
      speed: 320,
      dmg: st.dmg,
      splash: st.splash,
      mesh,
    });
    sfx("shoot");
  }
}

function updateProjectile(p, dt) {
  if (!p.target.dead) { p.tx = p.target.x; p.tz = p.target.z; }
  if (p.tx === undefined) { p.tx = p.target.x; p.tz = p.target.z; }
  const ty = 18;

  const dx = p.tx - p.x, dy = ty - p.y, dz = p.tz - p.z;
  const d = Math.hypot(dx, dy, dz);

  if (Math.random() < 0.7) {
    spawnParticle(p.x, p.y, p.z, (Math.random() - 0.5) * 15, 8, (Math.random() - 0.5) * 15, 0.35, 3, "#9ca3af", false);
  }

  const step = p.speed * dt;
  if (d <= step + 8) {
    explode(p.tx, p.tz, p.dmg, p.splash);
    world.remove(p.mesh);
    disposeObject(p.mesh);
    return true;
  }
  p.x += (dx / d) * step;
  p.y += (dy / d) * step;
  p.z += (dz / d) * step;
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.lookAt(p.tx, ty, p.tz);
  return false;
}

function explode(x, z, dmg, radius) {
  sfx("boom");
  state.shake = Math.max(state.shake, 0.15);
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - x, e.z - z) <= radius + 10) damageEnemy(e, dmg);
  }
  burst(x, 14, z, "#fb923c", 10, 130, false);
  burst(x, 14, z, "#fde047", 8, 100, false);
  spawnRing(x, z, radius, 0xfb923c);
}

/* =====================================================================
   WELLEN
   ===================================================================== */

function buildWave(n) {
  const list = [];
  const add = (type, count, interval) => list.push({ type, count, interval });

  if (n % 10 === 0) {
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
  if (n >= 14) add("healer", Math.floor((n - 8) / 6), 2.5);
  if (n >= 22) add("demon", Math.floor((n - 18) / 3), 2.0);
  if (n >= 15) add("fast", Math.floor(n / 2), 0.3);
  return list;
}

function hpScale(wave) {
  return (1 + (wave - 1) * 0.09) * MAPS[state.map].hpMult;
}

function waveCompositionText(n) {
  const counts = {};
  for (const grp of buildWave(n)) {
    counts[grp.type] = (counts[grp.type] || 0) + grp.count;
  }
  return Object.entries(counts)
    .map(([type, count]) => `${count}× ${ENEMY_TYPES[type].name}`)
    .join(", ");
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
    tcursor += 1.2;
  }

  showBanner(state.wave % 10 === 0 ? `⚠️ BOSS-WELLE ${state.wave} ⚠️` : `WELLE ${state.wave}`);
  sfx("wave");
  updateHUD();
}

function showBanner(text, sticky) {
  const el = document.getElementById("wave-banner");
  el.textContent = text;
  el.classList.remove("hidden");
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  clearTimeout(showBanner._t);
  if (!sticky) showBanner._t = setTimeout(() => el.classList.add("hidden"), 2300);
}

function hideBanner() {
  clearTimeout(showBanner._t);
  document.getElementById("wave-banner").classList.add("hidden");
}

function finishWave() {
  const bonus = 60 + state.wave * 12;
  state.cash += bonus;
  centerText(`Welle ${state.wave} geschafft! +${bonus}💰`, "#ffd24a");
  sfx("cash");
  addCoins(3); // Münzen für den Skin-Shop

  for (const t of state.towers) {
    if (t.type === "farm") {
      const inc = towerStats(t).income;
      state.cash += inc;
      addText(t.x, 40, t.z, `+${inc}💰`, "#bef264");
    }
  }

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
  const coins = state.wave * 2;
  addCoins(coins);
  const isNew = saveRecord(state.map, state.wave);
  document.getElementById("go-wave").textContent = state.wave;
  document.getElementById("go-highscore").textContent =
    (isNew ? `🏆 NEUER REKORD auf ${MAPS[state.map].name}! ` : `💀 ${state.kills} Gegner besiegt. `) + `🪙 +${coins} Münzen`;
  document.getElementById("gameover-overlay").classList.remove("hidden");
}

function win() {
  state.running = false;
  sfx("win");
  const coins = 150 + state.wave * 2;
  addCoins(coins);
  saveRecord(state.map, MAX_WAVE + 1);
  document.getElementById("win-info").textContent =
    `${MAPS[state.map].name} gemeistert! 💀 ${state.kills} Kills · 🪙 +${coins} Münzen`;
  document.getElementById("win-overlay").classList.remove("hidden");
}

function clearEntities() {
  for (const e of state.enemies) { if (!e.killed) removeEnemyMesh(e); }
  for (const d of state.dying) { world.remove(d.group); disposeObject(d.group); }
  for (const t of state.towers) {
    world.remove(t.group);
    disposeObject(t.group);
    const deco = decoByTile.get(t.c + "," + t.r);
    if (deco) deco.visible = true;
  }
  for (const p of state.projectiles) { world.remove(p.mesh); disposeObject(p.mesh); }
  for (const p of state.particles) p.mesh.visible = false;
  for (const t of state.tracers) t.line.visible = false;
  for (const r of state.rings) { world.remove(r.mesh); disposeObject(r.mesh); }
  for (const b of state.bolts) { world.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); }
  state.enemies = [];
  state.dying = [];
  state.towers = [];
  state.projectiles = [];
  state.particles = [];
  state.tracers = [];
  state.rings = [];
  state.bolts = [];
  fxLayer.innerHTML = "";
}

function resetGame() {
  clearEntities();
  state.cash = START_CASH;
  state.lives = START_LIVES;
  state.wave = 1;
  state.kills = 0;
  state.paused = false;
  document.getElementById("btn-pause").textContent = "⏸";
  state.phase = "idle";
  state.spawnQueue = [];
  state.placing = null;
  state.selected = null;
  state.running = true;
  state.autoTimer = 0;
  document.getElementById("gameover-overlay").classList.add("hidden");
  document.getElementById("win-overlay").classList.add("hidden");
  document.getElementById("menu-overlay").classList.add("hidden");
  hideTowerPanel();
  refreshShopSelection();
  updateHUD();
  refreshShop();
}

/* =====================================================================
   HAUPT-UPDATE (Spiellogik)
   ===================================================================== */

// Effekte (laufen im Spiel UND in der Lobby)
function updateEffects(dt) {
  for (const p of state.particles) {
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    if (p.gravity) p.vy -= 300 * dt;
    if (p.mesh.position.y < 1) { p.mesh.position.y = 1; p.vy = 0; p.vx *= 0.9; p.vz *= 0.9; }
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
  }
  state.particles = state.particles.filter(p => p.life > 0);

  for (const t of state.tracers) {
    t.life -= dt;
    if (t.life <= 0) t.line.visible = false;
    else t.line.material.opacity = 0.9 * (t.life / t.maxLife);
  }
  state.tracers = state.tracers.filter(t => t.life > 0);

  for (const r of state.rings) {
    r.life -= dt;
    if (r.life <= 0) { world.remove(r.mesh); disposeObject(r.mesh); continue; }
    const a = 1 - r.life / r.maxLife;
    r.mesh.scale.setScalar(r.radius * (0.3 + a * 0.9));
    r.mesh.material.opacity = 1 - a;
  }
  state.rings = state.rings.filter(r => r.life > 0);

  for (const b of state.bolts) {
    b.life -= dt;
    if (b.life <= 0) {
      world.remove(b.line);
      b.line.geometry.dispose();
      b.line.material.dispose();
    } else {
      b.line.material.opacity = b.life / b.maxLife;
    }
  }
  state.bolts = state.bolts.filter(b => b.life > 0);
}

function update(dt) {
  if (!state.running || state.paused) return;
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
    if (e.dead) continue;
    moveEnemy(e, dt);
    e.walkPhase += dt * 9 * (state.time < e.slowUntil ? e.slowFactor : 1);
    if (e.flash > 0) e.flash -= dt;

    // Brand-Schaden (Flammenwerfer)
    if (!e.dead && state.time < e.burnUntil) {
      damageEnemy(e, e.burnDps * dt);
    }

    // Heiler: heilt regelmäßig Gegner in der Nähe
    if (!e.dead && e.def.heals) {
      e.healTimer -= dt;
      if (e.healTimer <= 0) {
        e.healTimer = e.def.heals.interval;
        let healed = false;
        for (const o of state.enemies) {
          if (o.dead || o === e || o.hp >= o.maxHp) continue;
          if (Math.hypot(o.x - e.x, o.z - e.z) > e.def.heals.radius) continue;
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * e.def.heals.frac);
          setHealthBar(o.bar, o.hp / o.maxHp);
          spawnParticle(o.x, 38 * o.def.scale, o.z, 0, 24, 0, 0.5, 4, "#4ade80", false);
          healed = true;
        }
        if (healed) {
          sfx("heal");
          burst(e.x, 30 * e.def.scale, e.z, "#86efac", 5, 40, false);
        }
      }
    }

    // Gesammelte Schadenszahlen anzeigen
    e.dmgTimer -= dt;
    if (e.dmgTimer <= 0 && e.dmgAccum >= 1) {
      e.dmgTimer = 0.35;
      flushDamageText(e);
    }
  }
  for (const e of state.enemies) { if (e.dead && !e.killed) removeEnemyMesh(e); }
  state.enemies = state.enemies.filter(e => !e.dead);

  // Sterbe-Animation
  for (const d of state.dying) {
    d.t += dt;
    d.figure.rotation.x = -Math.min(1, d.t / 0.3) * 1.5;
    if (d.t > 0.3) {
      const fade = Math.max(0, 1 - (d.t - 0.3) / 0.4);
      d.group.traverse((o) => {
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.opacity = fade;
        }
      });
    }
    if (d.t >= 0.7) {
      world.remove(d.group);
      disposeObject(d.group);
      d.done = true;
    }
  }
  state.dying = state.dying.filter(d => !d.done);

  // Türme
  for (const t of state.towers) updateTower(t, dt);

  // Projektile
  state.projectiles = state.projectiles.filter(p => !updateProjectile(p, dt));

  // Partikel, Tracer, Ringe, Blitze
  updateEffects(dt);

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
   RENDER-SYNC (Optik pro Frame)
   ===================================================================== */

const _camQuat = new THREE.Quaternion();
function syncVisuals(dtReal) {
  // Gegner-Meshes
  for (const e of state.enemies) {
    e.group.position.set(e.x, 0, e.z);
    e.figure.rotation.y = e.yaw;
    const f = e.figure.userData;
    const swing = Math.sin(e.walkPhase) * 0.7;
    f.legL.rotation.x = swing;
    f.legR.rotation.x = -swing;
    f.armL.rotation.x = -swing * 0.8;
    f.armR.rotation.x = swing * 0.8;

    const slowed = state.time < e.slowUntil;
    if (slowed !== e.tinted) {
      e.tinted = slowed;
      const col = slowed ? new THREE.Color(0x60a5fa) : new THREE.Color(e.def.color);
      f.torso.material.color.copy(col);
      f.legL.material.color.copy(shadeColor("#" + col.getHexString(), -0.12));
      f.legR.material.color.copy(f.legL.material.color);
    }

    const flashing = e.flash > 0;
    if (flashing !== e.flashTinted) {
      e.flashTinted = flashing;
      f.torso.material.emissive.setHex(flashing ? 0x999999 : 0x000000);
    }

    if (state.time < e.burnUntil && Math.random() < dtReal * 10) {
      spawnParticle(
        e.x + (Math.random() - 0.5) * 12, 20 + Math.random() * 20, e.z + (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 15, 35 + Math.random() * 20, (Math.random() - 0.5) * 15,
        0.4, 3.5, Math.random() < 0.5 ? "#fb923c" : "#fde047", false
      );
    }
  }

  // Türme
  for (const t of state.towers) {
    const u = t.group.userData;
    u.rotG.rotation.y = t.yaw;
    if (u.flash) u.flash.visible = t.flash > 0;
    if (u.spinBarrels) u.spinBarrels.rotation.y += dtReal * (t.flash > 0 ? 25 : 3);
    if (u.frostOrb) u.frostOrb.scale.setScalar(1 + Math.sin(state.time * 6) * 0.18);
    if (u.teslaOrb) u.teslaOrb.scale.setScalar(1 + Math.sin(state.time * 9) * 0.25);
    if (u.pilotFlame) u.pilotFlame.scale.setScalar(0.8 + Math.random() * 0.5);
    if (u.crops && u.crops.length) {
      for (let i = 0; i < u.crops.length; i++) u.crops[i].rotation.z = Math.sin(state.time * 2 + i) * 0.12;
    }
  }

  // Lebensbalken zur Kamera drehen
  camera.getWorldQuaternion(_camQuat);
  for (const b of billboards) b.quaternion.copy(_camQuat);

  // Start-Pfeil hüpfen lassen
  syncVisuals._t = (syncVisuals._t || 0) + dtReal;
  if (startArrow) {
    startArrow.position.y = 45 + Math.sin(syncVisuals._t * 3) * 6;
    startArrow.rotation.y = syncVisuals._t * 0.8;
  }

  // Wasser leicht schaukeln lassen
  water.position.y = -44 + Math.sin(syncVisuals._t * 0.8) * 1.5;

  // Wolken treiben lassen
  if (cloudGroup.visible) {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dtReal;
      if (c.position.x > W + 300) c.position.x = -300;
    }
  }

  // Kamera-Wackeln über die Welt-Gruppe
  if (state.shake > 0) {
    world.position.x = (Math.random() - 0.5) * state.shake * 14;
    world.position.z = (Math.random() - 0.5) * state.shake * 14;
  } else {
    world.position.x = 0;
    world.position.z = 0;
  }

  syncMarkers();
}

/* ---------------- Platzierungs-Vorschau & Auswahl-Markierung ---------------- */

function syncMarkers() {
  for (const g of ghostCache.values()) g.visible = false;

  if (state.placing && state.hoverTile) {
    const { c, r } = state.hoverTile;
    const ok = canPlaceAt(c, r);
    const def = TOWER_TYPES[state.placing];
    const x = (c + 0.5) * TILE, z = (r + 0.5) * TILE;

    tileMarker.visible = true;
    tileMarker.position.set(x, 1, z);
    tileMarker.material.color.set(ok ? 0x7ee787 : 0xff5050);

    const ghost = getGhost(state.placing);
    ghost.visible = true;
    ghost.position.set(x, 2, z);

    if (def.kind !== "farm") {
      placeRing.visible = true;
      placeRing.position.set(x, 1.2, z);
      const range = def.levels[0].range;
      placeRing.scale.set(range, 1, range);
      setRingColor(placeRing, ok ? 0xffffff : 0xff5050);
    } else {
      placeRing.visible = false;
    }
  } else {
    tileMarker.visible = false;
    placeRing.visible = false;
  }

  const sel = state.selected;
  if (sel && TOWER_TYPES[sel.type].kind !== "farm") {
    selectRing.visible = true;
    selectRing.position.set(sel.x, 1.2, sel.z);
    const range = towerStats(sel).range;
    selectRing.scale.set(range, 1, range);
  } else {
    selectRing.visible = false;
  }
}

/* =====================================================================
   UI / DOM – HUD & Turm-Shop
   ===================================================================== */

function updateHUD() {
  document.getElementById("cash").textContent = Math.floor(state.cash);
  document.getElementById("lives").textContent = Math.max(0, state.lives);
  document.getElementById("wave").textContent = state.wave;
  document.getElementById("maxwave").textContent = MAX_WAVE;
  document.getElementById("kills").textContent = state.kills;

  const btn = document.getElementById("btn-start");
  btn.disabled = state.phase !== "idle" || !state.running;
  btn.textContent = state.phase === "wave" ? "🌊 Welle läuft…" : "▶ Welle starten";

  let previewText;
  if (state.mode === "lobby") {
    previewText = "🏃 <b>WASD</b> oder <b>Pfeiltasten</b> = laufen – geh durchs goldene Portal, um zu spielen!";
  } else if (state.mode === "menu") {
    previewText = "🎮 Drücke SPIELEN und wähle eine Karte!";
  } else if (!state.running) {
    previewText = "";
  } else if (state.paused) {
    previewText = "<b>⏸ PAUSE</b> – Weiter mit ⏸ oder Taste P";
  } else if (state.phase === "idle") {
    previewText = `<b>${MAPS[state.map].name} – Nächste Welle ${state.wave}:</b> ${waveCompositionText(state.wave)}`;
  } else {
    const left = state.spawnQueue.length + state.enemies.length;
    previewText = `<b>Welle ${state.wave}:</b> noch ${left} Gegner`;
  }
  if (previewText !== updateHUD._lastPreview) {
    updateHUD._lastPreview = previewText;
    document.getElementById("wave-preview").innerHTML = previewText;
  }

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
          centerText(`${def.name} ab Welle ${def.unlockWave}!`, "#f87171");
          return;
        }
        if (state.cash < def.cost) {
          centerText("Nicht genug Geld!", "#f87171");
          return;
        }
        selectTower(null);
        state.placing = state.placing === key ? null : key;
        refreshShopSelection();
      });
      shop.appendChild(card);
    }
  }
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
    const card = document.getElementById("card-" + key);
    if (card) card.classList.toggle("selected", state.placing === key);
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
    if (st.burn) stats += `<br>🔥 Brand: <b>${st.burn}/s</b> für ${st.burnDur}s<br>👥 Trifft <b>${st.targets}</b> Gegner`;
    if (st.chains) stats += `<br>⚡ Kettenblitz: <b>${st.chains}</b> Ziele`;
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

/* =====================================================================
   MENÜSYSTEM – Fenster, Kartenauswahl, Shop, Einstellungen, Rekorde
   ===================================================================== */

const modalStack = [];

function openWindow(id) {
  document.getElementById(id).classList.remove("hidden");
  if (!modalStack.includes(id)) modalStack.push(id);
  sfx("click");
}

function closeWindow(id) {
  document.getElementById(id).classList.add("hidden");
  const idx = modalStack.indexOf(id);
  if (idx >= 0) modalStack.splice(idx, 1);
}

function closeAllWindows() {
  while (modalStack.length) closeWindow(modalStack[modalStack.length - 1]);
}

// Mini-Vorschaubild einer Karte (zeichnet Boden + Weg auf ein Canvas)
function drawMapPreview(canvas, mapKey) {
  const map = MAPS[mapKey];
  const g = canvas.getContext("2d");
  const cw = canvas.width / COLS, ch = canvas.height / ROWS;
  const tiles = computePathTiles(map.waypoints);
  const toCSS = (hex) => "#" + new THREE.Color(hex).getHexString();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isPath = tiles.has(c + "," + r);
      const pair = isPath ? map.path : map.grass;
      g.fillStyle = toCSS(pair[(c + r) % 2]);
      g.fillRect(c * cw, r * ch, cw + 1, ch + 1);
    }
  }
  // Start & Ziel markieren
  const [sc, sr] = map.waypoints[0];
  const [ec, er] = map.waypoints[map.waypoints.length - 1];
  g.font = `${Math.floor(ch * 1.3)}px Arial`;
  g.textAlign = "center";
  g.fillText("➡️", Math.max(0.7, sc + 0.7) * cw, (sr + 0.9) * ch);
  g.fillText("🏰", Math.min(COLS - 0.8, ec - 0.6) * cw, (er + 0.9) * ch);
}

function buildMapGrid() {
  const grid = document.getElementById("map-grid");
  grid.innerHTML = "";
  for (const key of MAP_ORDER) {
    const map = MAPS[key];
    const card = document.createElement("div");
    card.className = "map-card";
    const cv = document.createElement("canvas");
    cv.width = 200; cv.height = 130;
    drawMapPreview(cv, key);
    card.appendChild(cv);
    const info = document.createElement("div");
    info.className = "map-card-info";
    info.innerHTML = `
      <div class="map-card-name">${map.icon} ${map.name}</div>
      <div class="map-card-stars">${"⭐".repeat(map.stars)}</div>
      <div class="map-card-diff">Schwierigkeit: ${map.diffName}</div>
      <div class="map-card-record">🏆 ${recordText(key)}</div>`;
    card.appendChild(info);
    card.addEventListener("click", () => openMapInfo(key));
    grid.appendChild(card);
  }
}

let infoMapKey = null;
function openMapInfo(key) {
  infoMapKey = key;
  const map = MAPS[key];
  document.getElementById("mi-name").textContent = `${map.icon} ${map.name}`;
  drawMapPreview(document.getElementById("mi-preview"), key);
  document.getElementById("mi-stats").innerHTML = `
    <span style="color:#ffd24a">${"⭐".repeat(map.stars)}</span> – ${map.diffName}<br>
    ${map.desc}<br>
    <span style="color:#7ee787">🏆 ${recordText(key)}</span>`;
  openWindow("mapinfo-overlay");
}

function refreshMenuInfo() {
  const best = bestRecordText();
  document.getElementById("menu-info").innerHTML =
    (best ? `🏆 Bester Rekord: ${best} · ` : "") + `🪙 ${getCoins()} Münzen`;
}

/* ---------------- Skin-Shop ---------------- */

function buildSkinGrid() {
  const grid = document.getElementById("skin-grid");
  grid.innerHTML = "";
  document.getElementById("shop-coins").textContent = getCoins();
  const owned = getOwnedSkins();
  const equipped = getEquippedSkin().id;

  for (const skin of SKINS) {
    const card = document.createElement("div");
    card.className = "skin-card" + (skin.id === equipped ? " equipped" : "");
    const has = owned.includes(skin.id);
    card.innerHTML = `
      <div class="skin-preview">
        <div class="skin-hat" style="background:${skin.hat}"></div>
        <div class="skin-head"></div>
        <div class="skin-body" style="background:${skin.body}"></div>
      </div>
      <div class="skin-name">${skin.name}</div>
      <div class="skin-price ${has ? "owned" : ""}">${skin.id === equipped ? "✅ Angezogen" : has ? "Anziehen" : `🪙 ${skin.price}`}</div>`;
    card.addEventListener("click", () => {
      ensureAudio();
      if (has) {
        localStorage.setItem("btd_skin", skin.id);
        sfx("upgrade");
        rebuildPlayerFigure();
      } else if (getCoins() >= skin.price) {
        addCoins(-skin.price);
        owned.push(skin.id);
        localStorage.setItem("btd_skins", JSON.stringify(owned));
        localStorage.setItem("btd_skin", skin.id);
        sfx("cash");
        rebuildPlayerFigure();
      } else {
        sfx("lose");
        card.classList.add("shake");
        setTimeout(() => card.classList.remove("shake"), 350);
        return;
      }
      buildSkinGrid();
      refreshMenuInfo();
    });
    grid.appendChild(card);
  }
}

/* ---------------- Rekorde-Fenster ---------------- */

function buildRecordsList() {
  const list = document.getElementById("records-list");
  list.innerHTML = "";
  for (const key of MAP_ORDER) {
    const map = MAPS[key];
    const row = document.createElement("div");
    row.className = "record-row";
    row.innerHTML = `
      <div class="record-icon">${map.icon}</div>
      <div>
        <div class="record-name">${map.name}</div>
        <div class="record-stars">${"⭐".repeat(map.stars)}</div>
      </div>
      <div class="record-value">${recordText(key)}</div>`;
    list.appendChild(row);
  }
  const coins = document.createElement("div");
  coins.className = "coins-line";
  coins.style.marginTop = "10px";
  coins.innerHTML = `🪙 Münzen gesamt: <b>${getCoins()}</b>`;
  list.appendChild(coins);
}

/* ---------------- Einstellungen ---------------- */

function applySettings() {
  sun.castShadow = state.settings.shadows;
  document.getElementById("btn-sound").textContent = state.settings.sound ? "🔊" : "🔇";
  document.getElementById("btn-music").textContent = state.settings.music ? "🎵" : "🔕";
  document.getElementById("set-sound").checked = state.settings.sound;
  document.getElementById("set-music").checked = state.settings.music;
  document.getElementById("set-shadows").checked = state.settings.shadows;
  document.getElementById("set-dmg").checked = state.settings.dmgNumbers;
}

/* ---------------- Ladebildschirm & Spielstart ---------------- */

function startGameOnMap(mapKey) {
  state.map = mapKey;
  localStorage.setItem("btd_map", mapKey);
  closeAllWindows();
  document.getElementById("menu-overlay").classList.add("hidden");
  document.getElementById("lobby-ui").classList.add("hidden");

  // Ladebildschirm
  const loading = document.getElementById("loading-overlay");
  document.getElementById("loading-map").textContent = `${MAPS[mapKey].icon} ${MAPS[mapKey].name}`;
  const fill = document.getElementById("loading-fill");
  fill.classList.remove("animate");
  void fill.offsetWidth;
  fill.classList.add("animate");
  loading.classList.remove("hidden");
  sfx("wave");

  setTimeout(() => {
    buildMap(mapKey);
    enterGame();
    loading.classList.add("hidden");
  }, 1200);
}

/* ---------------- Moduswechsel ---------------- */

function showMainMenu() {
  state.mode = "menu";
  state.running = false;
  state.paused = false;
  clearEntities();
  hideBanner();
  closeAllWindows();

  document.getElementById("gameover-overlay").classList.add("hidden");
  document.getElementById("win-overlay").classList.add("hidden");
  document.getElementById("loading-overlay").classList.add("hidden");
  document.getElementById("lobby-ui").classList.add("hidden");
  document.getElementById("menu-overlay").classList.remove("hidden");
  document.getElementById("sidebar").style.display = "";
  hideTowerPanel();

  world.visible = true;
  lobbyGroup.visible = false;
  controls.enabled = true;
  camera.position.copy(CAM_HOME.pos);
  controls.target.copy(CAM_HOME.target);
  controls.update();

  refreshMenuInfo();
  buildMapGrid();
  updateHUD();
}

function enterLobby() {
  state.mode = "lobby";
  state.running = false;
  state.paused = false;
  clearEntities();
  hideBanner();
  closeAllWindows();

  document.getElementById("menu-overlay").classList.add("hidden");
  document.getElementById("gameover-overlay").classList.add("hidden");
  document.getElementById("win-overlay").classList.add("hidden");
  document.getElementById("sidebar").style.display = "none";
  document.getElementById("lobby-ui").classList.remove("hidden");
  hideTowerPanel();

  world.visible = false;
  lobbyGroup.visible = true;
  controls.enabled = false;

  ensurePlayerFigure();
  player.x = LOBBY.spawn.x;
  player.z = LOBBY.spawn.z;
  player.yaw = Math.PI;
  player.group.position.set(player.x, 0, player.z);
  player.portalLatch = true; // erst auslösen, wenn man neu ins Portal läuft
  refreshLobbyBoard();
  updateHUD();
}

function enterGame() {
  state.mode = "game";
  world.visible = true;
  lobbyGroup.visible = false;
  controls.enabled = true;
  document.getElementById("sidebar").style.display = "";
  document.getElementById("lobby-ui").classList.add("hidden");
  camera.position.copy(CAM_HOME.pos);
  controls.target.copy(CAM_HOME.target);
  controls.update();
  resetGame();
  showBanner(`🗺 ${MAPS[state.map].name}`);
}

/* =====================================================================
   LOBBY-STEUERUNG (Laufen, Portal)
   ===================================================================== */

const keysDown = new Set();
document.addEventListener("keydown", (ev) => {
  keysDown.add(ev.key.toLowerCase());
  if (state.mode === "lobby" && ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(ev.key.toLowerCase())) {
    ev.preventDefault();
  }
});
document.addEventListener("keyup", (ev) => keysDown.delete(ev.key.toLowerCase()));
window.addEventListener("blur", () => keysDown.clear());

const PLAYER_SPEED = 160;
const PORTAL_RADIUS = 42;

function updateLobby(dt) {
  updateEffects(dt);
  state.lobbyTime = (state.lobbyTime || 0) + dt;

  // Bewegung (pausiert, solange ein Fenster offen ist)
  let mx = 0, mz = 0;
  if (modalStack.length === 0) {
    if (keysDown.has("w") || keysDown.has("arrowup")) mz -= 1;
    if (keysDown.has("s") || keysDown.has("arrowdown")) mz += 1;
    if (keysDown.has("a") || keysDown.has("arrowleft")) mx -= 1;
    if (keysDown.has("d") || keysDown.has("arrowright")) mx += 1;
  }

  player.moving = mx !== 0 || mz !== 0;
  if (player.moving) {
    const len = Math.hypot(mx, mz);
    player.x += (mx / len) * PLAYER_SPEED * dt;
    player.z += (mz / len) * PLAYER_SPEED * dt;
    player.x = Math.max(LOBBY.bounds.minX, Math.min(LOBBY.bounds.maxX, player.x));
    player.z = Math.max(LOBBY.bounds.minZ, Math.min(LOBBY.bounds.maxZ, player.z));
    player.yaw = approachAngle(player.yaw, Math.atan2(mx, mz), dt * 12);
    player.walkPhase += dt * 10;
  }

  // SPIELEN-Portal: beim Betreten öffnet sich die Modus-Auswahl
  const p = LOBBY.playPortal;
  const distToPortal = Math.hypot(player.x - p.trigger.x, player.z - p.trigger.z);
  if (distToPortal < PORTAL_RADIUS) {
    if (!player.portalLatch && modalStack.length === 0) {
      player.portalLatch = true;
      burst(player.x, 25, player.z, "#ffd24a", 12, 90, false);
      sfx("upgrade");
      openWindow("mode-overlay");
    }
  } else if (distToPortal > PORTAL_RADIUS + 25) {
    player.portalLatch = false;
  }

  // Lobby-Animationen
  ensurePlayerFigure();
  player.group.position.set(player.x, 0, player.z);
  player.group.rotation.y = player.yaw;
  const f = player.group.userData;
  const swing = player.moving ? Math.sin(player.walkPhase) * 0.7 : 0;
  f.legL.rotation.x = swing;
  f.legR.rotation.x = -swing;
  f.armL.rotation.x = -swing * 0.8;
  f.armR.rotation.x = swing * 0.8;

  p.glow.material.opacity = 0.5 + Math.sin(state.lobbyTime * 3) * 0.2;

  // Kamera folgt dem Spieler
  const camTarget = new THREE.Vector3(player.x, 30, player.z);
  const camPos = new THREE.Vector3(player.x, 260, player.z + 340);
  camera.position.lerp(camPos, Math.min(1, dt * 5));
  camera.lookAt(camTarget);
}

/* =====================================================================
   EINGABEN (Maus-Raycasting, Klick vs. Kamera-Drehen)
   ===================================================================== */

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();

function tileFromEvent(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(_ndc, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, _hit)) return null;
  const c = Math.floor(_hit.x / TILE), r = Math.floor(_hit.z / TILE);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { c, r, x: _hit.x, z: _hit.z };
}

renderer.domElement.addEventListener("pointermove", (ev) => {
  state.hoverTile = tileFromEvent(ev);
});
renderer.domElement.addEventListener("pointerleave", () => { state.hoverTile = null; });

let downPos = null;
renderer.domElement.addEventListener("pointerdown", (ev) => {
  if (ev.button === 0) downPos = { x: ev.clientX, y: ev.clientY };
});
renderer.domElement.addEventListener("pointerup", (ev) => {
  if (ev.button !== 0 || !downPos) return;
  const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
  downPos = null;
  if (moved > 6) return;
  handleClick(ev);
});

function handleClick(ev) {
  ensureAudio();
  if (!state.running) return;
  const tile = tileFromEvent(ev);
  if (!tile) return;
  const { c, r } = tile;

  if (state.placing) {
    if (canPlaceAt(c, r)) {
      const ok = placeTower(state.placing, c, r);
      if (ok && state.cash < TOWER_TYPES[state.placing].cost) {
        state.placing = null;
        refreshShopSelection();
      }
    } else {
      addText(tile.x, 14, tile.z, "Hier nicht möglich!", "#f87171");
    }
    return;
  }

  const hit = state.towers.find(t => t.c === c && t.r === r);
  selectTower(hit || null);
}

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    if (modalStack.length > 0) {
      closeWindow(modalStack[modalStack.length - 1]);
      return;
    }
    state.placing = null;
    selectTower(null);
    refreshShopSelection();
  }
  if (ev.key === " " && state.running) {
    ev.preventDefault();
    if (state.phase === "idle") startWave();
  }
  if ((ev.key === "p" || ev.key === "P") && state.running) togglePause();
});

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  document.getElementById("btn-pause").textContent = state.paused ? "▶" : "⏸";
  updateHUD();
}

/* ---------------- Buttons ---------------- */

// Hauptmenü
document.getElementById("btn-spielen").addEventListener("click", () => { ensureAudio(); openWindow("mode-overlay"); });
document.getElementById("btn-shop-open").addEventListener("click", () => { ensureAudio(); buildSkinGrid(); openWindow("shopwin-overlay"); });
document.getElementById("btn-settings-open").addEventListener("click", () => { ensureAudio(); applySettings(); openWindow("settings-overlay"); });
document.getElementById("btn-records-open").addEventListener("click", () => { ensureAudio(); buildRecordsList(); openWindow("records-overlay"); });
document.getElementById("btn-lobby").addEventListener("click", () => { ensureAudio(); enterLobby(); });
document.getElementById("btn-menu-from-lobby").addEventListener("click", () => { ensureAudio(); showMainMenu(); });

// Modus-Fenster
document.getElementById("mode-normal").addEventListener("click", () => {
  ensureAudio();
  buildMapGrid();
  closeWindow("mode-overlay");
  openWindow("map-overlay");
});
for (const card of document.querySelectorAll(".mode-card.locked")) {
  card.addEventListener("click", () => {
    sfx("lose");
    card.classList.add("shake");
    setTimeout(() => card.classList.remove("shake"), 350);
  });
}

// Karten-Detail
document.getElementById("btn-start-map").addEventListener("click", () => {
  ensureAudio();
  if (infoMapKey) startGameOnMap(infoMapKey);
});
document.getElementById("btn-back-map").addEventListener("click", () => closeWindow("mapinfo-overlay"));

// Schließen-/Zurück-Knöpfe aller Pixel-Fenster
for (const btn of document.querySelectorAll(".pixel-close")) {
  btn.addEventListener("click", () => closeWindow(btn.dataset.close));
}
for (const btn of document.querySelectorAll(".pixel-back")) {
  btn.addEventListener("click", () => {
    closeWindow(btn.dataset.back);
    // Zurück führt eine Ebene hoch: Karte -> Modus
    if (btn.dataset.back === "map-overlay") openWindow("mode-overlay");
  });
}

// Einstellungen
document.getElementById("set-sound").addEventListener("change", (ev) => { state.settings.sound = ev.target.checked; saveSettings(); applySettings(); });
document.getElementById("set-music").addEventListener("change", (ev) => { ensureAudio(); state.settings.music = ev.target.checked; saveSettings(); applySettings(); });
document.getElementById("set-shadows").addEventListener("change", (ev) => { state.settings.shadows = ev.target.checked; saveSettings(); applySettings(); });
document.getElementById("set-dmg").addEventListener("change", (ev) => { state.settings.dmgNumbers = ev.target.checked; saveSettings(); });

// Game Over / Sieg
document.getElementById("btn-retry").addEventListener("click", () => { ensureAudio(); startGameOnMap(state.map); });
document.getElementById("btn-again").addEventListener("click", () => { ensureAudio(); startGameOnMap(state.map); });
document.getElementById("btn-menu-go").addEventListener("click", () => { ensureAudio(); showMainMenu(); });
document.getElementById("btn-menu-win").addEventListener("click", () => { ensureAudio(); showMainMenu(); });

// Spiel-HUD
document.getElementById("btn-start").addEventListener("click", () => { ensureAudio(); startWave(); });

document.getElementById("chk-auto").addEventListener("change", (ev) => {
  state.autoStart = ev.target.checked;
  state.autoTimer = 2;
});

document.getElementById("btn-speed").addEventListener("click", (ev) => {
  state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1;
  ev.target.textContent = `⏩ ${state.speed}x`;
});

document.getElementById("btn-sound").addEventListener("click", () => {
  ensureAudio();
  state.settings.sound = !state.settings.sound;
  saveSettings();
  applySettings();
});

document.getElementById("btn-music").addEventListener("click", () => {
  ensureAudio();
  state.settings.music = !state.settings.music;
  saveSettings();
  applySettings();
});

document.getElementById("btn-pause").addEventListener("click", () => { ensureAudio(); togglePause(); });

document.getElementById("btn-cam").addEventListener("click", () => {
  if (state.mode !== "game") return;
  camera.position.copy(CAM_HOME.pos);
  controls.target.copy(CAM_HOME.target);
  controls.update();
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
  addText(t.x, 56, t.z, "LEVEL UP!", "#ffd24a");
  burst(t.x, 30, t.z, "#ffd24a", 12, 80, false);
  refreshTowerStuds(t);

  if (t.level === 2 && TOWER_TYPES[t.type].kind !== "farm") {
    const yaw = t.yaw;
    world.remove(t.group);
    disposeObject(t.group);
    t.group = makeTowerMesh(t.type, t.level);
    t.group.position.set(t.x, 0, t.z);
    t.group.userData.rotG.rotation.y = yaw;
    world.add(t.group);
    refreshTowerStuds(t);
  }
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
  removeTower(t);
  selectTower(null);
  sfx("sell");
  updateHUD();
});

/* =====================================================================
   GAME-LOOP
   ===================================================================== */

let lastTime = performance.now();
function loop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 0.05);

  if (state.mode === "lobby") {
    updateLobby(dt);
  } else {
    for (let i = 0; i < state.speed; i++) update(dt);
  }

  syncVisuals(dt);
  if (state.mode !== "lobby") controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

/* ---------------- Start ---------------- */

loadSettings();
buildMap(state.map);
refreshShop();
applySettings();
showMainMenu();
requestAnimationFrame(loop);
