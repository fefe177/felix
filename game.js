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
const TOWER_RADIUS = 15;       // Platzbedarf eines Turms
const TOWER_MIN_DIST = 32;     // Mindestabstand zwischen Türmen

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
    desc: "Riesige Reichweite – nur auf ⛰ Anhöhen!",
    cost: 400,
    unlockWave: 0,
    kind: "hitscan",
    cliff: true,
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
  nest: {
    name: "Minigun Nest",
    icon: "🪖",
    color: "#3f6212",
    desc: "Selbst steuern! Nur 1× pro Spiel (ab Welle 4)",
    cost: 1500,
    unlockWave: 4,
    kind: "nest",
    unique: true,           // nur ein Exemplar gleichzeitig auf der Karte
    manual: true,           // schießt nur, wenn ein Spieler ihn bedient
    levels: [
      // dmg = Schaden/Schuss, rate = max. Schüsse/s, spinUp = Sek. bis Vollgeschwindigkeit
      // pierce = Gegner pro Kugel, heatRate = Hitze/s beim Feuern (100 = Überhitzung),
      // coolRate = Abkühlung/s wenn nicht gefeuert, overheatLock = Zwangspause in Sek.
      { dmg: 6,   range: 240, rate: 12, spinUp: 1.3, pierce: 1, heatRate: 22, coolRate: 30, overheatLock: 3.0, upgradeCost: 900 },
      { dmg: 10,  range: 260, rate: 14, spinUp: 1.1, pierce: 2, heatRate: 20, coolRate: 34, overheatLock: 2.6, upgradeCost: 2000 },
      { dmg: 16,  range: 285, rate: 16, spinUp: 0.9, pierce: 2, heatRate: 18, coolRate: 40, overheatLock: 2.2, upgradeCost: 4200 },
      { dmg: 26,  range: 310, rate: 19, spinUp: 0.7, pierce: 3, heatRate: 15, coolRate: 48, overheatLock: 1.6, upgradeCost: 8500 },
      { dmg: 42,  range: 340, rate: 23, spinUp: 0.5, pierce: 4, heatRate: 11, coolRate: 60, overheatLock: 1.0, splash: 36, upgradeCost: null },
    ],
  },
  laser: {
    name: "Laserturm",
    icon: "🔆",
    color: "#06b6d4",
    desc: "Lädt auf & feuert Laser – trifft auch Metall & Unsichtbare!",
    cost: 1200,
    unlockWave: 10,
    kind: "laser",
    levels: [
      // charge = Sek. Aufladen vor dem Schuss, dmg = Schaden pro Strahl
      { dmg: 90,   range: 230, rate: 0.9, charge: 0.8, upgradeCost: 800 },
      { dmg: 150,  range: 245, rate: 1.0, charge: 0.7, upgradeCost: 1600 },
      { dmg: 260,  range: 260, rate: 1.1, charge: 0.6, upgradeCost: 3200 },
      { dmg: 430,  range: 280, rate: 1.2, charge: 0.5, upgradeCost: 6500 },
      { dmg: 720,  range: 305, rate: 1.4, charge: 0.4, pierce: 3, upgradeCost: null },
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
  // ----- Spezial-Gegner mit Schwächen -----
  metal:   { name: "Metall-Zombie", hp: 320, speed: 34, reward: 28, dmg: 2, scale: 1.15, color: "#9ca3af", headColor: "#cbd5e1", metal: true },
  ghost:   { name: "Geist",    hp: 130,  speed: 70,  reward: 26,  dmg: 2,  scale: 1.0,  color: "#a5b4fc", headColor: "#c7d2fe", invisible: true },
  flyer:   { name: "Flieger",  hp: 150,  speed: 80,  reward: 30,  dmg: 2,  scale: 0.95, color: "#f472b6", headColor: "#f9a8d4", flying: true },
  slime:   { name: "Schleim",  hp: 90,   speed: 60,  reward: 12,  dmg: 1,  scale: 0.9,  color: "#34d399", headColor: "#6ee7b7" },
  brute:   { name: "Koloss",   hp: 700,  speed: 28,  reward: 55,  dmg: 4,  scale: 1.5,  color: "#7c3f1d", headColor: "#a8743f" },
  boss:    { name: "BOSS",     hp: 3500, speed: 26,  reward: 400, dmg: 25, scale: 1.8,  color: "#dc2626", headColor: "#ef4444" },

  // ----- Boss-Rush-Bosse mit Spezialfähigkeiten -----
  boss_summoner: { name: "Beschwörer", hp: 6000,  speed: 24, reward: 600, dmg: 20, scale: 1.9,  color: "#16a34a", headColor: "#4ade80", ability: "summon",  abilityEvery: 5,  crown: true },
  boss_blinder:  { name: "Schattenfürst", hp: 7000, speed: 28, reward: 700, dmg: 20, scale: 1.95, color: "#4c1d95", headColor: "#a855f7", ability: "blind",   abilityEvery: 8,  crown: true },
  boss_rager:    { name: "Berserker", hp: 8000,  speed: 30, reward: 750, dmg: 25, scale: 2.0,  color: "#b91c1c", headColor: "#f87171", ability: "rage",    crown: true },
  boss_titan:    { name: "Titan",     hp: 14000, speed: 20, reward: 1200, dmg: 40, scale: 2.4,  color: "#1f2937", headColor: "#fbbf24", ability: "summon",  abilityEvery: 4,  crown: true },
};

// Reihenfolge der Bosse im Boss-Rush (wiederholt sich danach, stärker)
const BOSS_RUSH_ORDER = ["boss", "boss_summoner", "boss_blinder", "boss_rager", "boss_titan"];

/* ---------------- Die 5 Karten ----------------
   Jede Karte hat eigenen Weg, Farben, Deko-Thema und Schwierigkeit. */

const MAPS = {
  grasslands: {
    name: "Grasslands", icon: "🌲", stars: 1, diffName: "Einfach", hpMult: 1.0,
    desc: "Grüne Wiesen, Holzbrücken, kleine Häuser",
    grass: [0x5bbf4a, 0x4fb23f], path: [0xe6c98a, 0xddbe79],
    sky: 0x8fd6ef, skyTop: 0x3f8fe0, water: 0x2f8fe0, earth: 0x8a6437, portal: 0x9bff7a,
    deco: "grass", clouds: true,
    waypoints: [[-1, 2], [3, 2], [3, 6], [8, 6], [8, 2], [13, 2], [13, 9], [5, 9], [5, 11], [17, 11], [17, 5], [20, 5]],
    hills: [{ c: 0, r: 4, w: 2, h: 2 }, { c: 10, r: 4, w: 2, h: 2 }, { c: 15, r: 0, w: 2, h: 2 }],
  },
  desert: {
    name: "Desert Valley", icon: "🏜", stars: 2, diffName: "Mittel", hpMult: 1.15,
    desc: "Sand, Kakteen und alte Ruinen",
    grass: [0xf0d38c, 0xe6c578], path: [0xc99a64, 0xbc8d57],
    sky: 0xffe0a3, skyTop: 0x86b8ec, water: 0x3aa0d8, earth: 0xa07840, portal: 0xffd24a,
    deco: "desert", clouds: true,
    waypoints: [[-1, 6], [4, 6], [4, 2], [9, 2], [9, 10], [14, 10], [14, 4], [20, 4]],
    hills: [{ c: 1, r: 2, w: 2, h: 2 }, { c: 6, r: 4, w: 2, h: 2 }, { c: 16, r: 7, w: 2, h: 2 }],
  },
  frozen: {
    name: "Frozen Base", icon: "❄", stars: 3, diffName: "Mittel", hpMult: 1.3,
    desc: "Schnee, Eiswege, gefrorene Gebäude",
    grass: [0xf3f9ff, 0xe2eefa], path: [0x9fdcf5, 0x8ccfee],
    sky: 0xcfe7f5, skyTop: 0x7fb4e0, water: 0x68bfe8, earth: 0x9aa7b5, portal: 0x9be8ff,
    deco: "snow", clouds: true,
    waypoints: [[-1, 10], [3, 10], [3, 3], [7, 3], [7, 8], [12, 8], [12, 3], [16, 3], [16, 10], [20, 10]],
    hills: [{ c: 0, r: 0, w: 2, h: 2 }, { c: 9, r: 5, w: 2, h: 2 }, { c: 18, r: 0, w: 2, h: 2 }],
  },
  volcano: {
    name: "Volcano Island", icon: "🌋", stars: 4, diffName: "Schwer", hpMult: 1.5,
    desc: "Lava, Vulkane und schwarze Felsen",
    grass: [0x434048, 0x3a373e], path: [0x7d5a44, 0x6e4d3a],
    sky: 0x6e3a44, skyTop: 0x2a1622, water: 0xff5a1e, waterGlow: 0xb83408, earth: 0x2a262b, portal: 0xff8a3a,
    deco: "volcano", clouds: false,
    waypoints: [[-1, 2], [6, 2], [6, 11], [11, 11], [11, 5], [15, 5], [15, 9], [20, 9]],
    hills: [{ c: 2, r: 5, w: 2, h: 2 }, { c: 8, r: 4, w: 2, h: 2 }, { c: 17, r: 2, w: 2, h: 2 }],
  },
  space: {
    name: "Space Station", icon: "🌌", stars: 5, diffName: "Extrem", hpMult: 1.75,
    desc: "Weltraum, Neonblöcke, schwebende Plattformen",
    grass: [0x2f2f63, 0x282857], path: [0x35c0d8, 0x2bb0c8],
    sky: 0x0a0e26, skyTop: 0x020310, water: 0x0a0e22, earth: 0x161a3a, portal: 0x4df0ff,
    deco: "space", clouds: false,
    waypoints: [[-1, 6], [2, 6], [2, 2], [6, 2], [6, 10], [10, 10], [10, 2], [14, 2], [14, 10], [18, 10], [18, 6], [20, 6]],
    hills: [{ c: 0, r: 0, w: 2, h: 2 }, { c: 8, r: 4, w: 2, h: 2 }, { c: 16, r: 3, w: 2, h: 2 }],
  },
};
const MAP_ORDER = ["grasslands", "desert", "frozen", "volcano", "space"];

/* ---------------- Schwierigkeitsgrade (TDS-Stil) ----------------
   Werden NACH der Karte gewählt und multiplizieren auf die Karten-Werte. */
const DIFFICULTIES = [
  { id: "einfach",     name: "Einfach",     icon: "😊", sub: "Für den Einstieg",          hpMult: 0.8, lives: 130, rewardMult: 1.0, color: "#22c55e" },
  { id: "laessig",     name: "Lässig",      icon: "🙂", sub: "Etwas mehr Gegner",         hpMult: 1.0, lives: 100, rewardMult: 1.15, color: "#3b82f6" },
  { id: "mittelstufe", name: "Mittelstufe", icon: "😎", sub: "Für erfahrene Spieler",     hpMult: 1.2, lives: 110, rewardMult: 1.35, color: "#f59e0b" },
  { id: "geschmolzen", name: "Geschmolzen", icon: "🌋", sub: "Heiße Hölle – harte Gegner", hpMult: 1.5, lives: 90,  rewardMult: 1.7, color: "#ef4444" },
  { id: "fallen",      name: "Fallen",      icon: "💀", sub: "Nur für Profis!",            hpMult: 1.85, lives: 75,  rewardMult: 2.2, color: "#a855f7" },
];
function curDiff() {
  return DIFFICULTIES.find(d => d.id === state.difficulty) || DIFFICULTIES[1];
}

/* ---------------- Spielmodi (horizontale Auswahl wie TDS) ---------------- */
const GAME_MODES = [
  { id: "normal",   name: "Überleben",     icon: "🛡", sub: "40 Wellen verteidigen" },
  { id: "bossrush", name: "Boss Rush",     icon: "👹", sub: "Nur Bosse, alle 60s einer", lockedFn: () => !isBossRushUnlocked(), lockedSub: "Gewinne eine ⭐⭐⭐-Karte!" },
  { id: "hardcore", name: "Hardcore",      icon: "🔥", sub: "Bald verfügbar", locked: true },
  { id: "pvp",      name: "PVP",           icon: "⚔️", sub: "Bald verfügbar", locked: true },
  { id: "special",  name: "Spezielle Modi", icon: "✨", sub: "Bald verfügbar", locked: true },
  { id: "sandbox",  name: "Sandkiste",     icon: "🧰", sub: "Bald verfügbar", locked: true },
];

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
  gameMode: "normal",    // "normal" | "bossrush"
  difficulty: localStorage.getItem("btd_diff") || "laessig",  // gewählte Schwierigkeit
  bossRush: null,        // { next, num, total } im Boss-Rush-Modus
  portalAlarm: 0,        // Portal pulsiert rot kurz vor einem Boss
  gateFlash: 0,          // Ziel-Tor blitzt rot bei Lebensverlust
  blindUntil: 0,         // Türme können bis hierhin nicht schießen (Boss-Fähigkeit)
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
  hoverPoint: null,      // Punkt unter dem Cursor (freie Platzierung)
  time: 0,
  shake: 0,
  settings: { sound: true, music: true, shadows: true, dmgNumbers: true, hiRes: true, rt: true, volSfx: 70, volMusic: 60 },
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

// Boss Rush: freigeschaltet, sobald eine ⭐⭐⭐-Karte (oder schwerer) gewonnen wurde
function isBossRushUnlocked() {
  if (loadJSON("btd_bossrush", false)) return true;
  const rec = loadRecords();
  for (const key of MAP_ORDER) {
    if (MAPS[key].stars >= 3 && rec[key] && rec[key] > MAX_WAVE) return true;
  }
  return false;
}
function unlockBossRush() { localStorage.setItem("btd_bossrush", "true"); }
function bossRushBest() { return loadJSON("btd_bossrush_best", 0); }
function saveBossRushBest(n) {
  if (n > bossRushBest()) { localStorage.setItem("btd_bossrush_best", JSON.stringify(n)); return true; }
  return false;
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
// Weißes Rauschen für Knall-/Zisch-Sounds (einmal erzeugt, dann wiederverwendet)
let noiseBuffer = null;
function getNoiseBuffer() {
  if (!noiseBuffer) {
    noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.5, audioCtx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function sfxVolume() { return state.settings.volSfx / 70; } // 70 = alte Lautstärke

function sfx(type) {
  if (!state.settings.sound || !audioCtx || state.settings.volSfx === 0) return;
  const now = audioCtx.currentTime;
  const V = sfxVolume();

  // Ein Ton, optional mit Gleiten und Verzögerung (für Echos/Knistern)
  function tone(freq, dur, vol, shape, slideTo, delay) {
    const t = now + (delay || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = shape || "square";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol * V, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + dur);
  }

  // Rausch-Stoß durch einen Bandpass-Filter (Knall, Zischen, Wumms)
  function noise(dur, vol, fromFreq, toFreq, delay) {
    const t = now + (delay || 0);
    const src = audioCtx.createBufferSource();
    src.buffer = getNoiseBuffer();
    src.loop = true;
    const f = audioCtx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(fromFreq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t + dur);
    f.Q.value = 0.9;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(vol * V, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(audioCtx.destination);
    src.start(t); src.stop(t + dur);
  }

  switch (type) {
    // ----- Turm-Schüsse: jeder Turm klingt anders -----
    case "shoot":   // Schütze: kurzer Plopp
      tone(620, 0.06, 0.06, "sine", 240); break;
    case "minigun": // Minigunner: schnelles Rattern
      tone(280 + Math.random() * 60, 0.035, 0.03, "sawtooth", 180);
      noise(0.03, 0.025, 2500, 1200); break;
    case "sniper":  // Scharfschütze: lauter Knall mit Hall
      noise(0.16, 0.16, 2200, 300);
      tone(130, 0.28, 0.11, "sawtooth", 45);
      noise(0.22, 0.05, 900, 200, 0.14);   // Echo 1
      noise(0.28, 0.022, 600, 150, 0.30);  // Echo 2 (Hall)
      break;
    case "frost":   // Eismagier: glitzerndes Klingen
      tone(900, 0.15, 0.05, "sine", 1500);
      tone(1350, 0.12, 0.03, "sine", 1800, 0.05); break;
    case "zap":     // Tesla: elektrisches Knistern
      for (let i = 0; i < 5; i++) {
        tone(700 + Math.random() * 1600, 0.03, 0.05, "sawtooth", 200 + Math.random() * 400, i * 0.022);
      }
      noise(0.12, 0.04, 4000, 1500); break;
    case "flame":   // Flammenwerfer: Fauchen
      noise(0.16, 0.05, 500, 200);
      tone(95, 0.13, 0.03, "sawtooth", 55); break;
    case "rocketlaunch": // Rakete: Zisch beim Abschuss
      noise(0.3, 0.08, 500, 2800);
      tone(220, 0.18, 0.04, "sawtooth", 90); break;
    case "boom":    // Explosion: Wumms
      noise(0.4, 0.22, 500, 50);
      tone(85, 0.4, 0.16, "sawtooth", 28); break;

    // ----- Gegner & Spiel -----
    case "die":     // Gegner-Tod
      tone(330, 0.1, 0.05, "square", 110);
      noise(0.1, 0.04, 1200, 300); break;
    case "bosshorn": { // Boss-Warnung: tiefes Horn
      const t = now;
      for (const f of [65, 98]) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sawtooth";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.16 * V, t + 0.25);
        g.gain.setValueAtTime(0.16 * V, t + 0.7);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + 1.4);
      }
      break;
    }
    case "leak":    tone(220, 0.30, 0.12, "sawtooth", 80); break;
    case "heal":    tone(660, 0.12, 0.05, "sine", 990); break;
    case "wave":    tone(330, 0.25, 0.10, "triangle", 660); break;

    // ----- Geld & UI -----
    case "coin":    // Münz-Klingeln (Farm)
      tone(988, 0.08, 0.06, "sine", 988);
      tone(1319, 0.14, 0.06, "sine", 1319, 0.07); break;
    case "cash":    tone(880, 0.09, 0.06, "sine", 1320); break;
    case "place":   tone(500, 0.12, 0.08, "triangle", 700); break;
    case "upgrade": tone(440, 0.10, 0.08, "triangle", 880); break;
    case "sell":    tone(600, 0.15, 0.08, "triangle", 300); break;
    case "click":   tone(700, 0.05, 0.05, "triangle", 500); break;
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
  if (state.settings.volMusic === 0) return;
  const t = audioCtx.currentTime;
  const VM = state.settings.volMusic / 60; // 60 = alte Lautstärke

  const note = MELODY[musicStep % MELODY.length];
  if (note) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "triangle";
    o.frequency.value = note;
    g.gain.setValueAtTime(0.030 * VM, t);
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
    g.gain.setValueAtTime(0.022 * VM, t);
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

// Sanftes Fülllicht von der Gegenseite – lässt die Klötzchen plastischer wirken
const fillLight = new THREE.DirectionalLight(0xc9e0ff, 0.28);
fillLight.position.set(W * 0.85, 320, D * 1.3);
scene.add(fillLight);

/* ---------------- Himmel-Shader (Farbverlauf + Sonne) ---------------- */

const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(4500, 24, 12),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3d7edb) },
      bottomColor: { value: new THREE.Color(0x87ceeb) },
      sunDir: { value: new THREE.Vector3(-240, 700, -281).normalize() },
      sunIntensity: { value: 1 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 sunDir;
      uniform float sunIntensity;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(bottomColor, topColor, pow(h, 0.65));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.93, 0.75) * (pow(s, 800.0) * 1.2 + pow(s, 40.0) * 0.18) * sunIntensity;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
skyDome.position.set(W / 2, 0, D / 2);
skyDome.renderOrder = -1;
scene.add(skyDome);
scene.background = null; // der Dome ist jetzt der Himmel

// Welt-Gruppe (für Kamera-Wackeln bei Treffern)
const world = new THREE.Group();
scene.add(world);

// Karten-Inhalt (wird pro Karte neu gebaut)
const mapGroup = new THREE.Group();
world.add(mapGroup);

/* ---------------- Wasser mit "Ray-Tracing"-Spiegelung + Wellen-Shader ----------------
   Drei Ebenen:
   1. waterMirror  – echte Spiegelung der Szene (Reflector, wie Ray Tracing)
   2. water        – einfaches Lambert-Wasser (Fallback / Lava auf Volcano)
   3. waterFX      – eigener Shader mit animierten Wellen und Sonnen-Glitzern */

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(12000, 12000),
  new THREE.MeshLambertMaterial({ color: 0x2f7fd1, transparent: true, opacity: 0.92 })
);
water.rotation.x = -Math.PI / 2;
water.position.set(W / 2, -44, D / 2);
water.receiveShadow = true;
scene.add(water);

// Spiegel-Ebene: rendert die Szene gespiegelt mit (Ray-Tracing-Optik)
const waterMirror = new THREE.Reflector(new THREE.PlaneGeometry(12000, 12000), {
  clipBias: 0.003,
  textureWidth: 1024,
  textureHeight: 1024,
  color: 0x99aabb,
});
waterMirror.rotation.x = -Math.PI / 2;
waterMirror.position.set(W / 2, -44, D / 2);
scene.add(waterMirror);

// Wellen-Shader: Farbton + wandernde Wellen + Glitzer-Highlights
const waterFX = new THREE.Mesh(
  new THREE.PlaneGeometry(12000, 12000),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(0x2f7fd1) },
      alpha: { value: 0.4 },
    },
    vertexShader: `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float time;
      uniform vec3 color;
      uniform float alpha;
      varying vec2 vPos;
      void main() {
        float w1 = sin(vPos.x * 0.045 + time * 1.4);
        float w2 = sin(vPos.y * 0.05  - time * 1.1);
        float w3 = sin((vPos.x + vPos.y) * 0.025 + time * 0.7);
        float ripple = (w1 + w2 + w3) / 3.0;
        float glint = smoothstep(0.72, 1.0, ripple);
        vec3 col = color + vec3(1.0, 1.0, 0.85) * glint * 0.35;
        float a = alpha * (0.75 + 0.25 * ripple);
        gl_FragColor = vec4(col, a);
      }`,
  })
);
waterFX.rotation.x = -Math.PI / 2;
waterFX.position.set(W / 2, -43.4, D / 2);
scene.add(waterFX);

// Schaltet je nach Karte/Einstellung zwischen Spiegel-Wasser und Lava/Fallback um
function updateWaterMode() {
  const map = MAPS[state.map];
  const lava = !!map.waterGlow;
  const rt = state.settings.rt && !lava;
  waterMirror.visible = rt;
  water.visible = !rt;
  waterFX.visible = true;
  waterFX.material.uniforms.color.value.set(map.water);
  waterFX.material.uniforms.alpha.value = rt ? 0.35 : (lava ? 0.5 : 0.55);
}

// Größe an Container anpassen.
// "Hohe Grafik": mindestens 2x Supersampling (mehr Pixel), max. 3x.
function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h);
  const ratio = state.settings.hiRes
    ? Math.min(Math.max(window.devicePixelRatio, 2), 3)
    : Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(ratio);
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

/* ---- Block-Helfer: alles aus Würfeln, kein Rund (Minecraft-Stil) ---- */

// Stufen-Pyramide aus Blöcken (ersetzt Kegel: Hüte, Dächer, Vulkan, Eiszapfen)
function pyramid(baseW, height, mat, x, y, z, layers, taperToBase) {
  const g = new THREE.Group();
  layers = layers || 5;
  for (let i = 0; i < layers; i++) {
    const f = i / layers;                  // 0 unten .. fast 1 oben
    const w = baseW * (1 - f * 0.85);
    const h = height / layers;
    const blk = box(w, h, w, mat, 0, h / 2 + i * h, 0);
    g.add(blk);
  }
  g.position.set(x || 0, y || 0, z || 0);
  return g;
}

// Block-"Edelstein" (ersetzt Kugeln/Ikosaeder: Orbs, Spitzen) – kleine Würfel
function gem(size, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
  m.position.set(x || 0, y || 0, z || 0);
  m.rotation.set(0.4, 0.785, 0);   // gedreht für Kristall-Look (bleibt ein Würfel)
  m.castShadow = true;
  return m;
}

// Säule mit quadratischem Querschnitt (ersetzt Zylinder)
function pillar(w, ht, material, x, y, z) {
  return box(w, ht, w, material, x, y, z);
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

let spawnPortal = null;   // { group, glow, ring?, baseColor, baseOpacity, x, z, theme }
let endGate = null;       // { group, door, baseColor }
let decoByTile = new Map();

// Anhöhen der aktiven Karte: { minX, maxX, minZ, maxZ, y }
const HILL_H = 36;
let hills = [];

function hillAt(x, z) {
  for (const h of hills) {
    if (x >= h.minX && x <= h.maxX && z >= h.minZ && z <= h.maxZ) return h;
  }
  return null;
}

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
      g.add(box(26, 18, 26, lambert(0x46a83c), 0, 26, 0));
      g.add(box(18, 13, 18, lambert(0x5bbf4a), 0, 41, 0));
    } else if (v < 0.11) {
      g = new THREE.Group();
      const rock = box(16, 11, 13, lambert(0x9aa0a6), 0, 5, 0);
      rock.rotation.y = off * 2;
      g.add(rock);
      g.add(box(8, 6, 7, lambert(0xb8bdc4), 5, 11, 2));
    } else if (v < 0.18) {
      g = new THREE.Group();
      g.add(box(1.6, 7, 1.6, lambert(0x46a83c), 0, 3.5, 0));
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
      // Eiskristall (aus Blöcken gestapelt)
      g = new THREE.Group();
      const iceMat = new THREE.MeshLambertMaterial({ color: 0xbfeaff, emissive: 0x2a6e96, emissiveIntensity: 0.35 });
      const c1 = box(7, 7, 7, iceMat, 0, 5, 0); c1.rotation.y = 0.785;
      const c2 = box(5, 9, 5, iceMat, 0, 12, 0); c2.rotation.y = 0.785;
      g.add(c1, c2);
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
      // Lava-Pfütze (flacher Block)
      g = new THREE.Group();
      const s = 16 + off * 8;
      const pool = box(s, 1.5, s, new THREE.MeshLambertMaterial({ color: 0xff7a33, emissive: 0xd64018, emissiveIntensity: 0.8 }), 0, 0.8, 0);
      pool.castShadow = false;
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
      const roof = pyramid(38, 18, lambert(0xb33939), 0, 24, 0, 5);
      h.add(roof);
      h.add(box(9, 13, 3, lambert(0x5b3a1e), 0, 6.5, 14.5));
      h.add(box(7, 7, 2, lambert(0x9cc8e8), 10, 15, 14));
      h.position.set((c + 0.5) * TILE, 0, (r + 0.5) * TILE);
      registerDeco(c, r, h);
      extras.push(h);
    }
    // Teich mit Holzbrücke
    const pondG = new THREE.Group();
    const pond = box(60, 2, 60, lambert(0x4aa3df), 0, 1, 0);
    pond.castShadow = false;
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
    bunker.position.set(5.5 * TILE, 0, 0.6 * TILE);
    registerDeco(5, 0, bunker);
    extras.push(bunker);
  } else if (mapKey === "volcano") {
    // Großer Vulkan
    const volcano = new THREE.Group();
    volcano.add(pyramid(96, 76, lambert(0x2b2b31), 0, 0, 0, 8));   // Vulkankegel aus Blöcken
    const lavaTop = box(24, 6, 24, new THREE.MeshLambertMaterial({ color: 0xff7a33, emissive: 0xd64018, emissiveIntensity: 1 }), 0, 74, 0);
    volcano.add(lavaTop);
    volcano.position.set(18.2 * TILE, 0, 1.4 * TILE);
    registerDeco(18, 1, volcano);
    extras.push(volcano);
  } else if (mapKey === "space") {
    // Funkturm mit blinkender Spitze
    const antenna = new THREE.Group();
    antenna.add(box(14, 8, 14, lambert(0x2a3158), 0, 4, 0));
    antenna.add(box(4, 70, 4, lambert(0x39406e), 0, 43, 0));
    const tip = box(8, 8, 8, new THREE.MeshLambertMaterial({ color: 0xff5b7f, emissive: 0xe11d48, emissiveIntensity: 1 }), 0, 82, 0);
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

/* ---------------- Spawn-Portal: hier betreten die Gegner den Weg ----------------
   Jede Karte hat ein eigenes Portal passend zum Thema. Innen ist es dunkel
   mit einem Glühen in Karten-Farbe – Gegner treten "aus dem Dunkel". */

function buildSpawnPortal(mapKey, map) {
  const g = new THREE.Group();
  const pos = PATH[0]; // liegt knapp außerhalb des Felds, Gegner laufen in +X

  // Dunkler Innenraum (verdeckt das Aufploppen der Gegner)
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(42, 46), new THREE.MeshBasicMaterial({ color: 0x05060a }));
  dark.position.set(16, 23, 0);
  dark.rotation.y = Math.PI / 2;
  g.add(dark);

  // Glühen in Karten-Farbe
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 38),
    new THREE.MeshBasicMaterial({ color: map.portal, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.set(16.6, 22, 0);
  glow.rotation.y = Math.PI / 2;
  g.add(glow);

  let ring = null;

  if (mapKey === "grasslands") {
    // Höhleneingang im Felshügel mit Ranken
    const rock = lambert(0x6b7280);
    g.add(box(34, 60, 70, rock, -8, 28, 0));
    g.add(box(22, 18, 78, lambert(0x5d6672), 4, 56, 0));
    g.add(box(20, 64, 18, rock, 8, 30, -38));
    g.add(box(20, 64, 18, rock, 8, 30, 38));
    g.add(box(30, 26, 30, lambert(0x46a83c), -6, 70, -20)); // Gras oben
    g.add(box(24, 20, 24, lambert(0x5bbf4a), 0, 66, 24));
    for (const vz of [-16, -5, 7, 16]) { // Ranken vor dem Eingang
      g.add(box(2.2, 12 + Math.abs(vz), 2.2, lambert(0x46a83c), 17, 48 - (12 + Math.abs(vz)) / 2, vz));
    }
  } else if (mapKey === "desert") {
    // Zerfallener Ruinen-Torbogen
    const sand = lambert(0xd9bd92);
    g.add(box(16, 56, 16, sand, 10, 28, -28));
    g.add(box(16, 44, 16, lambert(0xcdb088), 10, 22, 28));
    const lintel = box(16, 12, 42, sand, 10, 58, -10);
    lintel.rotation.x = 0.12;
    g.add(lintel);
    g.add(box(12, 8, 12, lambert(0xc4a06a), 16, 4, 42)); // Trümmer
    g.add(box(8, 6, 8, lambert(0xc4a06a), 20, 3, -44));
  } else if (mapKey === "frozen") {
    // Eishöhle mit Eiszapfen
    const ice = new THREE.MeshLambertMaterial({ color: 0xcfe9f5, transparent: true, opacity: 0.95 });
    g.add(box(34, 62, 72, ice, -8, 29, 0));
    g.add(box(24, 18, 80, lambert(0xffffff), 2, 58, 0));
    g.add(box(20, 60, 16, ice, 8, 28, -38));
    g.add(box(20, 60, 16, ice, 8, 28, 38));
    for (const vz of [-14, -4, 6, 15]) { // Eiszapfen
      const ih = 10 + Math.abs(vz) * 0.5;
      const icicle = pyramid(5, ih, lambert(0xe8f6fc), 17, 44, vz, 3);
      icicle.scale.y = -1;   // nach unten zeigend
      g.add(icicle);
    }
  } else if (mapKey === "volcano") {
    // Glühender Lavaspalt
    const rockMat = lambert(0x26262c);
    const r1 = box(30, 64, 34, rockMat, -4, 30, -28); r1.rotation.z = 0.1; g.add(r1);
    const r2 = box(30, 58, 34, rockMat, -4, 27, 28); r2.rotation.z = -0.08; g.add(r2);
    const r3 = box(26, 22, 70, lambert(0x33333a), 0, 62, 0); r3.rotation.x = 0.06; g.add(r3);
    // Leuchtende Risse
    for (const [rx, rz, rh] of [[14, -24, 26], [15, 26, 20], [12, 0, 14]]) {
      g.add(box(1.5, rh, 3.5, new THREE.MeshBasicMaterial({ color: 0xff9a4d }), rx, 52 - rh / 2, rz));
    }
  } else if (mapKey === "space") {
    // Sci-Fi-Teleporter mit Energie-Ring
    const frame = lambert(0x2a3158);
    g.add(box(14, 60, 14, frame, 6, 30, -32));
    g.add(box(14, 60, 14, frame, 6, 30, 32));
    g.add(box(14, 12, 78, frame, 6, 64, 0));
    g.add(box(14, 6, 78, frame, 6, 2, 0));
    // Energie-Ring aus Blöcken (Achteck statt Torus)
    ring = new THREE.Group();
    const ringMat = new THREE.MeshLambertMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.9 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const blk = box(5, 5, 5, ringMat, Math.cos(a) * 24, Math.sin(a) * 24, 0);
      ring.add(blk);
    }
    ring.rotation.y = Math.PI / 2;
    ring.position.set(14, 26, 0);
    g.add(ring);
    g.add(box(4, 4, 4, new THREE.MeshBasicMaterial({ color: 0xff5b7f }), 6, 70, -32));
    g.add(box(4, 4, 4, new THREE.MeshBasicMaterial({ color: 0x7ee787 }), 6, 70, 32));
  }

  g.position.set(pos.x - 14, 0, pos.z);
  mapGroup.add(g);
  spawnPortal = {
    group: g, glow, ring,
    baseColor: map.portal, baseOpacity: 0.35,
    x: pos.x, z: pos.z, theme: mapKey, baseX: pos.x - 14,
  };
}

/* ---------------- Ziel-Tor: hier kommen die Gegner an ----------------
   Blitzt rot auf, wenn ein Gegner durchkommt. */

function buildEndGate(mapKey, map) {
  const g = new THREE.Group();
  const endRow = map.waypoints[map.waypoints.length - 1][1];
  const z = (endRow + 0.5) * TILE;

  const frameCol = mapKey === "frozen" ? 0xdfe9f0 : mapKey === "space" ? 0x2a3158 : mapKey === "volcano" ? 0x33333a : mapKey === "desert" ? 0xcdb088 : 0x8a6437;
  const frame = lambert(frameCol);
  g.add(box(12, 52, 12, frame, 0, 26, -26));
  g.add(box(12, 52, 12, frame, 0, 26, 26));
  g.add(box(12, 12, 60, frame, 0, 56, 0));
  // Zinnen oben
  for (const dz of [-22, 0, 22]) g.add(box(8, 8, 8, frame, 0, 66, dz));

  // Dunkles Tor, das bei Lebensverlust rot aufblitzt
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 42),
    new THREE.MeshBasicMaterial({ color: 0x0a0c14 })
  );
  door.position.set(-2, 21, 0);
  door.rotation.y = -Math.PI / 2;
  g.add(door);

  // Glüh-Rahmen in Karten-Farbe
  const edge = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 48),
    new THREE.MeshBasicMaterial({ color: map.portal, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  edge.position.set(-2.6, 22, 0);
  edge.rotation.y = -Math.PI / 2;
  g.add(edge);

  g.position.set(W + 10, 0, z);
  mapGroup.add(g);
  endGate = { group: g, door, baseColor: 0x0a0c14 };
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

  // Himmel (Shader-Dome), Nebel, Wasser/Lava
  skyDome.material.uniforms.bottomColor.value.set(map.sky);
  skyDome.material.uniforms.topColor.value.set(map.skyTop || map.sky);
  skyDome.material.uniforms.sunIntensity.value = mapKey === "space" ? 0.0 : 1.0;
  scene.fog.color.set(map.sky);
  water.material.color.set(map.water);
  water.material.emissive = new THREE.Color(map.waterGlow || 0x000000);
  updateWaterMode();
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

  // ⛰ Anhöhen (nur hier dürfen Scharfschützen stehen)
  hills = [];
  const hillTiles = new Set();
  for (const h of (map.hills || [])) {
    const cx = (h.c + h.w / 2) * TILE, cz = (h.r + h.h / 2) * TILE;
    const wpx = h.w * TILE, dpx = h.h * TILE;
    // Felsiger Sockel + farbige Deckplatte
    const body = box(wpx, HILL_H, dpx, lambert(map.earth), cx, HILL_H / 2 - 2, cz);
    body.receiveShadow = true;
    mapGroup.add(body);
    const topCol = shadeColor("#" + new THREE.Color(map.grass[0]).getHexString(), 0.07);
    const top = box(wpx, 5, dpx, lambert(topCol), cx, HILL_H + 0.5, cz);
    top.receiveShadow = true;
    mapGroup.add(top);
    // Kleine Felskanten an den Ecken
    for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      mapGroup.add(box(9, 7, 9, lambert(map.earth), cx + ex * (wpx / 2 - 6), HILL_H + 4, cz + ez * (dpx / 2 - 6)));
    }
    hills.push({
      minX: h.c * TILE, maxX: (h.c + h.w) * TILE,
      minZ: h.r * TILE, maxZ: (h.r + h.h) * TILE,
      y: HILL_H + 3,
    });
    for (let rr = h.r; rr < h.r + h.h; rr++) {
      for (let cc = h.c; cc < h.c + h.w; cc++) hillTiles.add(cc + "," + rr);
    }
  }

  // Roblox-Noppen (Studs) auf Boden- und Anhöhen-Kacheln
  {
    const studPositions = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (pathTiles.has(c + "," + r)) continue;
        const onHill = hillTiles.has(c + "," + r);
        const y = onHill ? HILL_H + 4.5 : 1.5;
        const baseHex = onHill ? map.grass[0] : ((c + r) % 2 === 0 ? map.grass[0] : map.grass[1]);
        const col = shadeColor("#" + new THREE.Color(baseHex).getHexString(), onHill ? 0.11 : 0.05);
        for (const ox of [12, 36]) {
          for (const oz of [12, 36]) {
            studPositions.push({ x: c * TILE + ox, y, z: r * TILE + oz, col });
          }
        }
      }
    }
    const studGeo = new THREE.BoxGeometry(7, 3, 7);
    const studs = new THREE.InstancedMesh(studGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), studPositions.length);
    const sm = new THREE.Matrix4();
    studPositions.forEach((s, i) => {
      sm.setPosition(s.x, s.y, s.z);
      studs.setMatrixAt(i, sm);
      studs.setColorAt(i, s.col);
    });
    studs.instanceColor.needsUpdate = true;
    studs.receiveShadow = true;
    studs.castShadow = false;
    mapGroup.add(studs);
  }

  // Zufalls-Deko nach Thema (nicht auf Weg oder Anhöhen)
  const rnd = seededRandom(1337);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = rnd();
      const off = rnd();
      if (pathTiles.has(c + "," + r)) continue;
      if (hillTiles.has(c + "," + r)) continue;
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
    const roof = pyramid(54, 40, lambert(0xdc2626), 0, 55, 0, 6);
    castle.add(roof);
    castle.add(box(26, 32, 6, lambert(0x5b3a1e), -40, 16, 0));
    const endRow = map.waypoints[map.waypoints.length - 1][1];
    castle.position.set(W + 62, 0, (endRow + 0.5) * TILE);
    mapGroup.add(castle);
  }

  // Spawn-Portal am Weganfang + Ziel-Tor am Wegende
  buildSpawnPortal(mapKey, map);
  buildEndGate(mapKey, map);
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
  const grass = box(660, 10, 500, lambert(0x5bbf4a), L.x, -10, L.z);
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
    t.add(box(30, 22, 30, lambert(0x46a83c), 0, 32, 0));
    t.add(box(20, 15, 20, lambert(0x5bbf4a), 0, 50, 0));
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

// Großer, furchteinflößender Boss aus Blöcken (mit animierbaren Gliedmaßen)
function makeBossFigure(bodyHex, headHex, opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Color(bodyHex);
  const dark = shadeColor(bodyHex, -0.18);
  const plate = shadeColor(bodyHex, -0.32);

  function limb(wd, ht, dp, color) {
    const geo = new THREE.BoxGeometry(wd, ht, dp);
    geo.translate(0, -ht / 2, 0);   // Drehpunkt oben
    const m = new THREE.Mesh(geo, lambert(color));
    m.castShadow = true;
    return m;
  }
  // Stämmige Beine
  const legL = limb(11, 20, 11, dark); legL.position.set(-8, 20, 0);
  const legR = limb(11, 20, 11, dark); legR.position.set(8, 20, 0);
  // Massiver Torso + Brustpanzer
  const torso = box(30, 26, 18, lambert(body), 0, 36, 0);
  g.add(box(34, 10, 20, lambert(plate), 0, 44, 0));        // Schulterpanzer
  g.add(box(22, 12, 3, lambert(plate), 0, 34, 9.5));       // Brustplatte
  // Dicke Arme mit Stacheln
  const armL = limb(9, 24, 10, dark); armL.position.set(-19, 46, 0);
  const armR = limb(9, 24, 10, dark); armR.position.set(19, 46, 0);
  g.add(box(5, 5, 5, lambert(plate), -22, 36, 0));
  g.add(box(5, 5, 5, lambert(plate), 22, 36, 0));
  // Schulter-Stacheln
  for (const sx of [-17, 17]) { const sp = pyramid(7, 12, lambert(plate), sx, 50, 0, 3); g.add(sp); }
  // Großer Kopf mit leuchtenden Augen + Hörnern
  const head = new THREE.Mesh(new THREE.BoxGeometry(20, 18, 18), lambert(new THREE.Color(headHex)));
  head.position.y = 60; head.castShadow = true;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  head.add(box(4, 4, 2, eyeMat, -5, 1, 9));
  head.add(box(4, 4, 2, eyeMat, 5, 1, 9));
  head.add(box(9, 2.5, 2, new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, -5, 9)); // Mund
  // Hörner
  const horns = pyramid(5, 10, lambert(plate), -8, 69, 0, 3); g.add(horns);
  const horns2 = pyramid(5, 10, lambert(plate), 8, 69, 0, 3); g.add(horns2);

  g.add(legL, legR, torso, armL, armR, head);

  if (opts.crown) {
    const gold = lambert(0xfacc15);
    g.add(box(22, 4, 22, gold, 0, 70, 0));
    for (const dx of [-7, 0, 7]) g.add(box(4, 7, 4, gold, dx, 75, 0));
  }
  g.userData = { legL, legR, armL, armR, head, torso };
  return g;
}

/* ---------------- Lebensbalken (Billboard aus 2 Flächen) ---------------- */

const billboards = [];
function fmtHP(n) {
  n = Math.max(0, Math.ceil(n));
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return "" + n;
}

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

  // HP-Zahl als Canvas-Textur über dem Balken (immer sichtbar)
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 36;
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  const numMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 14, (width + 14) * 36 / 128),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false })
  );
  numMesh.position.y = 7;
  numMesh.renderOrder = 999;
  g.add(bg, fill, numMesh);

  g.userData = { fill, width, numCanvas: cv, numCtx: cv.getContext("2d"), numTex: tex, lastHp: -1 };
  billboards.push(g);
  return g;
}

function setHealthBar(bar, hp, maxHp) {
  const u = bar.userData;
  const frac = Math.max(0, Math.min(1, hp / maxHp));
  u.fill.scale.x = Math.max(frac, 0.001);
  u.fill.position.x = -u.width * (1 - frac) / 2;
  const col = frac > 0.5 ? 0x4ade80 : frac > 0.25 ? 0xfacc15 : 0xef4444;
  u.fill.material.color.set(col);

  // HP-Zahl nur neu zeichnen, wenn sie sich geändert hat
  const shown = Math.ceil(hp);
  if (shown !== u.lastHp) {
    u.lastHp = shown;
    const g = u.numCtx;
    g.clearRect(0, 0, 128, 36);
    g.font = "bold 26px Arial";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 5;
    g.strokeStyle = "rgba(0,0,0,0.9)";
    g.strokeText(fmtHP(hp), 64, 19);
    g.fillStyle = "#ffffff";
    g.fillText(fmtHP(hp), 64, 19);
    u.numTex.needsUpdate = true;
  }
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

/* ---------------- Tracer-Pool (leuchtende Block-Schussstrahlen) ---------------- */

const TRACER_POOL = 48;
const tracerPool = [];
const _tracerGeo = new THREE.BoxGeometry(1, 1, 1);
{
  for (let i = 0; i < TRACER_POOL; i++) {
    const line = new THREE.Mesh(_tracerGeo, new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, depthWrite: false }));
    line.visible = false;
    line.castShadow = false;
    world.add(line);
    tracerPool.push(line);
  }
}

const _tFrom = new THREE.Vector3(), _tTo = new THREE.Vector3();
function spawnTracer(from, to, colorHex, thick) {
  const line = tracerPool.find(l => !l.visible);
  if (!line) return;
  _tFrom.set(from.x, from.y, from.z);
  _tTo.set(to.x, to.y, to.z);
  const len = _tFrom.distanceTo(_tTo) || 1;
  line.visible = true;
  line.material.color.set(colorHex);
  line.material.opacity = 0.95;
  line.position.copy(_tFrom).lerp(_tTo, 0.5);   // Mitte zwischen Start und Ziel
  line.scale.set(thick || 2.4, thick || 2.4, len);
  line.lookAt(_tTo);                              // +Z zum Ziel
  state.tracers.push({ line, life: 0.08, maxLife: 0.08 });
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

// Platzierungs-Marker: Kreis unter der Geister-Figur am Cursor
const tileMarker = new THREE.Mesh(
  new THREE.CircleGeometry(TOWER_RADIUS + 4, 28),
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

// Fadenkreuz am Boden, wenn die Minigun bedient wird
const nestAimMarker = new THREE.Group();
{
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(9, 12, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  nestAimMarker.add(ring);
  for (let i = 0; i < 4; i++) {
    const tick = box(3, 1, 9, new THREE.MeshBasicMaterial({ color: 0xff4444 }), 0, 0, 16);
    tick.rotation.y = i * Math.PI / 2;
    nestAimMarker.add(tick);
  }
  nestAimMarker.position.y = 1.5;
  nestAimMarker.visible = false;
  world.add(nestAimMarker);
}

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
  } else if (def.kind === "nest") {
    g = new THREE.Group();
    g.add(box(46, 8, 46, lambert(0x4b5563), 0, 5, 0));     // Fußplatte
    g.add(box(40, 52, 40, lambert(0x2c440d), 0, 31, 0));   // hoher Bunker
    g.add(box(50, 6, 50, lambert(0x4b5563), 0, 58, 0));    // Deck
    g.add(box(14, 14, 16, lambert(0x4b5563), 0, 87, 4));   // Geschütz
    g.add(box(4, 4, 30, lambert(0x1f2937), 0, 87, 22));    // Lauf
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

// Magier-Figur (Robe + Spitzhut) für Eismagier & Tesla
function makeMageFigure(robeHex, headHex, level) {
  const g = new THREE.Group();
  const robe = new THREE.Color(robeHex);
  // Robe aus gestapelten Blöcken (breiter unten)
  g.add(box(16, 8, 16, lambert(robe), 0, 4, 0));
  g.add(box(13, 8, 13, lambert(robe), 0, 12, 0));
  g.add(box(15, 12, 9, lambert(robe), 0, 24, 0));                       // Oberkörper
  g.add(box(5, 13, 6, lambert(shadeColor(robeHex, -0.08)), -10, 25, 0)); // Arme
  g.add(box(5, 13, 6, lambert(shadeColor(robeHex, -0.08)), 10, 25, 0));
  // Kopf
  const head = new THREE.Mesh(new THREE.BoxGeometry(11, 11, 11), lambert(new THREE.Color(headHex)));
  head.position.y = 37; head.castShadow = true; g.add(head);
  // Spitzhut aus Block-Stufen – höher mit Level
  g.add(pyramid(13, 14 + level * 3, lambert(shadeColor(robeHex, -0.2)), 0, 43, 0, 4 + level));
  if (level >= 3) { // goldener Hutrand (Blockring)
    g.add(box(15, 2.5, 15, lambert(0xfacc15), 0, 43, 0));
  }
  if (level >= 4) { // Sterne auf der Robe
    g.add(box(2.5, 2.5, 1, lambert(0xfacc15), 0, 24, 4.6));
  }
  // (Magier-Figuren werden nicht animiert; Referenzen nur als Platzhalter)
  g.userData = { head, torso: g.children[2], legL: g.children[0], legR: g.children[0], armL: g.children[3], armR: g.children[4] };
  return g;
}

// Rang-Ausrüstung für Soldaten-Türme: höheres Level = mehr Ausrüstung
function applyRank(fig, level, accentHex) {
  const accent = new THREE.Color(accentHex);
  if (level >= 1) { // Helm
    fig.add(box(13, 4, 13, lambert(accent), 0, 43, 0));
    fig.add(box(9, 4, 9, lambert(accent), 0, 46, 0));
  }
  if (level >= 2) { // Schulterpanzer
    fig.add(box(6, 4, 11, lambert(accent), -10, 31, 0));
    fig.add(box(6, 4, 11, lambert(accent), 10, 31, 0));
  }
  if (level >= 3) { // Brustpanzer
    fig.add(box(17, 9, 3, lambert(shadeColor(accentHex, 0.05)), 0, 24, 5.2));
  }
  if (level >= 4) { // goldene Verzierung + Rückentank/Cape
    fig.add(box(15, 3, 3, lambert(0xfacc15), 0, 30, 5.4));
    const cape = box(14, 18, 2, lambert(0xb45309), 0, 24, -6);
    fig.add(cape);
  }
}

function makeTowerMesh(typeKey, level) {
  const def = TOWER_TYPES[typeKey];
  const group = new THREE.Group();
  const staticG = new THREE.Group();
  const rotG = new THREE.Group();
  group.add(staticG, rotG);

  const plate = box(40, 6, 40, lambert(0x9ca3af), 0, 3, 0);
  plate.receiveShadow = true;
  staticG.add(plate);
  // abgesetzter Rand für Detail
  staticG.add(box(34, 3, 34, lambert(0xb6bcc6), 0, 7, 0));

  const studs = new THREE.Group();
  staticG.add(studs);
  group.userData.studs = studs;

  let muzzle = null, flash = null, figure = null, cropTips = [];

  if (def.kind === "nest") {
    // Großes, schweres, HOHES Militär-Nest auf erhöhtem Bunker-Sockel
    plate.scale.set(2.0, 1, 2.0);
    const olive = lambert(0x3f6212), oliveDark = lambert(0x2c440d), steel = lambert(0x4b5563), darkSteel = lambert(0x374151);
    const BH = 52;   // Höhe des Bunker-Sockels – hier sitzt die Plattform

    // Bunker-Turm (massiver, hoher Sockel mit Streben)
    staticG.add(box(40, BH, 40, oliveDark, 0, BH / 2, 0));
    staticG.add(box(46, 8, 46, steel, 0, 6, 0));            // breite Fußplatte
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {   // Eckstreben
      const leg = box(7, BH, 7, darkSteel, sx * 19, BH / 2, sz * 19);
      staticG.add(leg);
    }
    // Leiter an der Rückseite
    for (let i = 0; i < 6; i++) staticG.add(box(12, 2, 2, darkSteel, 0, 8 + i * 8, -21));
    // Plattform-Deck oben
    staticG.add(box(50, 6, 50, steel, 0, BH + 3, 0));

    // Sandsäcke / Panzerwall auf dem Deck
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sb = box(13, 9, 9, i % 2 ? oliveDark : olive, Math.cos(a) * 26, BH + 11, Math.sin(a) * 26);
      sb.rotation.y = a;
      staticG.add(sb);
    }
    // Gepanzerte Frontschilde auf dem Deck
    staticG.add(box(40, 22, 6, steel, 0, BH + 22, 24));
    staticG.add(box(6, 22, 40, steel, 24, BH + 22, 0));
    staticG.add(box(6, 22, 40, steel, -24, BH + 22, 0));

    // Schütze (geschützt hinter Deckung) – wird beim Bedienen sichtbar
    const gunner = makeMinifig(0x3f6212, "#caa472", { hat: "#2c440d" });
    gunner.position.set(0, BH + 13, -8);
    gunner.scale.setScalar(0.85);
    gunner.visible = false;
    rotG.add(gunner);
    group.userData.gunner = gunner;

    // Dreh-Lafette + riesige Minigun (oben auf dem Deck)
    const mount = box(20, 14, 20, oliveDark, 0, BH + 29, 0);
    rotG.add(mount);
    const gun = new THREE.Group();
    gun.position.set(0, BH + 35, 4);
    rotG.add(gun);
    gun.add(box(13, 13, 16, steel, 0, 0, 2));            // Gehäuse
    // 6 rotierende Läufe
    const barrels = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = box(3, 3, 34, lambert(0x1f2937), Math.cos(a) * 4.5, Math.sin(a) * 4.5, 22);
      barrels.add(b);
    }
    gun.add(barrels);
    group.userData.spinBarrels = barrels;
    group.userData.gunPivot = gun;
    // Mündung + Feuer
    muzzle = new THREE.Object3D();
    muzzle.position.set(0, BH + 35, 44);
    rotG.add(muzzle);
    flash = box(8, 8, 14, new THREE.MeshBasicMaterial({ color: 0xfde047 }), 0, 0, 0);
    flash.castShadow = false;
    flash.visible = false;
    muzzle.add(flash);
    group.userData.rotG = rotG;
    group.userData.muzzle = muzzle;
    group.userData.flash = flash;
    group.userData.figure = null;
    group.userData.crops = [];
    return group;
  } else if (def.kind === "farm") {
    const soil = box(38, 8, 32, lambert(0x854d0e), 0, 8, 0);
    rotG.add(soil);
    for (let i = 0; i < 4; i++) {
      const stem = box(2.5, 12, 2.5, lambert(0x8fe04a), -13 + i * 8.6, 18, (i % 2 === 0 ? -5 : 5));
      const tip = box(6, 6, 6, lambert(0xfde047), 0, 8, 0);
      stem.add(tip);
      rotG.add(stem);
      cropTips.push(stem);
    }
  } else {
    // ---- Eigenständiges Aussehen je nach Turmtyp + Level ----
    const accent = "#" + shadeColor(def.color, -0.28).getHexString();

    if (typeKey === "sniper") {
      // Scharfschütze: LIEGT auf dem Bauch (Bauchschuss-Pose) mit Gewehr + Zweibein
      figure = new THREE.Group();
      const skin = "#caa472";
      const body = lambert(new THREE.Color(def.color));
      // flacher Körper, der Länge nach (+Z)
      figure.add(box(11, 7, 20, body, 0, 6, 2));                 // Rumpf liegend
      figure.add(box(11, 5, 4, lambert(new THREE.Color(skin)), 0, 7, 13)); // Kopf vorn
      figure.add(box(4, 4, 12, lambert(shadeColor(def.color, -0.1)), -6, 5, -6)); // Beine
      figure.add(box(4, 4, 12, lambert(shadeColor(def.color, -0.1)), 6, 5, -6));
      // Mütze/Helm nach Level
      if (level >= 1) figure.add(box(12, 3, 5, lambert(new THREE.Color(accent)), 0, 10, 12));
      if (level >= 3) { // Tarnnetz/Aufsatz
        figure.add(box(13, 2, 22, lambert(0x3f5d34), 0, 10, 0));
      }
      figure.position.y = 1;
      rotG.add(figure);

      const gun = new THREE.Group();
      const gunMat = lambert(0x1f2937);
      const barrelLen = 30 + level * 4;
      gun.add(box(3.5, 3.5, barrelLen, gunMat, 0, 0, barrelLen / 2));      // langer Lauf
      gun.add(box(6, 6, 9, lambert(0x111827), 0, 0, 2));                   // Verschluss
      if (level >= 2) { const scope = box(3, 3, 7, lambert(0x0ea5e9), 0, 4, 4); gun.add(scope); } // Zielfernrohr
      // Zweibein
      gun.add(box(1.5, 7, 1.5, gunMat, -4, -3, barrelLen * 0.7));
      gun.add(box(1.5, 7, 1.5, gunMat, 4, -3, barrelLen * 0.7));
      if (level >= 4) gun.add(box(5, 5, 5, lambert(0xfacc15), 0, 0, 2));   // goldener Verschluss
      gun.position.set(0, 11, 8);
      rotG.add(gun);
      muzzle = new THREE.Object3D(); muzzle.position.set(0, 11, 10 + barrelLen);
      rotG.add(muzzle);

    } else if (typeKey === "laser") {
      // Laserturm: Techniker mit großem Emitter-Kristall, der sich auflädt
      figure = makeMinifig(def.color, "#caa472", {});
      figure.position.y = 6; applyRank(figure, level, "#0e7490"); rotG.add(figure);
      const gun = new THREE.Group();
      gun.add(box(7, 7, 16, lambert(0x164e63), 0, 0, 6));      // Emitter-Gehäuse
      gun.add(box(9, 9, 5, lambert(0x0e7490), 0, 0, -2));
      // Lade-Kristall (waechst beim Aufladen)
      const orb = gem(7 + level, new THREE.MeshLambertMaterial({ color: 0x67e8f9, emissive: 0x06b6d4, emissiveIntensity: 0.6 }), 0, 0, 15);
      gun.add(orb);
      group.userData.chargeOrb = orb;
      // Fokus-Stäbe
      gun.add(box(1.5, 1.5, 10, lambert(0x22d3ee), -4, 0, 18));
      gun.add(box(1.5, 1.5, 10, lambert(0x22d3ee), 4, 0, 18));
      gun.position.set(6, 28, 6); rotG.add(gun);
      muzzle = new THREE.Object3D(); muzzle.position.set(6, 28, 30); rotG.add(muzzle);

    } else if (typeKey === "frost") {
      // Eismagier: Robe + Spitzhut + Stab (kein Soldat)
      figure = makeMageFigure(def.color, "#bae6fd", level);
      figure.position.y = 6; rotG.add(figure);
      const gun = new THREE.Group();
      gun.add(box(2.5, 2.5, 24, lambert(0x60564b), 0, 0, 10));   // Stab
      const orb = gem(8 + level * 1.4, new THREE.MeshLambertMaterial({ color: 0xaee9ff, emissive: 0x38bdf8, emissiveIntensity: 0.5 }), 0, 0, 22); gun.add(orb);
      group.userData.frostOrb = orb;
      gun.position.set(7, 26, 4); rotG.add(gun);
      muzzle = new THREE.Object3D(); muzzle.position.set(7, 26, 28); rotG.add(muzzle);

    } else if (typeKey === "tesla") {
      // Tesla: Wissenschaftler mit Spulen-Antenne
      figure = makeMageFigure(def.color, "#ddd6fe", level);
      figure.position.y = 6; rotG.add(figure);
      const gun = new THREE.Group();
      gun.add(box(2.5, 2.5, 20, lambert(0x4c1d95), 0, 0, 8));
      const orb = gem(9 + level, new THREE.MeshLambertMaterial({ color: 0xddd6fe, emissive: 0x8b5cf6, emissiveIntensity: 0.7 }), 0, 0, 20); gun.add(orb);
      group.userData.teslaOrb = orb;
      gun.position.set(6, 26, 4); rotG.add(gun);
      // Tesla-Spule auf dem Kopf (wächst mit Level)
      const rod = box(1.5, 10 + level * 2, 1.5, lambert(0x4c1d95), 0, 48, 0);
      const ts = 5 + level * 0.8;
      const tip = box(ts, ts, ts, new THREE.MeshBasicMaterial({ color: 0xc4b5fd }), 0, 54 + level * 2, 0);
      rotG.add(rod, tip);
      muzzle = new THREE.Object3D(); muzzle.position.set(6, 26, 26); rotG.add(muzzle);

    } else {
      // Soldaten-Türme: Schütze, Flammenwerfer, Raketenwerfer, Minigunner
      const bulky = (typeKey === "flame" || typeKey === "minigun");
      figure = makeMinifig(def.color, typeKey === "flame" ? "#3a3a3a" : "#caa472", {});
      if (bulky) figure.scale.set(1.15, 1, 1.15);
      figure.position.y = 6;
      applyRank(figure, level, accent);     // Helm/Panzerung/Gold je nach Level
      rotG.add(figure);

      const gun = new THREE.Group();
      const gunMat = lambert(0x374151);
      if (typeKey === "minigun") {
        // Gatling-Läufe aus mehreren kleinen Blöcken (drehen sich)
        const barrels = new THREE.Group();
        const bl = 18 + level * 2, br = 4 + level * 0.4;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          barrels.add(box(2.5, 2.5, bl, lambert(0x2b3240), Math.cos(a) * br, Math.sin(a) * br, bl / 2 + 1));
        }
        barrels.castShadow = true;
        gun.add(barrels);
        gun.add(box(9, 9, 8, gunMat, 0, 0, 1));
        group.userData.spinBarrels = barrels;
      } else if (typeKey === "rocket") {
        // Werfer auf der Schulter
        gun.add(box(8 + level, 8 + level, 24 + level * 2, lambert(0x7f1d1d), 0, 4, 8));
        gun.add(box(9.5, 9.5, 4, lambert(0x450a0a), 0, 4, 20));
        if (level >= 3) gun.add(box(10, 3, 8, lambert(0xfacc15), 0, 9, 6)); // Visier
      } else if (typeKey === "flame") {
        gun.add(box(6, 6, 14, lambert(0xb91c1c), 0, 0, 6));
        gun.add(box(8.5, 8.5, 4, lambert(0x7f1d1d), 0, 0, 13));
        const pilot = box(4, 4, 4, new THREE.MeshBasicMaterial({ color: 0xfb923c }), 0, 0, 16);
        pilot.castShadow = false; gun.add(pilot);
        group.userData.pilotFlame = pilot;
        const tank = box(8, 14 + level, 8, lambert(0xdc2626), -6, 26, -8); tank.castShadow = true; rotG.add(tank);
      } else {
        // Schütze: Gewehr wird mit Level größer
        gun.add(box(3.5, 3.5, 16 + level * 2, gunMat, 0, 0, 8));
        if (level >= 2) gun.add(box(5, 5, 6, lambert(0x1f2937), 0, 1, 2));
        if (level >= 4) gun.add(box(4, 4, 5, lambert(0xfacc15), 0, 0, 14)); // goldene Mündung
      }
      gun.position.set(6, 28, 6); rotG.add(gun);
      muzzle = new THREE.Object3D(); muzzle.position.set(6, 28, 28); rotG.add(muzzle);
    }

    flash = new THREE.Mesh(new THREE.SphereGeometry(4.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
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

function spawnEnemy(typeKey, hpMultOverride) {
  const def = ENEMY_TYPES[typeKey];
  const mult = hpMultOverride != null ? hpMultOverride : hpScale(state.wave);
  const hp = Math.round(def.hp * mult);
  const isBoss = typeKey === "boss" || !!def.ability;

  const fig = isBoss
    ? makeBossFigure(def.color, def.headColor, { crown: true })
    : makeMinifig(def.color, def.headColor, { angry: typeKey !== "healer", crown: false });
  fig.scale.setScalar(def.scale);

  if (def.heals) {
    const red = lambert(0xdc2626);
    fig.add(box(3, 9, 1.5, red, 0, 22, 5));
    fig.add(box(9, 3, 1.5, red, 0, 22, 5));
  }
  // Metall-Zombie: glänzende Nieten/Platten
  if (def.metal) {
    const steel = lambert(0x64748b);
    fig.add(box(18, 4, 11, steel, 0, 24, 0));
    fig.add(box(4, 4, 4, lambert(0xe2e8f0), -6, 30, 5));
    fig.add(box(4, 4, 4, lambert(0xe2e8f0), 6, 30, 5));
  }
  // Geist: fast durchsichtig (nur Sniper/Laser treffen ihn)
  if (def.invisible) {
    fig.traverse((o) => {
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.transparent = true; m.opacity = 0.32; }
      }
      o.castShadow = false;
    });
  }
  // Flieger: Flügel + schwebt höher
  if (def.flying) {
    const wing = lambert(0xfbcfe8);
    fig.add(box(14, 1.5, 7, wing, -14, 28, -2));
    fig.add(box(14, 1.5, 7, wing, 14, 28, -2));
  }

  const bar = makeHealthBar((isBoss ? 42 : 30) * def.scale);
  bar.position.y = (isBoss ? 84 : 54) * def.scale;
  bar.visible = true; // HP-Balken + Zahl immer sichtbar
  setHealthBar(bar, hp, hp);

  const g = new THREE.Group();
  g.add(fig, bar);
  g.position.set(PATH[0].x, 0, PATH[0].z);
  world.add(g);

  // Spawn-Effekt: Gegner tritt "aus dem Dunkel" – kurzer Partikel-Puff in Karten-Farbe
  const pColor = MAPS[state.map].portal;
  burst(PATH[0].x, 18 * def.scale, PATH[0].z, "#" + new THREE.Color(pColor).getHexString(), isBoss ? 18 : 8, isBoss ? 90 : 55, false);

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
    // Boss-Fähigkeiten
    isBoss,
    ability: def.ability || null,
    abilityTimer: def.abilityEvery || 0,
    raged: false,
  });
}

// Eine Boss-Fähigkeit auslösen
function triggerBossAbility(e, dt) {
  if (!e.ability) return;

  if (e.ability === "summon") {
    e.abilityTimer -= dt;
    if (e.abilityTimer <= 0) {
      e.abilityTimer = e.def.abilityEvery;
      const count = e.type === "boss_titan" ? 4 : 2;
      for (let i = 0; i < count; i++) {
        // Kleinen Zombie direkt hinter dem Boss auf dem Weg einschleusen
        spawnMinionAt(e);
      }
      burst(e.x, 30 * e.def.scale, e.z, "#4ade80", 14, 110, false);
      sfx("heal");
      addText(e.x, 60 * e.def.scale, e.z, "Beschwörung!", "#4ade80");
    }
  } else if (e.ability === "blind") {
    e.abilityTimer -= dt;
    if (e.abilityTimer <= 0) {
      e.abilityTimer = e.def.abilityEvery;
      state.blindUntil = state.time + 5; // Türme 5s blind
      state.shake = Math.max(state.shake, 0.25);
      burst(e.x, 30 * e.def.scale, e.z, "#4c1d95", 20, 130, false);
      sfx("zap");
      centerText("🌑 Türme geblendet!", "#a855f7");
    }
  } else if (e.ability === "rage") {
    if (!e.raged && e.hp <= e.maxHp * 0.5) {
      e.raged = true;
      e.def = Object.assign({}, e.def, { speed: e.def.speed * 1.8 });
      burst(e.x, 30 * e.def.scale, e.z, "#ef4444", 24, 150, false);
      sfx("bosshorn");
      addText(e.x, 60 * e.def.scale, e.z, "WUTAUSBRUCH!", "#ef4444");
    }
  }
}

// Beschwört einen schwachen Diener am Spawn-Portal
function spawnMinionAt(boss) {
  const def = ENEMY_TYPES.fast;
  const hp = Math.round(def.hp * MAPS[state.map].hpMult * 1.5);
  const fig = makeMinifig(def.color, def.headColor, { angry: true });
  fig.scale.setScalar(def.scale);
  const bar = makeHealthBar(30 * def.scale);
  bar.position.y = 54 * def.scale;
  bar.visible = true;
  setHealthBar(bar, hp, hp);
  const g = new THREE.Group();
  g.add(fig, bar);
  g.position.set(PATH[0].x, 0, PATH[0].z);
  world.add(g);
  burst(PATH[0].x, 16, PATH[0].z, "#4ade80", 6, 50, false);
  state.enemies.push({
    type: "fast", def, hp, maxHp: hp,
    x: PATH[0].x, z: PATH[0].z, seg: 0, dist: 0,
    slowUntil: 0, slowFactor: 1, burnUntil: 0, burnDps: 0,
    flash: 0, flashTinted: false, dmgAccum: 0, dmgTimer: 0, healTimer: 1,
    walkPhase: Math.random() * Math.PI * 2, yaw: Math.PI / 2,
    dead: false, killed: false, group: g, figure: fig, bar, tinted: false,
    isBoss: false, ability: null, abilityTimer: 0, raged: false,
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
    state.gateFlash = 0.5; // Ziel-Tor blitzt rot
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
  else setHealthBar(e.bar, e.hp, e.maxHp);
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

/* Freie Platzierung: Truppen kleben durchsichtig am Cursor und können
   überall aufs Feld gesetzt werden. Boden-Truppen NICHT auf Anhöhen,
   ⛰-Truppen (Scharfschütze) NUR auf Anhöhen. */

// Überlappt ein Kreis um (x,z) eine Weg-Kachel?
function circleTouchesPath(x, z, radius) {
  const cMin = Math.floor((x - radius) / TILE), cMax = Math.floor((x + radius) / TILE);
  const rMin = Math.floor((z - radius) / TILE), rMax = Math.floor((z + radius) / TILE);
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      if (!pathTiles.has(c + "," + r)) continue;
      // nächster Punkt der Kachel zum Kreis-Mittelpunkt
      const nx = Math.max(c * TILE, Math.min(x, (c + 1) * TILE));
      const nz = Math.max(r * TILE, Math.min(z, (r + 1) * TILE));
      if (Math.hypot(x - nx, z - nz) < radius) return true;
    }
  }
  return false;
}

// Prüft, ob Turmtyp an Punkt (x,z) stehen darf. Liefert {ok, reason, y}
function canPlaceTowerAt(typeKey, x, z) {
  const def = TOWER_TYPES[typeKey];
  // Nur ein Exemplar gleichzeitig (Minigun Nest)
  if (def.unique && state.towers.some(t => t.type === typeKey)) {
    return { ok: false, reason: "Nur 1× erlaubt!", y: 0 };
  }
  const radius = def.kind === "nest" ? 30 : TOWER_RADIUS;  // Nest braucht mehr Platz
  if (x < radius || x > W - radius || z < radius || z > D - radius) {
    return { ok: false, reason: "Außerhalb des Felds!", y: 0 };
  }
  const hill = hillAt(x, z);
  if (def.cliff && !hill) return { ok: false, reason: "Nur auf ⛰ Anhöhen!", y: 0 };
  if (!def.cliff && hill) return { ok: false, reason: "Nicht auf Anhöhen!", y: hill.y };
  if (!hill && circleTouchesPath(x, z, radius)) {
    return { ok: false, reason: "Zu nah am Weg!", y: 0 };
  }
  const minDist = def.kind === "nest" ? 48 : TOWER_MIN_DIST;
  for (const t of state.towers) {
    if (Math.hypot(t.x - x, t.z - z) < minDist) {
      return { ok: false, reason: "Zu nah an anderem Turm!", y: hill ? hill.y : 0 };
    }
  }
  return { ok: true, reason: "", y: hill ? hill.y : 0 };
}

function placeTower(typeKey, x, z) {
  const def = TOWER_TYPES[typeKey];
  if (state.cash < def.cost) return false;
  const check = canPlaceTowerAt(typeKey, x, z);
  if (!check.ok) return false;
  state.cash -= def.cost;

  const group = makeTowerMesh(typeKey, 0);
  group.position.set(x, check.y, z);
  world.add(group);

  const tower = {
    type: typeKey,
    x, z,
    baseY: check.y,
    level: 0,
    cooldown: 0,
    yaw: 0,
    targetMode: 0,
    invested: def.cost,
    flash: 0,
    group,
    hiddenDeco: [],
    // Minigun-Nest-Zustand
    operated: false,    // bedient ein Spieler den Turm?
    spin: 0,            // 0..1 Hochlauf der Läufe
    heat: 0,            // 0..100 Überhitzung
    overheatUntil: 0,   // Zwangspause bis zu dieser Zeit
    fireAcc: 0,         // Akkumulator für die Feuerrate
  };
  state.towers.push(tower);

  // Deko in der Nähe ausblenden, damit nichts durch den Turm ragt
  for (const [key, deco] of decoByTile) {
    if (!deco.visible) continue;
    if (Math.hypot(deco.position.x - x, deco.position.z - z) < 34) {
      deco.visible = false;
      tower.hiddenDeco.push(key);
    }
  }

  sfx("place");
  burst(x, check.y + 10, z, "#ffd24a", 10, 70, false);
  refreshShopSelection();  // ggf. unique-Turm im Shop ausgrauen
  updateHUD();
  return true;
}

function removeTower(tower) {
  state.towers = state.towers.filter(t => t !== tower);
  world.remove(tower.group);
  disposeObject(tower.group);
  for (const key of tower.hiddenDeco) {
    const deco = decoByTile.get(key);
    if (deco) deco.visible = true;
  }
}

const TARGET_MODES = ["Erster", "Letzter", "Stärkster"];

// Kann dieser Turmtyp diesen Gegner überhaupt treffen? (Spezial-Schwächen)
function towerCanHit(type, level, e) {
  const d = e.def;
  if (d.invisible && !(type === "sniper" || type === "laser")) return false;       // Geister
  if (d.flying && !((type === "sniper" && level >= 2) || type === "laser")) return false; // Flieger
  if (d.metal && !(type === "rocket" || type === "laser")) return false;           // Metall
  return true;
}

function pickTarget(tower) {
  const st = towerStats(tower);
  let best = null, bestVal = -Infinity;
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (!towerCanHit(tower.type, tower.level, e)) continue;
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
  if (def.kind === "nest") { updateNest(tower, dt); return; } // eigene manuelle Logik

  tower.cooldown -= dt;
  if (tower.flash > 0) tower.flash -= dt;

  // Geblendet durch Schattenfürst-Boss: Türme können nicht zielen/schießen
  if (state.time < state.blindUntil) {
    tower.yaw += dt * 0.4;
    return;
  }

  const target = pickTarget(tower);
  if (!target) {
    tower.yaw += dt * 0.4;
    return;
  }

  const desired = Math.atan2(target.x - tower.x, target.z - tower.z);
  tower.yaw = approachAngle(tower.yaw, desired, dt * 12);

  // Laserturm: erst aufladen, dann starker Strahl
  if (def.kind === "laser") {
    const lst = towerStats(tower);
    const orb = tower.group.userData.chargeOrb;
    if (tower.cooldown > 0) { tower.charge = 0; if (orb) orb.scale.setScalar(1); return; }
    tower.charge = (tower.charge || 0) + dt / lst.charge;
    if (orb) orb.scale.setScalar(1 + Math.min(1, tower.charge) * 1.4);  // Kristall wächst
    if (tower.charge < 1) return;
    tower.charge = 0;
    tower.cooldown = 1 / lst.rate;
    tower.flash = 0.14;
    tower.group.userData.rotG.rotation.y = tower.yaw;
    tower.group.updateMatrixWorld(true);
    tower.group.userData.muzzle.getWorldPosition(_muzzlePos);
    const tp = { x: target.x, y: 24 * target.def.scale, z: target.z };
    damageEnemy(target, lst.dmg);
    spawnTracer(_muzzlePos, tp, 0x67e8f9, 7);
    spawnTracer(_muzzlePos, tp, 0xffffff, 2.5);   // heller Kern
    burst(target.x, 24 * target.def.scale, target.z, "#a5f3fc", 10, 90, false);
    // Durchschlag (Stufe 5): weitere treffbare Gegner in der Nähe
    if (lst.pierce) {
      let hit = 0;
      for (const e of state.enemies) {
        if (e.dead || e === target || hit >= lst.pierce) continue;
        if (!towerCanHit("laser", tower.level, e)) continue;
        if (Math.hypot(e.x - target.x, e.z - target.z) < 60) { damageEnemy(e, lst.dmg * 0.6); hit++; }
      }
    }
    sfx("zap");
    return;
  }

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
      spawnTracer(_muzzlePos, targetPos, 0x9be8ff, 3.2);
      sfx("frost");
      burst(target.x, 24, target.z, "#aee9ff", 5, 50, false);
    } else {
      // Sniper: dicker, heller Strahl; Minigun: dünn & schnell; Schütze: mittel
      const thick = tower.type === "sniper" ? 4.5 : tower.type === "minigun" ? 1.8 : 2.6;
      const col = tower.type === "sniper" ? 0xfff6c0 : 0xfde047;
      spawnTracer(_muzzlePos, targetPos, col, thick);
      burst(target.x, 24 * target.def.scale, target.z, "#fff1a8", tower.type === "sniper" ? 6 : 3, 60, false);
      sfx(tower.type === "sniper" ? "sniper" : tower.type === "minigun" ? "minigun" : "shoot");
    }
  } else if (def.kind === "flame") {
    const inRange = state.enemies
      .filter(e => !e.dead && towerCanHit("flame", tower.level, e) && Math.hypot(e.x - tower.x, e.z - tower.z) <= st.range)
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
        if (e.dead || hitSet.has(e) || !towerCanHit("tesla", tower.level, e)) continue;
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
    const nose = pyramid(5, 6, lambert(0xfca5a5), 0, 0, 9, 2);
    nose.rotation.x = Math.PI / 2;   // Block-Spitze nach vorn
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
    sfx("rocketlaunch");
  }
}

/* =====================================================================
   MINIGUN NEST – manuelle Steuerung durch den Spieler
   ===================================================================== */

state.nest = null;          // aktuell bedienter Nest-Turm (oder null)
state.nestBullets = [];     // frei fliegende Kugeln der Minigun
state.nestAim = new THREE.Vector3(); // Zielpunkt am Boden

function nestStats(t) { return TOWER_TYPES.nest.levels[t.level]; }

function enterNest(tower) {
  if (state.nest) return;
  state.nest = tower;
  tower.operated = true;
  if (tower.group.userData.gunner) tower.group.userData.gunner.visible = true;
  controls.enabled = false;          // Ego-Perspektive: Maus zielt frei
  state.placing = null;
  selectTower(null);                 // Panel ausblenden, freie Sicht
  // Blickrichtung: zur Feldmitte ausrichten
  tower.aimYaw = Math.atan2(W / 2 - tower.x, D / 2 - tower.z);
  tower.aimPitch = 0.28;             // flacher Blick übers Feld
  document.getElementById("nest-hud").classList.remove("hidden");
  centerText("🪖 Minigun-Sicht! Maus bewegen = zielen, Halten = feuern, E = aussteigen", "#facc15");
  sfx("place");
}

function exitNest() {
  const t = state.nest;
  if (!t) return;
  t.operated = false;
  t.firing = false;
  if (t.group.userData.gunner) t.group.userData.gunner.visible = false;
  if (t.group.userData.gunPivot) t.group.userData.gunPivot.rotation.x = 0;
  state.nest = null;
  controls.enabled = (state.mode === "game");
  document.getElementById("nest-hud").classList.add("hidden");
  // Kamera zurück in die Bau-Ansicht
  if (state.mode === "game") {
    camera.position.copy(CAM_HOME.pos);
    controls.target.copy(CAM_HOME.target);
    controls.update();
  }
}

// Ego-Perspektive: Kamera ins Geschütz, Zielpunkt aus dem Fadenkreuz (Bildmitte)
const _nv = new THREE.Vector3(), _ndir = new THREE.Vector3();
function updateNestView() {
  const t = state.nest;
  if (!t) return;
  const yaw = t.aimYaw, pitch = t.aimPitch;
  _ndir.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  // Geschütz-Weltposition
  t.group.userData.muzzle.getWorldPosition(_nv);
  // Kamera hinter/über dem Lauf, damit man übers Feld blickt
  camera.position.set(_nv.x - _ndir.x * 18, _nv.y + 16, _nv.z - _ndir.z * 18);
  camera.lookAt(_nv.x + _ndir.x * 200, _nv.y + _ndir.y * 200, _nv.z + _ndir.z * 200);
  // Zielpunkt: Strahl bis auf Gegner-Höhe (y≈18)
  const camY = camera.position.y;
  let s = _ndir.y < -0.02 ? (18 - camY) / _ndir.y : 1000;
  s = Math.max(40, Math.min(s, nestStats(t).range + 60));
  state.nestAim.set(camera.position.x + _ndir.x * s, 0, camera.position.z + _ndir.z * s);
  // Geschütz visuell neigen
  if (t.group.userData.gunPivot) t.group.userData.gunPivot.rotation.x = pitch * 0.6;
}

function updateNest(tower, dt) {
  const st = nestStats(tower);
  if (tower.flash > 0) tower.flash -= dt;
  const operating = tower.operated;
  const locked = state.time < tower.overheatUntil; // Zwangspause nach Überhitzung
  const wantFire = operating && tower.firing && !locked;

  // Läufe hoch-/runterfahren (Aufwärmeffekt)
  if (wantFire) tower.spin = Math.min(1, tower.spin + dt / Math.max(0.05, st.spinUp));
  else tower.spin = Math.max(0, tower.spin - dt / 0.6);

  // Zielen: Lafette folgt direkt der Ego-Blickrichtung
  if (operating) {
    tower.yaw = tower.aimYaw;
    tower.group.userData.rotG.rotation.y = tower.yaw;
  }

  // Feuern, sobald die Läufe genug Schwung haben
  if (wantFire && tower.spin > 0.35) {
    const rate = st.rate * tower.spin;          // Feuerrate skaliert mit Hochlauf
    tower.fireAcc += dt * rate;
    while (tower.fireAcc >= 1) {
      tower.fireAcc -= 1;
      fireNestBullet(tower, st);
      tower.heat = Math.min(100, tower.heat + st.heatRate / rate); // Hitze pro Schuss
      if (tower.heat >= 100) {                  // Überhitzt → Zwangspause
        tower.overheatUntil = state.time + st.overheatLock;
        tower.firing = false;
        sfx("leak");
        centerText("🔥 ÜBERHITZT!", "#f87171");
        break;
      }
    }
  } else {
    tower.fireAcc = 0;
  }

  // Abkühlen, wenn nicht gefeuert wird
  if (!wantFire) tower.heat = Math.max(0, tower.heat - st.coolRate * dt);
}

const _nestMuzzle = new THREE.Vector3();
function fireNestBullet(tower, st) {
  tower.flash = 0.05;
  tower.group.userData.muzzle.getWorldPosition(_nestMuzzle);
  const dir = new THREE.Vector3(Math.sin(tower.yaw), 0, Math.cos(tower.yaw));
  // leichte Streuung
  const spread = 0.05;
  dir.x += (Math.random() - 0.5) * spread;
  dir.z += (Math.random() - 0.5) * spread;
  dir.normalize();

  // Vom hohen Geschütz nach unten zu den Gegnern: leichte Sinkrate
  const startY = _nestMuzzle.y;
  const vy = (20 - startY) / st.range; // y-Änderung pro zurückgelegter Strecke

  const mesh = box(2.5, 2.5, 14, new THREE.MeshBasicMaterial({ color: 0xfff1a8 }), 0, 0, 0);
  mesh.castShadow = false;
  mesh.position.copy(_nestMuzzle);
  mesh.lookAt(_nestMuzzle.x + dir.x, _nestMuzzle.y + vy * 30, _nestMuzzle.z + dir.z);
  world.add(mesh);

  state.nestBullets.push({
    x: _nestMuzzle.x, y: startY, z: _nestMuzzle.z, vy,
    dx: dir.x, dz: dir.z,
    dist: 0, maxDist: st.range,
    dmg: st.dmg, pierce: st.pierce, splash: st.splash || 0,
    hit: new Set(), mesh,
  });
  sfx("minigun");
}

function updateNestBullets(dt) {
  const SPEED = 620, R = 16;
  for (const b of state.nestBullets) {
    const step = SPEED * dt;
    // Treffer entlang der Flugstrecke prüfen
    for (const e of state.enemies) {
      if (e.dead || b.hit.has(e) || !towerCanHit("nest", 0, e)) continue;
      // Abstand des Gegners zur Kugel-Front
      if (Math.hypot(e.x - b.x, e.z - b.z) <= R + 10 * e.def.scale) {
        b.hit.add(e);
        damageEnemy(e, b.dmg);
        if (b.splash) explode(e.x, e.z, Math.round(b.dmg * 0.5), b.splash, "nest");
        b.pierce--;
        if (b.pierce <= 0) { b.dead = true; break; }
      }
    }
    b.x += b.dx * step; b.z += b.dz * step; b.dist += step;
    b.y = Math.max(14, b.y + (b.vy || 0) * step);   // sinkt zum Gegner-Niveau
    b.mesh.position.set(b.x, b.y, b.z);
    if (b.dist >= b.maxDist) b.dead = true;
  }
  for (const b of state.nestBullets) {
    if (b.dead) { world.remove(b.mesh); disposeObject(b.mesh); }
  }
  state.nestBullets = state.nestBullets.filter(b => !b.dead);
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
    explode(p.tx, p.tz, p.dmg, p.splash, "rocket");
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

function explode(x, z, dmg, radius, srcType, srcLevel) {
  sfx("boom");
  state.shake = Math.max(state.shake, 0.15);
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (srcType && !towerCanHit(srcType, srcLevel || 0, e)) continue;  // Schwächen beachten
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
  if (n >= 2)  add("slime", Math.floor(n * 0.7), 0.45);
  if (n >= 3)  add("fast", Math.floor(n * 0.8), 0.5);
  if (n >= 5)  add("heavy", Math.floor(n / 2) - 1, 1.2);
  if (n >= 7)  add("metal", Math.floor((n - 4) / 3), 1.4);     // nur Rakete/Laser
  if (n >= 9)  add("ghost", Math.floor((n - 6) / 4), 1.3);     // nur Sniper/Laser
  if (n >= 11) add("flyer", Math.floor((n - 8) / 4), 1.2);     // nur Sniper(Lvl2)/Laser
  if (n >= 12) add("armored", Math.floor(n / 4), 1.6);
  if (n >= 14) add("healer", Math.floor((n - 8) / 6), 2.5);
  if (n >= 16) add("brute", Math.floor((n - 12) / 5), 2.2);
  if (n >= 22) add("demon", Math.floor((n - 18) / 3), 2.0);
  if (n >= 15) add("fast", Math.floor(n / 2), 0.3);
  return list;
}

function hpScale(wave) {
  return (1 + (wave - 1) * 0.085) * MAPS[state.map].hpMult * curDiff().hpMult;
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

const BOSS_RUSH_INTERVAL = 60; // Sekunden zwischen den Bossen

function startWave() {
  if (state.phase !== "idle" || !state.running) return;

  if (state.gameMode === "bossrush") {
    startBossRush();
    return;
  }

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

// Boss Rush: nur Bosse, alle 60s ein neuer, immer stärker
function startBossRush() {
  state.phase = "wave";
  state.bossRush = { num: 0, timer: 1.5, alarmed: false };
  showBanner("👹 BOSS RUSH 👹");
  sfx("wave");
  updateHUD();
}

function bossRushHpMult(num) {
  // Jede Runde der 5er-Bosse wird deutlich härter
  const cycle = Math.floor((num - 1) / BOSS_RUSH_ORDER.length);
  return MAPS[state.map].hpMult * (1 + (num - 1) * 0.12) * (1 + cycle * 0.6);
}

function spawnBossRushBoss() {
  const br = state.bossRush;
  br.num++;
  const type = BOSS_RUSH_ORDER[(br.num - 1) % BOSS_RUSH_ORDER.length];
  spawnEnemy(type, bossRushHpMult(br.num));
  const def = ENEMY_TYPES[type];
  showBanner(`👹 BOSS ${br.num}: ${def.name}`);
  sfx("bosshorn");
  state.portalAlarm = 0;
  br.alarmed = false;
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
  addCoins(Math.round(3 * curDiff().rewardMult)); // Münzen (mehr bei höherer Schwierigkeit)

  let hadFarm = false;
  for (const t of state.towers) {
    if (t.type === "farm") {
      const inc = towerStats(t).income;
      state.cash += inc;
      hadFarm = true;
      addText(t.x, 40, t.z, `+${inc}💰`, "#bef264");
    }
  }
  if (hadFarm) sfx("coin");

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

  if (state.gameMode === "bossrush") {
    const bossesBeaten = Math.max(0, state.bossRush.num - 1);
    const coins = 30 + bossesBeaten * 40;
    addCoins(coins);
    const isNew = saveBossRushBest(bossesBeaten);
    document.getElementById("go-wave").textContent = bossesBeaten + " Bosse";
    document.getElementById("go-highscore").textContent =
      (isNew ? `🏆 NEUER BOSS-RUSH-REKORD: ${bossesBeaten} Bosse! ` : `👹 ${bossesBeaten} Bosse besiegt. `) + `🪙 +${coins} Münzen`;
    document.getElementById("gameover-overlay").classList.remove("hidden");
    return;
  }

  const coins = Math.round(state.wave * 2 * curDiff().rewardMult);
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
  const coins = Math.round((150 + state.wave * 2) * curDiff().rewardMult);
  addCoins(coins);
  saveRecord(state.map, MAX_WAVE + 1);

  // Boss Rush freischalten, wenn eine ⭐⭐⭐-Karte (oder schwerer) gemeistert wurde
  let unlockMsg = "";
  if (MAPS[state.map].stars >= 3 && !loadJSON("btd_bossrush", false)) {
    unlockBossRush();
    unlockMsg = " 🔓 BOSS RUSH freigeschaltet!";
  }
  document.getElementById("win-info").textContent =
    `${MAPS[state.map].name} gemeistert! 💀 ${state.kills} Kills · 🪙 +${coins} Münzen${unlockMsg}`;
  document.getElementById("win-overlay").classList.remove("hidden");
}

function clearEntities() {
  for (const e of state.enemies) { if (!e.killed) removeEnemyMesh(e); }
  for (const d of state.dying) { world.remove(d.group); disposeObject(d.group); }
  for (const t of state.towers) {
    world.remove(t.group);
    disposeObject(t.group);
    for (const key of t.hiddenDeco) {
      const deco = decoByTile.get(key);
      if (deco) deco.visible = true;
    }
  }
  for (const p of state.projectiles) { world.remove(p.mesh); disposeObject(p.mesh); }
  for (const p of state.particles) p.mesh.visible = false;
  for (const t of state.tracers) t.line.visible = false;
  for (const r of state.rings) { world.remove(r.mesh); disposeObject(r.mesh); }
  for (const b of state.bolts) { world.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); }
  if (state.nest) exitNest();
  for (const b of state.nestBullets) { world.remove(b.mesh); disposeObject(b.mesh); }
  state.enemies = [];
  state.dying = [];
  state.towers = [];
  state.projectiles = [];
  state.particles = [];
  state.tracers = [];
  state.rings = [];
  state.bolts = [];
  state.nestBullets = [];
  fxLayer.innerHTML = "";
}

function resetGame() {
  clearEntities();
  // Boss Rush startet mit mehr Geld, da keine normalen Wellen
  state.cash = state.gameMode === "bossrush" ? 1500 : START_CASH;
  state.lives = curDiff().lives;   // Leben hängen von der Schwierigkeit ab
  state.maxLives = curDiff().lives;
  state.wave = 1;
  state.kills = 0;
  state.bossRush = null;
  state.portalAlarm = 0;
  state.gateFlash = 0;
  state.blindUntil = 0;
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
  if (state.phase === "wave" && state.gameMode === "normal") {
    state.waveTime += dt;
    while (state.spawnQueue.length && state.spawnQueue[0].time <= state.waveTime) {
      spawnEnemy(state.spawnQueue.shift().type);
    }
  }

  // Boss Rush: alle 60s ein neuer Boss, Portal warnt 2s vorher rot
  if (state.phase === "wave" && state.gameMode === "bossrush") {
    const br = state.bossRush;
    br.timer -= dt;
    if (!br.alarmed && br.num > 0 && br.timer <= 2) {
      br.alarmed = true;
      state.portalAlarm = 2;
      sfx("bosshorn");
    }
    if (state.portalAlarm > 0) state.portalAlarm = Math.max(0, state.portalAlarm - dt);
    if (br.timer <= 0) {
      spawnBossRushBoss();
      br.timer = BOSS_RUSH_INTERVAL;
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
          setHealthBar(o.bar, o.hp, o.maxHp);
          spawnParticle(o.x, 38 * o.def.scale, o.z, 0, 24, 0, 0.5, 4, "#4ade80", false);
          healed = true;
        }
        if (healed) {
          sfx("heal");
          burst(e.x, 30 * e.def.scale, e.z, "#86efac", 5, 40, false);
        }
      }
    }

    // Boss-Spezialfähigkeiten
    if (!e.dead && e.ability) triggerBossAbility(e, dt);

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
  updateNestBullets(dt);   // manuelle Minigun-Kugeln

  // Partikel, Tracer, Ringe, Blitze
  updateEffects(dt);

  // Wellenende prüfen (nur Normaler Modus)
  if (state.gameMode === "normal" && state.phase === "wave" && state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.phase = "idle";
    finishWave();
  }

  // Auto-Start
  if (state.gameMode === "normal" && state.phase === "idle" && state.autoStart && state.running) {
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
    const hover = e.def.flying ? 34 + Math.sin(state.time * 4 + e.walkPhase) * 4 : 0;
    e.group.position.set(e.x, hover, e.z);
    e.figure.rotation.y = e.yaw;
    const f = e.figure.userData;
    const swing = Math.sin(e.walkPhase) * (e.isBoss ? 0.5 : 0.7);
    f.legL.rotation.x = swing;
    f.legR.rotation.x = -swing;
    f.armL.rotation.x = -swing * 0.8;
    f.armR.rotation.x = swing * 0.8;
    if (e.isBoss) {
      // Bosse stampfen schwer (Auf-/Ab-Wuchten) und wiegen die Schultern
      e.figure.position.y = Math.abs(Math.sin(e.walkPhase)) * 3.5;
      e.figure.rotation.z = Math.sin(e.walkPhase) * 0.05;
      if (f.head) f.head.rotation.x = Math.sin(e.walkPhase * 0.5) * 0.08;
    }

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
    if (t.type === "nest") {
      // Läufe drehen mit dem Hochlauf, Mündungsfeuer flackert
      if (u.spinBarrels) u.spinBarrels.rotation.z += dtReal * (3 + (t.spin || 0) * 60);
      if (u.flash) u.flash.visible = t.flash > 0;
    } else if (u.spinBarrels) {
      u.spinBarrels.rotation.z += dtReal * (t.flash > 0 ? 25 : 3);
    }
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

  // Spawn-Portal animieren
  syncVisuals._t = (syncVisuals._t || 0) + dtReal;
  if (spawnPortal) {
    const p = spawnPortal;
    if (state.portalAlarm > 0) {
      // Boss kommt: rot pulsieren + leicht beben
      p.glow.material.color.set(0xff3030);
      p.glow.material.opacity = 0.5 + Math.sin(syncVisuals._t * 18) * 0.3;
      p.group.position.x = p.baseX + (Math.random() - 0.5) * 3;
      p.group.position.z = p.z + (Math.random() - 0.5) * 3;
    } else {
      p.glow.material.color.set(p.baseColor);
      p.glow.material.opacity = p.baseOpacity + Math.sin(syncVisuals._t * 2) * 0.12;
      p.group.position.x = p.baseX;
      p.group.position.z = p.z;
    }
    if (p.ring) p.ring.rotation.z += dtReal * 1.5; // Teleporter-Ring dreht sich
    // Themen-Partikel am Portal
    if (state.running && Math.random() < dtReal * 3) {
      if (p.theme === "volcano") {
        spawnParticle(p.x + 6, 8, p.z + (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 12, 45 + Math.random() * 30, (Math.random() - 0.5) * 12, 0.6, 3, "#ff9a4d", false);
      } else if (p.theme === "desert") {
        spawnParticle(p.x + 14, 4, p.z + (Math.random() - 0.5) * 36, 22 + Math.random() * 18, 6, (Math.random() - 0.5) * 25, 0.7, 3.5, "#e3c47f", false);
      } else if (p.theme === "space") {
        spawnParticle(p.x + 12, 6 + Math.random() * 40, p.z + (Math.random() - 0.5) * 36, 8, 0, 0, 0.5, 2.5, "#67e8f9", false);
      }
    }
  }

  // Ziel-Tor: rot aufblitzen bei Lebensverlust
  if (endGate) {
    if (state.gateFlash > 0) {
      state.gateFlash = Math.max(0, state.gateFlash - dtReal);
      const f = state.gateFlash / 0.5;
      endGate.door.material.color.setRGB(0.04 + f * 0.85, 0.05, 0.08);
    } else {
      endGate.door.material.color.set(endGate.baseColor);
    }
  }

  // Wasser leicht schaukeln lassen + Wellen-Shader animieren
  const waterY = -44 + Math.sin(syncVisuals._t * 0.8) * 1.5;
  water.position.y = waterY;
  waterMirror.position.y = waterY;
  waterFX.position.y = waterY + 0.6;
  waterFX.material.uniforms.time.value = syncVisuals._t;

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
  syncNestHud();
}

// Fadenkreuz + Hitze-Anzeige beim Bedienen der Minigun
function syncNestHud() {
  const t = state.nest;
  nestAimMarker.visible = !!t;
  if (!t) return;
  nestAimMarker.position.set(state.nestAim.x, 1.5, state.nestAim.z);
  const st = nestStats(t);
  const overheated = state.time < t.overheatUntil;
  const fill = document.getElementById("nest-heat-fill");
  const txt = document.getElementById("nest-heat-txt");
  const wrap = document.querySelector(".nest-heat-wrap");
  if (fill) fill.style.width = Math.round(t.heat) + "%";
  if (txt) txt.textContent = overheated ? "ÜBERHITZT!" : Math.round(t.heat) + "%";
  if (wrap) wrap.classList.toggle("overheated", overheated);
}

/* ---------------- Platzierungs-Vorschau & Auswahl-Markierung ---------------- */

function syncMarkers() {
  for (const g of ghostCache.values()) g.visible = false;

  // Durchsichtige Truppe klebt am Cursor
  if (state.placing && state.hoverPoint) {
    const { x, z } = state.hoverPoint;
    const check = canPlaceTowerAt(state.placing, x, z);
    const def = TOWER_TYPES[state.placing];

    tileMarker.visible = true;
    tileMarker.position.set(x, check.y + 1, z);
    tileMarker.material.color.set(check.ok ? 0x7ee787 : 0xff5050);

    const ghost = getGhost(state.placing);
    ghost.visible = true;
    ghost.position.set(x, check.y + 1.5, z);

    if (def.kind !== "farm") {
      placeRing.visible = true;
      placeRing.position.set(x, check.y + 1.2, z);
      const range = def.levels[0].range;
      placeRing.scale.set(range, 1, range);
      setRingColor(placeRing, check.ok ? 0xffffff : 0xff5050);
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
    selectRing.position.set(sel.x, sel.baseY + 1.2, sel.z);
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

  // Großer Basis-Lebensbalken oben
  const maxL = state.maxLives || curDiff().lives;
  const frac = Math.max(0, Math.min(1, state.lives / maxL));
  const fill = document.getElementById("hud-hp-fill");
  if (fill) {
    fill.style.width = (frac * 100) + "%";
    fill.style.background = frac > 0.5
      ? "linear-gradient(180deg, #4ade80, #16a34a)"
      : frac > 0.25
        ? "linear-gradient(180deg, #facc15, #d97706)"
        : "linear-gradient(180deg, #f87171, #dc2626)";
  }

  const br = state.gameMode === "bossrush";
  const btn = document.getElementById("btn-start");
  btn.disabled = state.phase !== "idle" || !state.running;
  btn.textContent = state.phase === "wave"
    ? (br ? "👹 Boss Rush läuft…" : "🌊 Welle läuft…")
    : (br ? "👹 Boss Rush starten" : "▶ Welle starten");

  let previewText;
  if (state.mode === "lobby") {
    previewText = "🏃 <b>WASD</b> oder <b>Pfeiltasten</b> = laufen – geh durchs goldene Portal, um zu spielen!";
  } else if (state.mode === "menu") {
    previewText = "🎮 Drücke SPIELEN und wähle eine Karte!";
  } else if (!state.running) {
    previewText = "";
  } else if (state.paused) {
    previewText = "<b>⏸ PAUSE</b> – Weiter mit ⏸ oder Taste P";
  } else if (br) {
    if (state.phase === "idle") {
      previewText = "<b>👹 BOSS RUSH:</b> Nur Bosse – jeder mit Spezialfähigkeit. Drücke Start!";
    } else {
      const next = Math.max(0, Math.ceil(state.bossRush.timer));
      previewText = `<b>👹 Boss ${state.bossRush.num}</b> · nächster in ${next}s · ${state.enemies.filter(e => e.isBoss).length} Boss(e) aktiv`;
    }
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

/* ---------------- Rotierende 3D-Mini-Modelle für die Kaufleiste ----------------
   Eine eigene kleine Off-Screen-Szene rendert nacheinander jedes Turm-Modell;
   das Bild wird auf die jeweilige Shop-Canvas kopiert. Spart Performance, weil
   nur ein zusätzlicher Renderer existiert (nicht einer pro Karte). */

const miniModels = {};          // key -> { canvas, ctx, mesh, hover }
let miniRenderer = null, miniScene = null, miniCam = null;

function initMiniRenderer() {
  if (miniRenderer) return;
  miniRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  miniRenderer.setSize(96, 96);
  miniRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  miniRenderer.outputEncoding = THREE.sRGBEncoding;
  miniScene = new THREE.Scene();
  miniScene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.0));
  const dl = new THREE.DirectionalLight(0xffffff, 0.9);
  dl.position.set(40, 80, 60);
  miniScene.add(dl);
  miniCam = new THREE.PerspectiveCamera(40, 1, 1, 1000);
  miniCam.position.set(0, 58, 95);
  miniCam.lookAt(0, 22, 0);
}

function registerMiniModel(key, canvas) {
  initMiniRenderer();
  const mesh = makeTowerMesh(key, 0);
  if (key === "nest") mesh.scale.setScalar(0.5);   // hohes Nest klein genug fürs Icon
  miniModels[key] = { canvas, ctx: canvas.getContext("2d"), mesh, hover: false };
}

// Wird pro Frame aufgerufen: dreht alle Modelle und rendert sie auf ihre Canvas
let miniRenderIdx = 0;
function updateMiniModels(dtReal) {
  if (state.mode !== "game" || !miniRenderer) return;  // Hotbar nur im Spiel sichtbar
  const keys = Object.keys(miniModels);
  if (keys.length === 0) return;

  // Alle Modelle drehen (1 Umdrehung / 6s, beim Hover schneller)
  for (const k of keys) {
    const m = miniModels[k];
    const speed = m.hover ? (Math.PI * 2) / 1.5 : (Math.PI * 2) / 6;
    m.mesh.rotation.y += speed * dtReal;
  }

  // Pro Frame nur 2 Canvas neu rendern (reihum) – schont die FPS
  for (let n = 0; n < 2; n++) {
    const key = keys[miniRenderIdx % keys.length];
    miniRenderIdx++;
    const m = miniModels[key];
    miniScene.add(m.mesh);
    miniRenderer.render(miniScene, miniCam);
    miniScene.remove(m.mesh);
    m.ctx.clearRect(0, 0, 96, 96);
    m.ctx.drawImage(miniRenderer.domElement, 0, 0, 96, 96);
  }
}

function towerStatTooltip(def) {
  const st = def.levels[0];
  if (def.kind === "farm") return `💰 Einkommen: <b>${st.income}</b>/Welle`;
  let s = `⚔️ Schaden <b>${st.dmg}</b> · 📏 Reichw. <b>${st.range}</b> · ⏱️ <b>${st.rate}/s</b>`;
  if (st.slow) s += `<br>❄️ −${Math.round(st.slow * 100)}% Tempo`;
  if (st.splash) s += `<br>💥 Splash ${st.splash}`;
  if (st.burn) s += `<br>🔥 Brand, trifft ${st.targets}`;
  if (st.chains) s += `<br>⚡ Kette ${st.chains} Ziele`;
  if (st.charge) s += `<br>🔆 Lädt ${st.charge}s auf`;
  if (def.cliff) s += `<br>⛰ nur auf Anhöhen`;
  const sp = towerSpecialText(def);
  if (sp) s += `<br><span style="color:#7ee787">★ ${sp}</span>`;
  return s;
}

// Spezial-Stärken eines Turms gegen bestimmte Gegnertypen
function towerSpecialText(def) {
  if (def.kind === "laser") return "Trifft ALLES – auch 🛡 Metall & 👻 Unsichtbare";
  if (def.kind === "rocket") return "Einziger gegen 🛡 Metall-Zombies";
  if (def.name === "Scharfschütze") return "Sieht 👻 Unsichtbare & 🦇 Flieger (ab Lvl 2)";
  return "";
}

function refreshShop() {
  const shop = document.getElementById("shop");
  if (!shop.dataset.built) {
    shop.dataset.built = "1";
    for (const [key, def] of Object.entries(TOWER_TYPES)) {
      const card = document.createElement("div");
      card.className = "shop-card";
      card.id = "card-" + key;
      card.style.borderColor = def.color;
      card.innerHTML = `
        <canvas class="shop-3d" width="96" height="96"></canvas>
        <div class="shop-lock">🔒</div>
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
        if (def.unique && state.towers.some(tt => tt.type === key)) {
          centerText(`${def.name}: nur 1× pro Spiel!`, "#f87171");
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
      card.addEventListener("mouseenter", () => showShopTooltip(card, def));
      card.addEventListener("mouseleave", hideShopTooltip);
      shop.appendChild(card);
      registerMiniModel(key, card.querySelector(".shop-3d"));
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

function showShopTooltip(card, def) {
  const tip = document.getElementById("shop-tooltip");
  tip.innerHTML = `<b>${def.name}</b><br>${towerStatTooltip(def)}`;
  tip.style.display = "block";
  // Tooltip mittig über der Hotbar-Karte platzieren
  const rect = card.getBoundingClientRect();
  const wrapRect = document.getElementById("canvas-wrap").getBoundingClientRect();
  tip.style.left = (rect.left - wrapRect.left + rect.width / 2) + "px";
  tip.style.bottom = (wrapRect.bottom - rect.top + 10) + "px";
  if (miniModels[card.id?.slice(5)]) miniModels[card.id.slice(5)].hover = true;
}
function hideShopTooltip() {
  document.getElementById("shop-tooltip").style.display = "none";
  for (const k in miniModels) miniModels[k].hover = false;
}

function refreshShopSelection() {
  for (const [key, def] of Object.entries(TOWER_TYPES)) {
    const card = document.getElementById("card-" + key);
    if (!card) continue;
    const selected = state.placing === key;
    card.classList.toggle("selected", selected);
    card.style.borderColor = selected ? def.color : "#41598f";
    if (selected) card.style.boxShadow = `0 0 12px ${def.color}`;
    else card.style.boxShadow = "";
    // Nicht leistbar / gesperrt ausgrauen
    const placed = def.unique && state.towers.some(t => t.type === key); // schon gebaut?
    const locked = state.wave < def.unlockWave || placed;
    const poor = state.cash < def.cost;
    card.classList.toggle("locked", locked);
    card.classList.toggle("poor", poor && !locked);
    const costEl = card.querySelector(".shop-cost");
    if (costEl) {
      costEl.textContent = placed ? "✔ gebaut" : "$" + def.cost;
      costEl.style.color = placed ? "#7ee787" : (!locked && !poor) ? "#7ee787" : "#f87171";
    }
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
  panelModel.mesh = null;
}

// Rotierendes Modell im Upgrade-Panel (eigener kleiner Renderzustand)
const panelModel = { mesh: null, type: null, level: -1, canvas: null, ctx: null };
function setPanelModel(type, level) {
  initMiniRenderer();
  if (!panelModel.canvas) {
    panelModel.canvas = document.getElementById("tp-canvas");
    panelModel.ctx = panelModel.canvas.getContext("2d");
  }
  if (panelModel.type !== type || panelModel.level !== level) {
    if (panelModel.mesh) disposeObject(panelModel.mesh);
    panelModel.mesh = makeTowerMesh(type, level);
    if (type === "nest") panelModel.mesh.scale.setScalar(0.5);  // hohes Nest einpassen
    // Noppen/Sterne wie im Spiel anzeigen
    const studs = panelModel.mesh.userData.studs;
    const gold = lambert(0xfacc15);
    for (let i = 0; i < level; i++) studs.add(box(4, 4, 4, gold, (i - (level - 1) / 2) * 6.5, 8, 19));
    panelModel.type = type;
    panelModel.level = level;
  }
}
function updatePanelModel(dtReal) {
  if (!panelModel.mesh || !miniRenderer) return;
  if (document.getElementById("tower-panel").classList.contains("hidden")) return;
  panelModel.mesh.rotation.y += dtReal * (Math.PI * 2) / 5;
  miniScene.add(panelModel.mesh);
  miniRenderer.render(miniScene, miniCam);
  miniScene.remove(panelModel.mesh);
  panelModel.ctx.clearRect(0, 0, 128, 128);
  panelModel.ctx.drawImage(miniRenderer.domElement, 0, 0, 128, 128);
}

function refreshTowerPanel() {
  const t = state.selected;
  if (!t) return;
  const def = TOWER_TYPES[t.type];
  const st = towerStats(t);

  document.getElementById("tp-name").textContent = `${def.icon} ${def.name}`;
  document.getElementById("tp-level").textContent =
    `Level ${t.level + 1}/5 ${"★".repeat(t.level)}`;

  // Rotierendes 3D-Modell der aktuellen Stufe (mit Gold-Noppen/Helm ab Lvl 3)
  setPanelModel(t.type, t.level);

  let stats = "";
  if (def.kind === "farm") {
    stats = `💰 Einkommen: <b>${st.income}</b> / Welle`;
  } else if (def.kind === "nest") {
    stats = `⚔️ Schaden: <b>${st.dmg}</b>/Schuss<br>📏 Reichweite: <b>${st.range}</b><br>⏱️ Feuerrate: <b>${st.rate}/s</b> (max)<br>🎯 Durchschlag: <b>${st.pierce}</b> Gegner<br>🌀 Hochlauf: <b>${st.spinUp}s</b><br>🔥 Überhitzung: <b>${st.overheatLock}s</b> Pause`;
    if (st.splash) stats += `<br>💥 Splash: <b>${st.splash}</b>`;
    stats += `<br><span style="color:#facc15">🪖 Klick/E = einsteigen</span>`;
  } else {
    stats = `⚔️ Schaden: <b>${st.dmg}</b><br>📏 Reichweite: <b>${st.range}</b><br>⏱️ Feuerrate: <b>${st.rate}/s</b>`;
    if (st.slow) stats += `<br>❄️ Verlangsamung: <b>${Math.round(st.slow * 100)}%</b> für ${st.slowDur}s`;
    if (st.splash) stats += `<br>💥 Splash-Radius: <b>${st.splash}</b>`;
    if (st.burn) stats += `<br>🔥 Brand: <b>${st.burn}/s</b> für ${st.burnDur}s<br>👥 Trifft <b>${st.targets}</b> Gegner`;
    if (st.chains) stats += `<br>⚡ Kettenblitz: <b>${st.chains}</b> Ziele`;
    if (st.charge) stats += `<br>🔆 Aufladezeit: <b>${st.charge}s</b>`;
    if (st.pierce) stats += `<br>🎯 Durchschlag: <b>${st.pierce}</b>`;
  }
  const sp = towerSpecialText(def);
  if (sp) stats += `<br><span style="color:#7ee787">★ ${sp}</span>`;
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
  // Minigun Nest hat keinen Zielmodus (manuell), dafür "Einsteigen"
  if (def.kind === "nest") {
    tgtBtn.style.display = "";
    tgtBtn.textContent = "🪖 Einsteigen (E)";
  } else {
    tgtBtn.style.display = def.kind === "farm" ? "none" : "";
    tgtBtn.textContent = `🎯 Ziel: ${TARGET_MODES[t.targetMode]}`;
  }

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
  // Anhöhen einzeichnen
  g.fillStyle = "rgba(255,255,255,0.30)";
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = 2;
  for (const h of (map.hills || [])) {
    g.fillRect(h.c * cw, h.r * ch, h.w * cw, h.h * ch);
    g.strokeRect(h.c * cw, h.r * ch, h.w * cw, h.h * ch);
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

  // Schatten-Auflösung an Grafikstufe koppeln (Neuaufbau der Shadow-Map)
  const shadowSize = state.settings.hiRes ? 4096 : 2048;
  if (sun.shadow.mapSize.x !== shadowSize) {
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  resize(); // Pixel-Anzahl (Supersampling) neu setzen
  updateWaterMode(); // Ray-Tracing-Spiegelung an/aus

  document.getElementById("set-hires").checked = state.settings.hiRes;
  document.getElementById("set-rt").checked = state.settings.rt;
  document.getElementById("btn-sound").textContent = state.settings.sound ? "🔊" : "🔇";
  document.getElementById("btn-music").textContent = state.settings.music ? "🎵" : "🔕";
  document.getElementById("set-sound").checked = state.settings.sound;
  document.getElementById("set-music").checked = state.settings.music;
  document.getElementById("set-shadows").checked = state.settings.shadows;
  document.getElementById("set-dmg").checked = state.settings.dmgNumbers;
  document.getElementById("set-volsfx").value = state.settings.volSfx;
  document.getElementById("set-volmusic").value = state.settings.volMusic;
}

/* ---------------- Ladebildschirm & Spielstart ---------------- */

function startGameOnMap(mapKey, gameMode) {
  state.map = mapKey;
  state.gameMode = gameMode || "normal";
  localStorage.setItem("btd_map", mapKey);
  closeAllWindows();
  document.getElementById("menu-overlay").classList.add("hidden");
  document.getElementById("lobby-ui").classList.add("hidden");

  // Ladebildschirm
  const loading = document.getElementById("loading-overlay");
  const d = curDiff();
  document.getElementById("loading-map").innerHTML = `${MAPS[mapKey].icon} ${MAPS[mapKey].name}<br><span style="font-size:15px;color:${d.color}">${d.icon} ${d.name}</span>`;
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
  document.getElementById("hud").style.display = "none";  // HUD nur im Spiel
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
  document.getElementById("hud").style.display = "none";
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
  document.getElementById("hud").style.display = "";
  document.getElementById("lobby-ui").classList.add("hidden");
  camera.position.copy(CAM_HOME.pos);
  controls.target.copy(CAM_HOME.target);
  controls.update();
  resetGame();
  showBanner(state.gameMode === "bossrush" ? `👹 BOSS RUSH – ${MAPS[state.map].name}` : `🗺 ${MAPS[state.map].name} · ${curDiff().icon} ${curDiff().name}`);
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
      buildModeRow();
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

// Liefert den Punkt auf dem Spielfeld unter dem Cursor (oder null).
// Prüft zuerst die Anhöhen-Ebene, damit man oben auf Hügeln genau zielt.
const hillPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(HILL_H + 3));
function pointFromEvent(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(_ndc, camera);

  // Trifft der Strahl die Deckfläche einer Anhöhe?
  if (raycaster.ray.intersectPlane(hillPlane, _hit)) {
    if (_hit.x >= 0 && _hit.x <= W && _hit.z >= 0 && _hit.z <= D && hillAt(_hit.x, _hit.z)) {
      return { x: _hit.x, z: _hit.z };
    }
  }
  if (!raycaster.ray.intersectPlane(groundPlane, _hit)) return null;
  if (_hit.x < 0 || _hit.x > W || _hit.z < 0 || _hit.z > D) return null;
  return { x: _hit.x, z: _hit.z };
}

renderer.domElement.addEventListener("pointermove", (ev) => {
  if (state.nest) {
    // Ego-Perspektive: Maus bewegt frei den Blick (Free-Look)
    const t = state.nest;
    t.aimYaw -= (ev.movementX || 0) * 0.0032;
    t.aimPitch = Math.max(0.05, Math.min(0.8, t.aimPitch + (ev.movementY || 0) * 0.0026));
    return;
  }
  const p = pointFromEvent(ev);
  state.hoverPoint = p;
});
renderer.domElement.addEventListener("pointerleave", () => { state.hoverPoint = null; });
renderer.domElement.addEventListener("contextmenu", (ev) => { if (state.nest) ev.preventDefault(); });

let downPos = null;
renderer.domElement.addEventListener("pointerdown", (ev) => {
  // Minigun bedienen: links = feuern, rechts = aussteigen
  if (state.nest) {
    if (ev.button === 0) { ensureAudio(); state.nest.firing = true; }
    else if (ev.button === 2) exitNest();
    return;
  }
  if (ev.button === 0) downPos = { x: ev.clientX, y: ev.clientY };
});
renderer.domElement.addEventListener("pointerup", (ev) => {
  if (state.nest) { if (ev.button === 0) state.nest.firing = false; return; }
  if (ev.button !== 0 || !downPos) return;
  const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
  downPos = null;
  if (moved > 6) return;
  handleClick(ev);
});

function handleClick(ev) {
  ensureAudio();
  if (!state.running) return;
  const point = pointFromEvent(ev);
  if (!point) return;

  if (state.placing) {
    const check = canPlaceTowerAt(state.placing, point.x, point.z);
    if (check.ok) {
      const ok = placeTower(state.placing, point.x, point.z);
      if (ok && state.cash < TOWER_TYPES[state.placing].cost) {
        state.placing = null;
        refreshShopSelection();
      }
    } else {
      addText(point.x, check.y + 14, point.z, check.reason, "#f87171");
    }
    return;
  }

  // Nächsten Turm am Klick-Strahl auswählen (funktioniert auch auf Anhöhen)
  let hit = null, bestD = 24;
  const center = new THREE.Vector3();
  for (const t of state.towers) {
    const d = raycaster.ray.distanceToPoint(center.set(t.x, t.baseY + 22, t.z));
    if (d < bestD) { bestD = d; hit = t; }
  }
  selectTower(hit); // Nest: auswählen → Panel zeigt "Einsteigen (E)"
}

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    if (state.nest) { exitNest(); return; }
    if (modalStack.length > 0) {
      closeWindow(modalStack[modalStack.length - 1]);
      return;
    }
    state.placing = null;
    selectTower(null);
    refreshShopSelection();
  }
  // E = Minigun Nest betreten/verlassen
  if ((ev.key === "e" || ev.key === "E") && state.running) {
    if (state.nest) { exitNest(); return; }
    ensureAudio();
    const nest = state.towers.find(t => t.type === "nest");
    if (nest) enterNest(nest);
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

// Horizontale Spielmodus-Karten (TDS-Stil) bauen
function buildModeRow() {
  const row = document.getElementById("mode-row");
  row.innerHTML = "";
  for (const m of GAME_MODES) {
    const locked = m.locked || (m.lockedFn && m.lockedFn());
    const card = document.createElement("div");
    card.className = "sel-card" + (locked ? " locked" : "");
    const sub = locked ? (m.lockedSub || "🔒 Bald verfügbar") : m.sub;
    card.innerHTML = `
      <div class="sel-card-top" style="background:#11183020">${locked ? "🔒" : m.icon}</div>
      <div class="sel-card-body">
        <div class="sel-card-name">${m.name}</div>
        <div class="sel-card-sub">${sub}</div>
      </div>`;
    card.addEventListener("click", () => {
      ensureAudio();
      if (locked) { sfx("lose"); card.classList.add("shake"); setTimeout(() => card.classList.remove("shake"), 350); return; }
      pendingMode = m.id;
      buildMapGrid();
      closeWindow("mode-overlay");
      openWindow("map-overlay");
    });
    row.appendChild(card);
  }
}

// Horizontale Schwierigkeits-Karten (TDS-Stil) bauen
function buildDiffRow() {
  const row = document.getElementById("diff-row");
  row.innerHTML = "";
  for (const d of DIFFICULTIES) {
    const card = document.createElement("div");
    card.className = "sel-card";
    card.style.borderColor = d.color;
    card.innerHTML = `
      <div class="sel-card-top" style="background:${d.color}22">${d.icon}</div>
      <div class="sel-card-body">
        <div class="sel-card-name" style="color:${d.color}">${d.name}</div>
        <div class="sel-card-sub">${d.sub}</div>
        <div class="sel-card-tag">❤️ ${d.lives} · 💪 ${Math.round(d.hpMult*100)}% · 💰 ${Math.round(d.rewardMult*100)}%</div>
      </div>`;
    card.addEventListener("click", () => {
      ensureAudio();
      state.difficulty = d.id;
      localStorage.setItem("btd_diff", d.id);
      closeWindow("diff-overlay");
      startGameOnMap(infoMapKey, pendingMode);
    });
    row.appendChild(card);
  }
}

document.getElementById("btn-spielen").addEventListener("click", () => { ensureAudio(); buildModeRow(); openWindow("mode-overlay"); });
document.getElementById("btn-shop-open").addEventListener("click", () => { ensureAudio(); buildSkinGrid(); openWindow("shopwin-overlay"); });
document.getElementById("btn-settings-open").addEventListener("click", () => { ensureAudio(); applySettings(); openWindow("settings-overlay"); });
document.getElementById("btn-settings-hud").addEventListener("click", () => { ensureAudio(); applySettings(); openWindow("settings-overlay"); });
document.getElementById("btn-records-open").addEventListener("click", () => { ensureAudio(); buildRecordsList(); openWindow("records-overlay"); });
document.getElementById("btn-lobby").addEventListener("click", () => { ensureAudio(); enterLobby(); });
document.getElementById("btn-menu-from-lobby").addEventListener("click", () => { ensureAudio(); showMainMenu(); });

// Welcher Modus/Karte wird gerade gewählt?
let pendingMode = "normal";

// Karten-Detail → weiter zur Schwierigkeitsauswahl
document.getElementById("btn-start-map").addEventListener("click", () => {
  ensureAudio();
  if (!infoMapKey) return;
  buildDiffRow();
  closeWindow("mapinfo-overlay");
  openWindow("diff-overlay");
});
document.getElementById("btn-back-map").addEventListener("click", () => closeWindow("mapinfo-overlay"));

// Schließen-/Zurück-Knöpfe aller Pixel-Fenster
for (const btn of document.querySelectorAll(".pixel-close")) {
  btn.addEventListener("click", () => closeWindow(btn.dataset.close));
}
for (const btn of document.querySelectorAll(".pixel-back")) {
  btn.addEventListener("click", () => {
    closeWindow(btn.dataset.back);
    // Zurück führt eine Ebene hoch im Ablauf
    if (btn.dataset.back === "map-overlay") openWindow("mode-overlay");
    else if (btn.dataset.back === "diff-overlay") openWindow("mapinfo-overlay");
  });
}

// Einstellungen
document.getElementById("set-hires").addEventListener("change", (ev) => { state.settings.hiRes = ev.target.checked; saveSettings(); applySettings(); });
document.getElementById("set-rt").addEventListener("change", (ev) => { state.settings.rt = ev.target.checked; saveSettings(); applySettings(); });
document.getElementById("set-sound").addEventListener("change", (ev) => { state.settings.sound = ev.target.checked; saveSettings(); applySettings(); });
document.getElementById("set-music").addEventListener("change", (ev) => { ensureAudio(); state.settings.music = ev.target.checked; saveSettings(); applySettings(); });
document.getElementById("set-volsfx").addEventListener("input", (ev) => { ensureAudio(); state.settings.volSfx = +ev.target.value; saveSettings(); });
document.getElementById("set-volsfx").addEventListener("change", () => sfx("shoot"));
document.getElementById("set-volmusic").addEventListener("input", (ev) => { state.settings.volMusic = +ev.target.value; saveSettings(); });
document.getElementById("set-shadows").addEventListener("change", (ev) => { state.settings.shadows = ev.target.checked; saveSettings(); applySettings(); });
document.getElementById("set-dmg").addEventListener("change", (ev) => { state.settings.dmgNumbers = ev.target.checked; saveSettings(); });

// Game Over / Sieg
document.getElementById("btn-retry").addEventListener("click", () => { ensureAudio(); startGameOnMap(state.map, state.gameMode); });
document.getElementById("btn-again").addEventListener("click", () => { ensureAudio(); startGameOnMap(state.map, state.gameMode); });
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

// Vollbild wie ein richtiges Spiel
document.getElementById("btn-fullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
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
  addText(t.x, t.baseY + 56, t.z, "LEVEL UP!", "#ffd24a");
  burst(t.x, t.baseY + 30, t.z, "#ffd24a", 12, 80, false);
  refreshTowerStuds(t);

  // Aussehen bei JEDEM Level neu aufbauen (höheres Level = besseres Aussehen)
  if (TOWER_TYPES[t.type].kind !== "farm" && t.type !== "nest") {
    const yaw = t.yaw;
    world.remove(t.group);
    disposeObject(t.group);
    t.group = makeTowerMesh(t.type, t.level);
    t.group.position.set(t.x, t.baseY, t.z);
    t.group.userData.rotG.rotation.y = yaw;
    world.add(t.group);
    refreshTowerStuds(t);
  }
  if (t.type === "nest") refreshTowerPanel(); // Stats im Panel aktualisieren
  updateHUD();
});

document.getElementById("btn-target").addEventListener("click", () => {
  const t = state.selected;
  if (!t) return;
  if (t.type === "nest") { enterNest(t); return; } // Minigun bedienen
  t.targetMode = (t.targetMode + 1) % TARGET_MODES.length;
  refreshTowerPanel();
});

document.getElementById("btn-sell").addEventListener("click", () => {
  const t = state.selected;
  if (!t) return;
  if (state.nest === t) exitNest();   // Minigun erst verlassen
  state.cash += Math.floor(t.invested * 0.7);
  removeTower(t);
  selectTower(null);
  refreshShopSelection();  // unique-Turm im Shop wieder freigeben
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
  if (state.nest) updateNestView();                       // Ego-Kamera im Geschütz
  else if (state.mode !== "lobby") controls.update();     // sonst freie Bau-Kamera
  renderer.render(scene, camera);

  // Mini-3D-Modelle der Kaufleiste + Upgrade-Panel drehen/rendern
  updateMiniModels(dt);
  updatePanelModel(dt);

  requestAnimationFrame(loop);
}

/* ---------------- Start ---------------- */

loadSettings();
buildMap(state.map);
refreshShop();
applySettings();
showMainMenu();
requestAnimationFrame(loop);
