'use strict';

// ============================================================
//  Turm-Verteidigung 3D — Tower-Defense mit Three.js (WebGL)
//  Spiellogik in 2D-Pfadkoordinaten, Darstellung als 3D-Szene.
// ============================================================

// ---------- Grundkonstanten ----------
const COLS = 20, ROWS = 14, CELL = 40;
const W = COLS * CELL, H = ROWS * CELL;
const TOTAL_WAVES = 20;

// Pixel-Logikkoordinaten -> Weltkoordinaten (1 Zelle = 1 Einheit)
const pxToWX = (x) => x / CELL - COLS / 2;
const pxToWZ = (y) => y / CELL - ROWS / 2;

// ---------- Karten ----------
// Jede Karte: Wegpunkte (achsenparallel, Start links / Ziel rechts) + Anhöhen.
// Kürzerer Pfad = weniger Zeit zum Schießen = schwerer.
const MAPS = [
  {
    name: 'Wiese', difficulty: 'Normal',
    waypoints: [[-1, 2], [16, 2], [16, 6], [3, 6], [3, 10], [20, 10]],
    hills: [
      [15, 3], [15, 4], [9, 4], [9, 5], [5, 7], [9, 7], [15, 7], [4, 8], [12, 8],
      [1, 3], [18, 5], [6, 11], [13, 11], [18, 12],
    ],
  },
  {
    name: 'Serpentinen', difficulty: 'Leicht',
    waves: { tankEvery: 3, fastEvery: 4 }, // Panzerkolonnen auf dem langen Weg
    waypoints: [[-1, 11], [4, 11], [4, 3], [8, 3], [8, 11], [12, 11], [12, 3], [16, 3], [16, 11], [20, 11]],
    hills: [
      [2, 5], [2, 9], [6, 5], [6, 9], [10, 5], [10, 9], [14, 5], [14, 9], [18, 5], [18, 9],
      [1, 1], [18, 1], [6, 13], [13, 13],
    ],
  },
  {
    name: 'Schlucht', difficulty: 'Schwer',
    waves: { fastEvery: 2, tankEvery: 5 }, // Sturmläufe auf dem kurzen Pfad
    waypoints: [[-1, 4], [6, 4], [6, 9], [13, 9], [13, 4], [20, 4]],
    hills: [
      [4, 2], [4, 6], [8, 6], [8, 11], [11, 2], [11, 6], [15, 2], [15, 6],
      [2, 6], [17, 6], [2, 2], [17, 2], [6, 11], [13, 11],
    ],
  },
];

const HILL_H = 0.35; // Plateauhöhe in Welteinheiten
let currentMap = 0;
let WAYPOINT_CELLS = [];
let waypoints = [];
let pathCells = new Set();
let HILL_CELLS = [];
let hillCells = new Set();
const isHillCell = (cx, cy) => hillCells.has(cx + ',' + cy);

function loadMapData(i) {
  currentMap = i;
  const m = MAPS[i];
  WAYPOINT_CELLS = m.waypoints;
  waypoints = WAYPOINT_CELLS.map(([c, r]) => ({
    x: (c + 0.5) * CELL,
    y: (r + 0.5) * CELL,
  }));
  pathCells = new Set();
  for (let s = 0; s < WAYPOINT_CELLS.length - 1; s++) {
    let [c1, r1] = WAYPOINT_CELLS[s];
    const [c2, r2] = WAYPOINT_CELLS[s + 1];
    const dc = Math.sign(c2 - c1), dr = Math.sign(r2 - r1);
    while (c1 !== c2 || r1 !== r2) {
      if (c1 >= 0 && c1 < COLS && r1 >= 0 && r1 < ROWS) pathCells.add(c1 + ',' + r1);
      c1 += dc; r1 += dr;
    }
    if (c2 >= 0 && c2 < COLS && r2 >= 0 && r2 < ROWS) pathCells.add(c2 + ',' + r2);
  }
  HILL_CELLS = m.hills;
  hillCells = new Set(HILL_CELLS.map(([c, r]) => c + ',' + r));
}

// ---------- Turmtypen ----------
const TOWER_TYPES = {
  archer: {
    name: 'Bogenturm', cost: 50, dmg: 12, range: 110, rate: 2.4,
    projSpeed: 420, color: '#8b5a2b',
    desc: 'Schnell, günstig, Einzelziel',
  },
  cannon: {
    name: 'Kanone', cost: 100, dmg: 34, range: 105, rate: 0.75,
    projSpeed: 260, splash: 58, color: '#4a4a55', terrain: 'ground',
    desc: 'Flächenschaden, langsam',
  },
  frost: {
    name: 'Frostturm', cost: 70, dmg: 6, range: 95, rate: 1.4,
    projSpeed: 340, slow: { factor: 0.55, dur: 2.0 },
    color: '#3d7ea6',
    desc: 'Verlangsamt Gegner',
  },
  bolt: {
    name: 'Blitzturm', cost: 150, dmg: 85, range: 190, rate: 0.55,
    laser: true, color: '#6b4fa0', terrain: 'hill',
    desc: 'Hohe Reichweite &amp; Schaden',
  },
  guard: {
    name: 'Wachturm', cost: 120, dmg: 22, range: 135, rate: 1.8,
    projSpeed: 460, color: '#7a6a4f', terrain: 'hill', enterable: true,
    arc: 0.5, // halber Öffnungswinkel des Automatik-Sektors (rad, ≈ ±29°)
    manual: { dmg: 50, rate: 3, range: 300 },
    desc: 'Betretbar — selbst zielen &amp; schießen!',
  },
  mortar: {
    name: 'Mörser', cost: 160, dmg: 40, range: 150, rate: 0.5,
    projSpeed: 210, splash: 65, lob: true, color: '#6a5c48', terrain: 'ground', enterable: true,
    arc: 0.6,
    manual: { dmg: 95, rate: 0.8, range: 340, splash: 85 },
    desc: 'Betretbare Artillerie — Bogenschuss auf Bodenziele',
  },
  poison: {
    name: 'Giftturm', cost: 90, dmg: 5, range: 100, rate: 1.1,
    projSpeed: 320, poison: { dps: 16, dur: 3 }, color: '#5a9e3f', terrain: 'ground',
    desc: 'Gift: Schaden über Zeit',
  },
  mine: {
    name: 'Goldmine', cost: 100, income: 15, color: '#b8912f', terrain: 'ground',
    desc: 'Erzeugt Gold nach jeder Welle',
  },
};
const TOWER_KEYS = ['archer', 'cannon', 'frost', 'bolt', 'guard', 'mortar', 'poison', 'mine'];

// ---------- Ausrüstung (ein Gegenstand pro Turm) ----------
const EQUIP = {
  scope:  { icon: '🔭', name: 'Zielfernrohr',     cost: 60,  range: 1.25, color: 0x5da9e8 },
  loader: { icon: '⚙️', name: 'Schnelllader',     cost: 80,  rate: 1.3,   color: 0xe8a44f },
  ammo:   { icon: '💥', name: 'Schwere Munition', cost: 100, dmg: 1.35,   color: 0xe85d5d },
};

const LEVEL_MULT = [1, 1.6, 2.5];
const RANGE_MULT = [1, 1.12, 1.25];
const RATE_MULT = [1, 1.15, 1.32];
const MAX_LEVEL = 3;

function upgradeCost(type, level) {
  return Math.round(TOWER_TYPES[type].cost * 0.9 * level);
}

// ---------- Gegnertypen ----------
const ENEMY_TYPES = {
  normal:   { hp: 34, speed: 55, reward: 6, radius: 12, lives: 1, color: 0xc94f4f },
  fast:     { hp: 22, speed: 95, reward: 7, radius: 10, lives: 1, color: 0xe8b64f },
  tank:     { hp: 110, speed: 36, reward: 12, radius: 15, lives: 2, color: 0x5a7d5a },
  boss:     { hp: 650, speed: 30, reward: 60, radius: 20, lives: 5, color: 0x7a4fa0 },
  summoner: { hp: 420, speed: 26, reward: 70, radius: 17, lives: 4, color: 0x5a4a7d },
  healer:   { hp: 55, speed: 45, reward: 11, radius: 12, lives: 1, color: 0xf0ece4 },
};
const HEAL_RANGE = 90;   // px
const HEAL_INTERVAL = 3; // s
const SLOW_TINT = 0x7ab8d9;
const POISON_TINT = 0x8cc45f;

// ============================================================
//  Three.js — Szene, Kamera, Licht, Spielfeld
// ============================================================
const container = document.getElementById('game3d');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2332);
scene.fog = new THREE.Fog(0x1a2332, 28, 55);

const camera = new THREE.PerspectiveCamera(42, 800 / 560, 0.1, 200);

// Orbit-Kamera (rechte Maustaste = drehen, Mausrad = Zoom)
const camCtl = { radius: 15.5, phi: 1.0, theta: 0 };
const CAM_DEFAULT = { ...camCtl };
const CAM_TARGET = new THREE.Vector3(0, 0, -1.1);

function updateCamera() {
  const { radius, phi, theta } = camCtl;
  camera.position.set(
    CAM_TARGET.x + radius * Math.sin(phi) * Math.sin(theta),
    CAM_TARGET.y + radius * Math.cos(phi),
    CAM_TARGET.z + radius * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(CAM_TARGET);
}
updateCamera();

function resize() {
  const w = container.clientWidth || 800;
  const h = Math.round(w * 0.7);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Licht
scene.add(new THREE.HemisphereLight(0xbfd4e8, 0x33452e, 0.75));
const sun = new THREE.DirectionalLight(0xfff2d9, 0.95);
sun.position.set(12, 20, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -13; sun.shadow.camera.right = 13;
sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0004;
scene.add(sun);

// Gemeinsame Materialien
const MAT = {
  stone:     new THREE.MeshStandardMaterial({ color: 0x9094a3, roughness: 0.85 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x5a5c68, roughness: 0.9 }),
  wood:      new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8 }),
  woodLight: new THREE.MeshStandardMaterial({ color: 0xa8794f, roughness: 0.75 }),
  metal:     new THREE.MeshStandardMaterial({ color: 0x3c3c46, roughness: 0.45, metalness: 0.55 }),
  metalLight:new THREE.MeshStandardMaterial({ color: 0x8a8a99, roughness: 0.4, metalness: 0.6 }),
  gold:      new THREE.MeshStandardMaterial({ color: 0xf5b942, roughness: 0.35, metalness: 0.65 }),
  ice:       new THREE.MeshStandardMaterial({ color: 0xa8dcf0, emissive: 0x2e7fae, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.88 }),
  iceStone:  new THREE.MeshStandardMaterial({ color: 0x5f7f9f, roughness: 0.7 }),
  purple:    new THREE.MeshStandardMaterial({ color: 0x6b4fa0, roughness: 0.55 }),
  orb:       new THREE.MeshStandardMaterial({ color: 0xc9a7ff, emissive: 0x8a5fff, emissiveIntensity: 0.9, roughness: 0.25 }),
  darkBall:  new THREE.MeshStandardMaterial({ color: 0x24242c, roughness: 0.4, metalness: 0.4 }),
  white:     new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
  black:     new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.5 }),
  foliage:   new THREE.MeshStandardMaterial({ color: 0x1f4d2a, roughness: 0.9 }),
  rock:      new THREE.MeshStandardMaterial({ color: 0x767a85, roughness: 0.95 }),
};

// Boden mit Schachbrett-Textur
(function buildGround() {
  const tex = (() => {
    const c = document.createElement('canvas');
    c.width = COLS * 8; c.height = ROWS * 8;
    const g = c.getContext('2d');
    for (let r = 0; r < ROWS; r++) {
      for (let cc = 0; cc < COLS; cc++) {
        g.fillStyle = (cc + r) % 2 === 0 ? '#2f5136' : '#2a4a31';
        g.fillRect(cc * 8, r * 8, 8, 8);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  })();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS, ROWS),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Umland
  const skirt = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS + 14, ROWS + 14),
    new THREE.MeshStandardMaterial({ color: 0x223d28, roughness: 1 })
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -0.03;
  skirt.receiveShadow = true;
  scene.add(skirt);

  // Steinrahmen
  const frameMat = MAT.stoneDark;
  const mkFrame = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), frameMat);
    m.position.set(x, 0.12, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  mkFrame(COLS + 0.6, 0.3, 0, -(ROWS / 2 + 0.15));
  mkFrame(COLS + 0.6, 0.3, 0, ROWS / 2 + 0.15);
  mkFrame(0.3, ROWS + 0.6, -(COLS / 2 + 0.15), 0);
  mkFrame(0.3, ROWS + 0.6, COLS / 2 + 0.15, 0);

  // Deko: Bäume und Felsen außerhalb des Spielfelds
  const treeSpots = [
    [-11.6, -6.4], [-11.3, -1.2], [-11.7, 4.0], [11.5, -5.2], [11.8, 0.6], [11.4, 5.8],
    [-7.5, -8.4], [-2.0, -8.6], [3.5, -8.3], [8.5, -8.5],
    [-8.5, 8.4], [-3.0, 8.6], [2.5, 8.3], [7.5, 8.5], [-11.4, 8.2], [11.6, -8.2],
  ];
  for (const [x, z] of treeSpots) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.5, 6), MAT.wood);
    trunk.position.y = 0.25;
    const s = 0.8 + ((x * 13 + z * 7) % 10) / 20; // deterministische Größenvariation
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 8), MAT.foliage);
    leaf.position.y = 1.0;
    trunk.castShadow = leaf.castShadow = true;
    tree.add(trunk, leaf);
    tree.scale.setScalar(s);
    tree.position.set(x, 0, z);
    scene.add(tree);
  }
  const rockSpots = [[-11.0, 2.5], [11.2, -2.8], [5.8, -8.6], [-5.5, 8.6]];
  for (const [x, z] of rockSpots) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28), MAT.rock);
    rock.position.set(x, 0.18, z);
    rock.rotation.set(x, z, x + z);
    rock.castShadow = true;
    scene.add(rock);
  }
})();

// ---------- Kartenszene (Pfad, Anhöhen, Portale — pro Karte neu aufgebaut) ----------
const mapGroup = new THREE.Group();
scene.add(mapGroup);

const MAPGFX = {
  tileGeo: new THREE.BoxGeometry(0.98, 0.14, 0.98),
  tileMatA: new THREE.MeshStandardMaterial({ color: 0x8a6d46, roughness: 0.9 }),
  tileMatB: new THREE.MeshStandardMaterial({ color: 0x7f6440, roughness: 0.9 }),
  hillGeo: new THREE.BoxGeometry(0.98, HILL_H, 0.98),
  hillSide: new THREE.MeshStandardMaterial({ color: 0x6e6a5c, roughness: 0.95 }),
  hillTop: new THREE.MeshStandardMaterial({ color: 0x3f6b47, roughness: 0.9 }),
  portalGeo: new THREE.TorusGeometry(0.55, 0.09, 10, 24),
  portalGreen: new THREE.MeshStandardMaterial({ color: 0x2fae53, emissive: 0x2fae53, emissiveIntensity: 0.6, roughness: 0.4 }),
  portalRed: new THREE.MeshStandardMaterial({ color: 0xc93f3f, emissive: 0xc93f3f, emissiveIntensity: 0.6, roughness: 0.4 }),
};

function buildMapScene() {
  for (const o of [...mapGroup.children]) mapGroup.remove(o);

  // Pfad-Kacheln
  for (const key of pathCells) {
    const [c, r] = key.split(',').map(Number);
    const tile = new THREE.Mesh(MAPGFX.tileGeo, (c + r) % 2 === 0 ? MAPGFX.tileMatA : MAPGFX.tileMatB);
    tile.position.set(c - COLS / 2 + 0.5, 0.07, r - ROWS / 2 + 0.5);
    tile.receiveShadow = true;
    mapGroup.add(tile);
  }

  // Anhöhen: erhöhte Plateaus mit Grasdecke und Felskante
  for (const [c, r] of HILL_CELLS) {
    const hill = new THREE.Mesh(MAPGFX.hillGeo,
      [MAPGFX.hillSide, MAPGFX.hillSide, MAPGFX.hillTop, MAPGFX.hillSide, MAPGFX.hillSide, MAPGFX.hillSide]);
    hill.position.set(c - COLS / 2 + 0.5, HILL_H / 2, r - ROWS / 2 + 0.5);
    hill.castShadow = hill.receiveShadow = true;
    mapGroup.add(hill);
  }

  // Start- und Zielportal
  const mkPortal = (x, z, mat) => {
    const ring = new THREE.Mesh(MAPGFX.portalGeo, mat);
    ring.position.set(x, 0.62, z);
    ring.rotation.y = Math.PI / 2;
    ring.castShadow = true;
    mapGroup.add(ring);
  };
  mkPortal(-(COLS / 2 + 0.35), pxToWZ(waypoints[0].y), MAPGFX.portalGreen);
  mkPortal(COLS / 2 + 0.35, pxToWZ(waypoints[waypoints.length - 1].y), MAPGFX.portalRed);
}

// Kartenwechsel (setzt das Spiel zurück)
function loadMap(i) {
  if (i === currentMap || !MAPS[i]) return;
  if ((state.wave > 0 || (state.towers && state.towers.length > 0)) &&
      !window.confirm('Karte wechseln? Das laufende Spiel wird neu gestartet.')) {
    return;
  }
  try { localStorage.setItem('td3d-karte', String(i)); } catch (e) { /* egal */ }
  clearSave();
  loadMapData(i);
  buildMapScene();
  resetGame();
  updateMapButtons();
}

// ---------- Turm-Modelle (das Aussehen wächst mit der Stufe) ----------
const UP = new THREE.Vector3(0, 1, 0);

function addPart(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function makeTowerMesh(type, level) {
  const g = new THREE.Group();
  let turret = null;
  const gun = new THREE.Group(); // innerer Träger für den Rückstoß

  if (type === 'archer') {
    // Stufe 1: Holzwarte · Stufe 2: mit Fahne & Goldband · Stufe 3: Steinturm mit Zinnen & Ballista
    const h = [0, 0.83, 1.1, 1.38][level];
    addPart(g, new THREE.CylinderGeometry(0.4, 0.5, 0.35, 12), level >= 3 ? MAT.stoneDark : MAT.stone, 0, 0.175, 0);
    addPart(g, new THREE.CylinderGeometry(0.28, 0.36, h - 0.4, 12), level >= 3 ? MAT.stone : MAT.wood, 0, 0.3 + (h - 0.4) / 2, 0);
    addPart(g, new THREE.CylinderGeometry(0.4, 0.29, 0.12, 12), level >= 3 ? MAT.stoneDark : MAT.woodLight, 0, h - 0.04, 0);
    if (level >= 2) {
      const band = addPart(g, new THREE.TorusGeometry(0.33, 0.035, 8, 18), MAT.gold, 0, 0.44, 0);
      band.rotation.x = Math.PI / 2;
      // Fahnenmast mit Wimpel
      addPart(g, new THREE.CylinderGeometry(0.018, 0.018, 0.6, 6), MAT.metalLight, -0.28, h + 0.24, -0.28);
      const flag = addPart(g, new THREE.ConeGeometry(0.09, 0.26, 4),
        level >= 3 ? MAT.gold : new THREE.MeshStandardMaterial({ color: 0xc94f4f, roughness: 0.7 }),
        -0.15, h + 0.46, -0.28);
      flag.rotation.z = -Math.PI / 2;
    }
    if (level >= 3) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.26;
        addPart(g, new THREE.BoxGeometry(0.12, 0.15, 0.12), MAT.stoneDark, Math.cos(a) * 0.35, h + 0.06, Math.sin(a) * 0.35);
      }
    }
    // Armbrust / Ballista
    const s = [0, 1, 1.18, 1.38][level];
    turret = new THREE.Group();
    turret.position.y = h + 0.12;
    addPart(gun, new THREE.BoxGeometry(0.62 * s, 0.09, 0.09), MAT.woodLight, 0.08 * s, 0, 0);
    if (level >= 2) addPart(gun, new THREE.BoxGeometry(0.46 * s, 0.07, 0.07), MAT.wood, 0.02, 0.08, 0);
    const bow = addPart(gun, new THREE.TorusGeometry(0.22 * s, 0.035, 8, 18, Math.PI), MAT.metalLight, 0.26 * s, 0, 0);
    bow.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    if (level >= 3) {
      const bow2 = addPart(gun, new THREE.TorusGeometry(0.15 * s, 0.03, 8, 14, Math.PI), MAT.gold, 0.12 * s, 0, 0);
      bow2.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    }
    const tip = addPart(gun, new THREE.ConeGeometry(0.055 * s, 0.16 * s, 8), MAT.gold, 0.42 * s, 0, 0);
    tip.rotation.z = -Math.PI / 2;
    g.userData.muzzleY = h + 0.12;
  } else if (type === 'cannon') {
    // Stufe 1: Kuppelgeschütz · Stufe 2: gepanzert mit Goldring · Stufe 3: Doppelrohr mit Goldkappe
    const bs = [0, 1, 1.12, 1.22][level];
    addPart(g, new THREE.CylinderGeometry(0.46 * bs, 0.54 * bs, 0.3, 14), MAT.metal, 0, 0.15, 0);
    const ring = addPart(g, new THREE.TorusGeometry(0.42 * bs, 0.05, 8, 20), level >= 2 ? MAT.gold : MAT.stoneDark, 0, 0.31, 0);
    ring.rotation.x = Math.PI / 2;
    addPart(g, new THREE.SphereGeometry(0.33 * bs, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.metalLight, 0, 0.3, 0);
    if (level >= 2) {
      // Panzerplatten an Flanken und Heck
      for (const a of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const plate = addPart(g, new THREE.BoxGeometry(0.07, 0.26, 0.34), MAT.stoneDark, Math.cos(a) * 0.5 * bs, 0.2, Math.sin(a) * 0.5 * bs);
        plate.rotation.y = -a;
      }
    }
    if (level >= 3) addPart(g, new THREE.SphereGeometry(0.1, 10, 8), MAT.gold, 0, 0.3 + 0.33 * bs, 0);
    turret = new THREE.Group();
    turret.position.y = 0.42 + 0.07 * level;
    const len = [0, 0.6, 0.72, 0.72][level];
    for (const z of (level >= 3 ? [-0.13, 0.13] : [0])) {
      const barrel = addPart(gun, new THREE.CylinderGeometry(0.1, 0.13, len, 12), MAT.metal, 0.32, 0, z);
      barrel.rotation.z = -Math.PI / 2;
      const muzzle = addPart(gun, new THREE.TorusGeometry(0.12, 0.03, 8, 14), level >= 2 ? MAT.gold : MAT.metalLight, 0.32 + len / 2, 0, z);
      muzzle.rotation.y = Math.PI / 2;
      if (level >= 2) {
        const band = addPart(gun, new THREE.TorusGeometry(0.125, 0.025, 8, 14), MAT.stoneDark, 0.16, 0, z);
        band.rotation.y = Math.PI / 2;
      }
    }
    g.userData.muzzleY = turret.position.y;
  } else if (type === 'frost') {
    // Stufe 1: Eiskristall · Stufe 2: kreisende Splitter · Stufe 3: Eiszacken & Lichtring
    const bh = [0, 0.4, 0.5, 0.58][level];
    addPart(g, new THREE.CylinderGeometry(0.38, 0.46, bh, 12), MAT.iceStone, 0, bh / 2, 0);
    const rim = addPart(g, new THREE.TorusGeometry(0.33, 0.045, 8, 20), MAT.ice, 0, bh + 0.02, 0);
    rim.rotation.x = Math.PI / 2;
    const cs = [0, 0.27, 0.32, 0.38][level];
    const cy = bh + 0.42 + cs * 0.6;
    const crystal = addPart(g, new THREE.OctahedronGeometry(cs), MAT.ice, 0, cy, 0);
    g.userData.crystal = crystal;
    addPart(g, new THREE.OctahedronGeometry(0.1), MAT.ice, 0.24, bh + 0.12, -0.1);
    addPart(g, new THREE.OctahedronGeometry(0.08), MAT.ice, -0.2, bh + 0.1, 0.14);
    if (level >= 2) {
      const orbiter = new THREE.Group();
      orbiter.position.y = cy;
      const n = level >= 3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        addPart(orbiter, new THREE.OctahedronGeometry(0.09), MAT.ice, Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
      }
      g.add(orbiter);
      g.userData.orbiter = orbiter;
    }
    if (level >= 3) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const spike = addPart(g, new THREE.ConeGeometry(0.09, 0.36, 6), MAT.ice, Math.cos(a) * 0.5, 0.16, Math.sin(a) * 0.5);
        spike.quaternion.setFromUnitVectors(UP, new THREE.Vector3(Math.cos(a), 2.4, Math.sin(a)).normalize());
      }
      const halo = addPart(g, new THREE.TorusGeometry(0.5, 0.03, 8, 28), MAT.ice, 0, cy - 0.08, 0);
      halo.rotation.x = Math.PI / 2;
    }
    g.userData.muzzleY = cy;
  } else if (type === 'bolt') {
    // Stufe 1: Obelisk · Stufe 2: Ecksäulen & mehr Gold · Stufe 3: kreisende Funken-Orbs
    const ph = [0, 0.55, 0.64, 0.72][level];
    addPart(g, new THREE.BoxGeometry(ph, 0.16, ph), MAT.stoneDark, 0, 0.08, 0);
    if (level >= 2) {
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        addPart(g, new THREE.BoxGeometry(0.09, 0.34, 0.09), MAT.purple, sx * (ph / 2 - 0.05), 0.3, sz * (ph / 2 - 0.05));
        addPart(g, new THREE.SphereGeometry(0.05, 8, 6), MAT.orb, sx * (ph / 2 - 0.05), 0.51, sz * (ph / 2 - 0.05));
      }
    }
    const oh = [0, 0.85, 1.0, 1.15][level];
    addPart(g, new THREE.CylinderGeometry(0.13, 0.3, oh, 4), MAT.purple, 0, 0.16 + oh / 2, 0);
    for (let i = 0; i < level; i++) {
      const ring = addPart(g, new THREE.TorusGeometry(0.23 - i * 0.05, 0.028, 8, 16), MAT.gold, 0, 0.42 + i * 0.26, 0);
      ring.rotation.x = Math.PI / 2;
    }
    const os = [0, 0.15, 0.17, 0.2][level];
    const oy = 0.16 + oh + 0.14 + os;
    const orb = addPart(g, new THREE.SphereGeometry(os, 16, 12), MAT.orb, 0, oy, 0);
    orb.userData.baseY = oy;
    g.userData.orb = orb;
    if (level >= 3) {
      const orbiter = new THREE.Group();
      orbiter.position.y = oy;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        addPart(orbiter, new THREE.SphereGeometry(0.05, 8, 6), MAT.orb, Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34);
      }
      g.add(orbiter);
      g.userData.orbiter = orbiter;
    }
    g.userData.beamY = oy;
  } else if (type === 'guard') {
    // Begehbarer Wachturm: Kabine mit Sichtschlitz und Dach — wird pro Stufe höher
    const h = [0, 0.7, 0.9, 1.1][level]; // Kabinenboden
    addPart(g, new THREE.CylinderGeometry(0.4, 0.5, 0.35, 12), MAT.stoneDark, 0, 0.175, 0);
    addPart(g, new THREE.CylinderGeometry(0.26, 0.34, h - 0.3, 10), level >= 3 ? MAT.stone : MAT.wood, 0, 0.3 + (h - 0.3) / 2, 0);
    addPart(g, new THREE.BoxGeometry(0.62, 0.5, 0.62), level >= 3 ? MAT.stone : MAT.woodLight, 0, h + 0.25, 0);
    // Sichtschlitz (Blickrichtung +x)
    addPart(g, new THREE.BoxGeometry(0.05, 0.13, 0.42), MAT.black, 0.3, h + 0.33, 0);
    const roof = addPart(g, new THREE.ConeGeometry(0.52, 0.42, 4),
      level >= 2 ? new THREE.MeshStandardMaterial({ color: 0xa33d3d, roughness: 0.7 }) : MAT.wood,
      0, h + 0.71, 0);
    roof.rotation.y = Math.PI / 4;
    if (level >= 2) {
      const band = addPart(g, new THREE.TorusGeometry(0.32, 0.035, 8, 18), MAT.gold, 0, 0.45, 0);
      band.rotation.x = Math.PI / 2;
      addPart(g, new THREE.SphereGeometry(0.06, 8, 6), MAT.gold, 0, h + 0.96, 0);
    }
    if (level >= 3) {
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        addPart(g, new THREE.BoxGeometry(0.1, 0.12, 0.1), MAT.stoneDark, sx * 0.28, h + 0.55, sz * 0.28);
      }
    }
    // Geschütz an der Kabinenfront
    turret = new THREE.Group();
    turret.position.y = h + 0.3;
    addPart(gun, new THREE.BoxGeometry(0.5, 0.08, 0.08), MAT.metal, 0.4, 0, 0);
    const tip = addPart(gun, new THREE.ConeGeometry(0.05, 0.12, 8), MAT.gold, 0.66, 0, 0);
    tip.rotation.z = -Math.PI / 2;
    g.userData.muzzleY = h + 0.3;
    g.userData.eyeY = h + 0.42; // Augenhöhe in der Ego-Ansicht
  } else if (type === 'mortar') {
    // Betretbarer Mörser: schweres Rohr im 45°-Winkel auf Drehlafette
    const bs = [0, 1, 1.12, 1.22][level];
    addPart(g, new THREE.BoxGeometry(0.72 * bs, 0.14, 0.72 * bs), MAT.metal, 0, 0.07, 0);
    if (level >= 2) {
      const band = addPart(g, new THREE.TorusGeometry(0.4 * bs, 0.04, 8, 20), MAT.gold, 0, 0.15, 0);
      band.rotation.x = Math.PI / 2;
    }
    if (level >= 3) {
      // Munitionsstapel
      for (let i = 0; i < 3; i++) {
        addPart(g, new THREE.SphereGeometry(0.09, 10, 8), MAT.darkBall, -0.28, 0.2 + i * 0.02, 0.28 - i * 0.14);
      }
    }
    turret = new THREE.Group();
    turret.position.y = 0.2;
    for (const side of [-1, 1]) {
      addPart(gun, new THREE.BoxGeometry(0.34, 0.26, 0.06), MAT.metalLight, 0.02, 0.1, side * 0.17);
    }
    const barrel = addPart(gun, new THREE.CylinderGeometry(0.13 * bs, 0.17 * bs, 0.6, 12), MAT.metal, 0.18, 0.28, 0);
    barrel.rotation.z = -Math.PI / 4; // 45° nach oben
    const muzzle = addPart(gun, new THREE.TorusGeometry(0.14 * bs, 0.03, 8, 14), level >= 2 ? MAT.gold : MAT.metalLight, 0.38, 0.48, 0);
    muzzle.rotation.set(0, 0, Math.PI / 4);
    muzzle.rotateOnAxis(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    g.userData.muzzleY = 0.6;
    g.userData.eyeY = 0.75; // Sitzposition hinter dem Rohr
  } else if (type === 'poison') {
    // Giftkessel: brodelnder Trank — Stufe 2 mit Goldrand, Stufe 3 mit Dornenkranz
    const bh = [0, 0.18, 0.24, 0.3][level];
    addPart(g, new THREE.CylinderGeometry(0.36, 0.44, bh * 2, 12), MAT.stoneDark, 0, bh, 0);
    addPart(g, new THREE.CylinderGeometry(0.34, 0.24, 0.42, 12), MAT.metal, 0, bh * 2 + 0.21, 0);
    const brew = new THREE.MeshStandardMaterial({ color: 0x6fdc4f, emissive: 0x3f9e2a, emissiveIntensity: 0.8, roughness: 0.4 });
    addPart(g, new THREE.CylinderGeometry(0.29, 0.29, 0.05, 12), brew, 0, bh * 2 + 0.42, 0);
    if (level >= 2) {
      const rim = addPart(g, new THREE.TorusGeometry(0.33, 0.035, 8, 18), MAT.gold, 0, bh * 2 + 0.42, 0);
      rim.rotation.x = Math.PI / 2;
    }
    if (level >= 3) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const thorn = addPart(g, new THREE.ConeGeometry(0.06, 0.28, 6), brew, Math.cos(a) * 0.42, bh * 2 + 0.3, Math.sin(a) * 0.42);
        thorn.quaternion.setFromUnitVectors(UP, new THREE.Vector3(Math.cos(a), 1.6, Math.sin(a)).normalize());
      }
    }
    // Blubberblasen kreisen über dem Kessel
    const orbiter = new THREE.Group();
    orbiter.position.y = bh * 2 + 0.55;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      addPart(orbiter, new THREE.SphereGeometry(0.04 + i * 0.012, 8, 6), brew, Math.cos(a) * 0.16, i * 0.07, Math.sin(a) * 0.16);
    }
    g.add(orbiter);
    g.userData.orbiter = orbiter;
    g.userData.muzzleY = bh * 2 + 0.5;
  } else if (type === 'mine') {
    // Goldmine: Erzhaufen mit Nuggets — mehr Gold pro Stufe
    const r1 = addPart(g, new THREE.DodecahedronGeometry(0.34), MAT.rock, -0.08, 0.2, 0.05);
    r1.rotation.set(0.5, 1.1, 0.2);
    const r2 = addPart(g, new THREE.DodecahedronGeometry(0.24), MAT.rock, 0.22, 0.15, -0.16);
    r2.rotation.set(1.2, 0.3, 0.8);
    const r3 = addPart(g, new THREE.DodecahedronGeometry(0.18), MAT.rock, 0.02, 0.12, 0.3);
    r3.rotation.set(0.2, 2.1, 1.4);
    const spots = [[0.02, 0.44, 0.0], [-0.24, 0.28, -0.1], [0.3, 0.26, 0.1], [-0.08, 0.22, 0.32]];
    for (let i = 0; i <= level && i < spots.length; i++) {
      const nug = addPart(g, new THREE.OctahedronGeometry(0.08 + level * 0.015), MAT.gold, spots[i][0], spots[i][1], spots[i][2]);
      nug.rotation.set(i, i * 2, i * 0.7);
    }
    if (level >= 3) {
      addPart(g, new THREE.OctahedronGeometry(0.16),
        new THREE.MeshStandardMaterial({ color: 0xffd875, emissive: 0xcf9a2c, emissiveIntensity: 0.5, roughness: 0.3 }),
        0.0, 0.58, 0.0);
    }
  }

  if (turret) {
    turret.add(gun);
    g.add(turret);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.turret = turret;
  g.userData.gun = gun;
  g.userData.level = level;
  return g;
}

// Nach einem Upgrade das Modell durch die nächste Ausbaustufe ersetzen
function rebuildTowerMesh(t) {
  scene.remove(t.mesh);
  t.mesh = makeTowerMesh(t.type, t.level);
  t.mesh.position.set(t.cx - COLS / 2 + 0.5, t.onHill ? HILL_H : 0, t.cy - ROWS / 2 + 0.5);
  scene.add(t.mesh);
  if (t.mesh.userData.turret) t.mesh.userData.turret.rotation.y = -t.angle;
  addEquipBadge(t); // Ausrüstungs-Anhänger bleibt über Stufen erhalten
}

// ---------- Gegner-Modelle ----------
const enemyGeoCache = {};
function enemyGeo(rw) {
  const key = rw.toFixed(3);
  if (!enemyGeoCache[key]) enemyGeoCache[key] = new THREE.SphereGeometry(rw, 20, 14);
  return enemyGeoCache[key];
}
const eyeGeo = new THREE.SphereGeometry(1, 10, 8);

function makeEnemyMesh(typeKey) {
  const t = ENEMY_TYPES[typeKey];
  const rw = t.radius / CELL; // Weltradius
  const g = new THREE.Group();
  // Körperteile drehen sich in Laufrichtung, der Lebensbalken (direkt in g) nicht
  const bodyG = new THREE.Group();
  g.add(bodyG);
  let orbiter = null; // Geister-Orbs des Beschwörers

  const bodyMat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.6 });
  const body = new THREE.Mesh(enemyGeo(rw), bodyMat);
  body.castShadow = true;
  bodyG.add(body);

  // Augen (Blickrichtung +x)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, MAT.white);
    eye.scale.setScalar(rw * 0.28);
    eye.position.set(rw * 0.72, rw * 0.28, side * rw * 0.38);
    const pupil = new THREE.Mesh(eyeGeo, MAT.black);
    pupil.scale.setScalar(rw * 0.13);
    pupil.position.set(rw * 0.95, rw * 0.28, side * rw * 0.4);
    bodyG.add(eye, pupil);
  }

  if (typeKey === 'boss') {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(rw * 0.62, rw * 0.5, rw * 0.5, 8), MAT.gold);
    crown.position.y = rw * 1.15;
    crown.castShadow = true;
    bodyG.add(crown);
  } else if (typeKey === 'tank') {
    // Stahlhelm macht den Panzer sofort erkennbar
    const helm = new THREE.Mesh(new THREE.SphereGeometry(rw * 0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.metal);
    helm.position.y = rw * 0.4;
    helm.castShadow = true;
    bodyG.add(helm);
  } else if (typeKey === 'fast') {
    // Heckflossen für die Flinken
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(rw * 0.22, rw * 0.9, 6), bodyMat);
      fin.position.set(-rw * 0.75, rw * 0.15, side * rw * 0.45);
      fin.rotation.z = Math.PI / 2 + 0.35;
      fin.castShadow = true;
      bodyG.add(fin);
    }
  } else if (typeKey === 'healer') {
    // Sanitäter: weißer Körper mit rotem Kreuz
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xd94f4f, roughness: 0.6 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(rw * 0.95, rw * 0.3, rw * 0.3), crossMat);
    c1.position.y = rw * 1.2;
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(rw * 0.3, rw * 0.3, rw * 0.95), crossMat);
    c2.position.y = rw * 1.2;
    c1.castShadow = c2.castShadow = true;
    bodyG.add(c1, c2);
  } else if (typeKey === 'summoner') {
    // Zauberhut und kreisende Geister-Orbs
    const hat = new THREE.Mesh(new THREE.ConeGeometry(rw * 0.75, rw * 1.3, 8),
      new THREE.MeshStandardMaterial({ color: 0x2e2140, roughness: 0.8 }));
    hat.position.y = rw * 1.2;
    hat.castShadow = true;
    bodyG.add(hat);
    orbiter = new THREE.Group();
    orbiter.position.y = rw * 0.7;
    const orbMat = new THREE.MeshStandardMaterial({ color: 0x7be05a, emissive: 0x4faf35, emissiveIntensity: 0.9, roughness: 0.3 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(rw * 0.18, 8, 6), orbMat);
      orb.position.set(Math.cos(a) * rw * 1.5, 0, Math.sin(a) * rw * 1.5);
      orbiter.add(orb);
    }
    g.add(orbiter);
  }

  // Lebensbalken (Billboard-Sprites)
  const bw = (t.radius * 2.2) / CELL;
  const bgMat = new THREE.SpriteMaterial({ color: 0x101418, depthTest: false });
  const fgMat = new THREE.SpriteMaterial({ color: 0x5fd068, depthTest: false });
  const bg = new THREE.Sprite(bgMat);
  bg.scale.set(bw, 0.09, 1);
  bg.renderOrder = 10;
  const fg = new THREE.Sprite(fgMat);
  fg.center.set(0, 0.5);
  fg.position.x = -bw / 2;
  fg.scale.set(bw, 0.07, 1);
  fg.renderOrder = 11;
  const barY = rw * 2 + 0.28;
  bg.position.y = barY; fg.position.y = barY;
  g.add(bg, fg);

  g.userData = { body, bodyG, orbiter, bodyMat, bgMat, fgMat, fg, bw, rw, baseColor: t.color };
  return g;
}

function disposeEnemyMesh(g) {
  scene.remove(g);
  g.userData.bodyMat.dispose();
  g.userData.bgMat.dispose();
  g.userData.fgMat.dispose();
}

// ---------- Projektil-Modelle ----------
const projGeos = {
  archer: new THREE.ConeGeometry(0.05, 0.3, 8),
  cannon: new THREE.SphereGeometry(0.13, 12, 10),
  frost: new THREE.SphereGeometry(0.09, 12, 10),
};
const frostBallMat = new THREE.MeshStandardMaterial({ color: 0xa8dcf0, emissive: 0x4aa8d8, emissiveIntensity: 0.8, roughness: 0.3 });
const poisonBallMat = new THREE.MeshStandardMaterial({ color: 0x6fdc4f, emissive: 0x3f9e2a, emissiveIntensity: 0.8, roughness: 0.3 });

function makeProjectileMesh(type) {
  if (type === 'cannon') return new THREE.Mesh(projGeos.cannon, MAT.darkBall);
  if (type === 'frost') return new THREE.Mesh(projGeos.frost, frostBallMat);
  if (type === 'poison') return new THREE.Mesh(projGeos.frost, poisonBallMat);
  return new THREE.Mesh(projGeos.archer, MAT.woodLight);
}

// ---------- Anzeigen: Reichweite, Bauvorschau, Auswahl ----------
const rangeGroup = new THREE.Group();
{
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.1, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  rangeGroup.add(disc, ring);
  rangeGroup.position.y = 0.15;
  rangeGroup.visible = false;
  scene.add(rangeGroup);
}

const cellHighlight = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0x5fd068, transparent: true, opacity: 0.35, depthWrite: false })
);
cellHighlight.rotation.x = -Math.PI / 2;
cellHighlight.position.y = 0.16;
cellHighlight.visible = false;
scene.add(cellHighlight);

const selectRing = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.035, 8, 28), MAT.gold);
selectRing.rotation.x = Math.PI / 2;
selectRing.position.y = 0.14;
selectRing.visible = false;
scene.add(selectRing);

// Automatik-Sektor des Wachturms (Kreisausschnitt auf dem Boden)
const guardArc = new THREE.Mesh(
  new THREE.CircleGeometry(1, 24),
  new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })
);
guardArc.rotation.x = -Math.PI / 2;
guardArc.position.y = 0.17;
guardArc.visible = false;
scene.add(guardArc);

function showGuardArc(t) {
  const conf = TOWER_TYPES[t.type];
  const arc = conf.arc;
  const key = t.guardAngle.toFixed(3) + ':' + arc;
  if (guardArc.userData.key !== key) {
    guardArc.geometry.dispose();
    // Winkelabbildung: Logik-Winkel a -> Kreiswinkel -a (Z-Achse gespiegelt)
    guardArc.geometry = new THREE.CircleGeometry(1, 24, -t.guardAngle - arc, arc * 2);
    guardArc.userData.key = key;
  }
  const rw = (conf.range * RANGE_MULT[t.level - 1]) / CELL;
  guardArc.position.x = pxToWX(t.x);
  guardArc.position.z = pxToWZ(t.y);
  guardArc.scale.set(rw, rw, 1);
  guardArc.visible = true;
}

function showRangeAt(x, z, rangePx) {
  rangeGroup.position.x = x;
  rangeGroup.position.z = z;
  const rw = rangePx / CELL;
  rangeGroup.scale.set(rw, 1, rw);
  rangeGroup.visible = true;
}

// Durchsichtiger Vorschau-Turm, der beim Bauen am Zeiger "in der Hand" liegt
let ghost = null;
function setGhost(type) {
  if (ghost) {
    scene.remove(ghost);
    ghost.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    ghost = null;
  }
  if (!type) return;
  ghost = makeTowerMesh(type, 1);
  ghost.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.45;
      o.material.depthWrite = false;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  ghost.visible = false;
  scene.add(ghost);
}

// ---------- Spielzustand ----------
const state = {};

function clearActors() {
  if (state.enemies) for (const e of state.enemies) if (e.mesh) disposeEnemyMesh(e.mesh);
  if (state.towers) for (const t of state.towers) scene.remove(t.mesh);
  if (state.projectiles) for (const p of state.projectiles) scene.remove(p.mesh);
  if (state.beams) for (const b of state.beams) { scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); }
  if (state.particles) for (const p of state.particles) scene.remove(p.mesh);
  if (state.pulses) for (const pu of state.pulses) { scene.remove(pu.mesh); pu.mesh.geometry.dispose(); pu.mesh.material.dispose(); }
  if (state.floaters) for (const f of state.floaters) f.el.remove();
}

function resetGame() {
  if (state.controlled) exitTower();
  clearActors();
  state.controlled = null;
  state.kills = 0;
  state.manualKills = 0;
  state.gold = 140;
  state.lives = 20;
  state.wave = 0;
  state.phase = 'build';
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.beams = [];
  state.particles = [];
  state.pulses = [];
  state.floaters = [];
  state.spawnQueue = [];
  state.spawnTimer = 0;
  state.autoTimer = -1;
  state.speed = 1;
  state.paused = false;
  state.gameOver = false;
  state.victory = false;
  state.endless = false;
  state.buildType = null;
  setGhost(null);
  state.selectedTower = null;
  state.hoverCell = null;
  hideOverlay();
  hideTowerPanel();
  el.pauseOv.style.display = 'none';
  el.btnPause.textContent = '⏸';
  updateUI();
}

// ---------- Sound (WebAudio) ----------
let audioCtx = null;
let muted = false;

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function beep(freq, dur, type = 'square', vol = 0.05, slide = 0) {
  if (muted || !audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

const sfx = {
  shoot:   () => beep(520, 0.07, 'square', 0.025, -180),
  cannon:  () => beep(140, 0.22, 'triangle', 0.09, -70),
  frost:   () => beep(880, 0.09, 'sine', 0.035, -300),
  poison:  () => beep(240, 0.14, 'sine', 0.05, 160),
  summon:  () => { beep(320, 0.18, 'sawtooth', 0.05, 260); setTimeout(() => beep(480, 0.14, 'sawtooth', 0.04, 200), 120); },
  heal:    () => { beep(660, 0.1, 'sine', 0.035, 220); setTimeout(() => beep(880, 0.12, 'sine', 0.03, 180), 90); },
  bolt:    () => beep(1200, 0.12, 'sawtooth', 0.04, -900),
  guard:   () => beep(700, 0.06, 'square', 0.05, -260),
  hit:     () => beep(300, 0.05, 'triangle', 0.03, -100),
  death:   () => beep(220, 0.15, 'sawtooth', 0.04, -140),
  place:   () => beep(600, 0.1, 'sine', 0.06, 200),
  upgrade: () => { beep(500, 0.08, 'sine', 0.05, 250); setTimeout(() => beep(750, 0.1, 'sine', 0.05, 250), 80); },
  sell:    () => beep(400, 0.12, 'sine', 0.05, -150),
  leak:    () => beep(180, 0.3, 'sawtooth', 0.07, -80),
  wave:    () => { beep(440, 0.1, 'square', 0.04); setTimeout(() => beep(660, 0.12, 'square', 0.04), 110); },
  win:     () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'sine', 0.06), i * 140)); },
  lose:    () => { [400, 320, 240, 160].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'sawtooth', 0.05), i * 160)); },
};

// ---------- Wellen ----------
function waveHpScale(w) {
  // Linear bis ~Welle 8, danach zieht die Kurve an — Welle 20 ≈ 11,5×
  return 1 + (w - 1) * 0.32 + Math.pow(Math.max(0, w - 8), 1.6) * 0.08;
}

function buildWave(w) {
  const queue = [];
  const isBossWave = w % 5 === 0;
  const mod = MAPS[currentMap].waves || {};
  const fastEvery = mod.fastEvery || 3; // Kartencharakter: Schlucht schickt mehr Flinke,
  const tankEvery = mod.tankEvery || 4; // Serpentinen mehr Panzer
  let count = Math.min(6 + w * 2, 46);
  if (isBossWave) count = Math.max(4, Math.floor(count * 0.6));
  for (let i = 0; i < count; i++) {
    let type = 'normal';
    if (w >= 3 && i % fastEvery === fastEvery - 1) type = 'fast';
    if (w >= 5 && i % tankEvery === tankEvery - 1) type = 'tank';
    if (w >= 7 && i % 9 === 5) type = 'healer'; // Sanitäter mischen sich unter die Welle
    queue.push({ type, delay: type === 'fast' ? 0.55 : 0.85 });
  }
  if (isBossWave) {
    const bosses = 1 + Math.floor(w / 10);
    for (let i = 0; i < bosses; i++) queue.push({ type: 'boss', delay: 1.6 });
  }
  // Jede 10. Welle bringt einen Beschwörer mit, der unterwegs Diener ruft
  if (w % 10 === 0) queue.push({ type: 'summoner', delay: 2 });
  return queue;
}

function startWave() {
  if (state.phase !== 'build' || state.gameOver) return;
  if (state.autoTimer > 0) {
    const bonus = Math.ceil(state.autoTimer) * 2;
    state.gold += bonus;
    addFloater(W - 120, 60, '+' + bonus + ' 💰', '#f5b942');
  }
  state.wave++;
  state.phase = 'wave';
  state.spawnQueue = buildWave(state.wave);
  state.spawnTimer = 0.5;
  state.autoTimer = -1;
  sfx.wave();
  updateUI();
}

// ---------- Erfolge ----------
const ACHIEVEMENTS = {
  sieg:       { icon: '🏆', name: 'Sieger', desc: 'Alle 20 Wellen überstanden' },
  perfekt:    { icon: '💎', name: 'Makellos', desc: 'Sieg ohne ein einziges verlorenes Leben' },
  schuetze:   { icon: '🎯', name: 'Scharfschütze', desc: '15 Gegner selbst im Wachturm abgeschossen' },
  magnat:     { icon: '⛏️', name: 'Goldmagnat', desc: '3 Goldminen gleichzeitig besitzen' },
  vollausbau: { icon: '🛠️', name: 'Vollausbau', desc: 'Ein Turm auf Stufe 3 mit Ausrüstung' },
  marathon:   { icon: '🌊', name: 'Marathon', desc: 'Welle 25 im Endlosmodus erreicht' },
};
let unlockedAch = new Set();
try { unlockedAch = new Set(JSON.parse(localStorage.getItem('td3d-erfolge') || '[]')); } catch (e) { /* egal */ }

function unlock(key) {
  if (unlockedAch.has(key) || !ACHIEVEMENTS[key]) return;
  unlockedAch.add(key);
  try { localStorage.setItem('td3d-erfolge', JSON.stringify([...unlockedAch])); } catch (e) { /* egal */ }
  const a = ACHIEVEMENTS[key];
  const toast = document.createElement('div');
  toast.className = 'ach-toast';
  toast.textContent = a.icon + ' Erfolg freigeschaltet: ' + a.name;
  wrap.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
  sfx.upgrade();
  renderAchPanel();
}

function renderAchPanel() {
  el.achPanel.innerHTML = '<h3>🏆 Erfolge (' + unlockedAch.size + '/' + Object.keys(ACHIEVEMENTS).length + ')</h3>' +
    Object.entries(ACHIEVEMENTS).map(([key, a]) =>
      '<div class="ach' + (unlockedAch.has(key) ? ' done' : '') + '">' +
      a.icon + ' <b>' + a.name + '</b><br><small>' + a.desc + '</small></div>'
    ).join('');
}

// Beste Welle dauerhaft im Browser speichern — getrennt pro Karte
function loadBestFor(mapIdx) {
  try { return parseInt(localStorage.getItem('td3d-beste-welle-' + mapIdx) || '0', 10) || 0; }
  catch (e) { return 0; }
}
function loadBest() { return loadBestFor(currentMap); }
function saveBest(w) {
  try {
    if (w > loadBest()) {
      localStorage.setItem('td3d-beste-welle-' + currentMap, String(w));
      updateMapButtons();
    }
  } catch (e) { /* z. B. Speicher blockiert — dann eben ohne Highscore */ }
}

// ---------- Spielstand (automatisch nach jeder Welle gesichert) ----------
const SAVE_KEY = 'td3d-spielstand';
let restoringGame = false;

function saveGame() {
  if (restoringGame || state.gameOver || state.wave === 0) return;
  const data = {
    map: currentMap,
    wave: state.wave,
    gold: state.gold,
    lives: state.lives,
    kills: state.kills,
    manualKills: state.manualKills,
    endless: state.endless,
    towers: state.towers.map(t => ({
      type: t.type, cx: t.cx, cy: t.cy, level: t.level,
      equip: t.equip, guardAngle: t.guardAngle, invested: t.invested,
    })),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* egal */ }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* egal */ }
}

function tryLoadGame() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return false; }
  if (!data || !Array.isArray(data.towers) || !(data.wave >= 1)) return false;
  restoringGame = true;
  if (data.map !== currentMap && MAPS[data.map]) {
    loadMapData(data.map);
    buildMapScene();
    updateMapButtons();
  }
  resetGame();
  state.wave = data.wave;
  state.lives = data.lives;
  state.kills = data.kills || 0;
  state.manualKills = data.manualKills || 0;
  state.endless = !!data.endless;
  for (const td of data.towers) {
    if (!TOWER_TYPES[td.type] || !isBuildable(td.cx, td.cy, td.type)) continue;
    state.gold = 1e9;
    if (!placeTower(td.cx, td.cy, td.type)) continue;
    const t = state.towers[state.towers.length - 1];
    t.level = Math.min(MAX_LEVEL, td.level || 1);
    t.equip = td.equip && EQUIP[td.equip] ? td.equip : null;
    t.invested = td.invested || TOWER_TYPES[td.type].cost;
    if (typeof td.guardAngle === 'number') { t.guardAngle = td.guardAngle; t.angle = td.guardAngle; }
    rebuildTowerMesh(t);
  }
  state.gold = data.gold;
  state.phase = 'build';
  state.autoTimer = -1;
  restoringGame = false;
  updateUI();
  addFloater(W / 2, H / 2 - 40, '💾 Spielstand geladen — weiter mit Welle ' + (state.wave + 1), '#5da9e8');
  return true;
}
function statsText(prefix) {
  return prefix + ' · Abschüsse: ' + state.kills + ' · Beste Welle: ' + loadBest();
}

function endWave() {
  state.phase = 'build';
  const bonus = 25 + state.wave * 3;
  state.gold += bonus;
  // Goldminen schütten aus
  for (const t of state.towers) {
    if (t.type !== 'mine') continue;
    const inc = Math.round(TOWER_TYPES.mine.income * LEVEL_MULT[t.level - 1]);
    state.gold += inc;
    addFloater(t.x, t.y, '+' + inc + ' 💰', '#f5b942');
  }
  saveBest(state.wave);
  if (state.wave >= 25) unlock('marathon');
  addFloater(W / 2, H / 2 - 40, 'Welle geschafft! +' + bonus + ' 💰', '#5fd068');
  if (state.wave >= TOTAL_WAVES && !state.endless) {
    state.victory = true;
    state.gameOver = true;
    sfx.win();
    unlock('sieg');
    if (state.lives === 20) unlock('perfekt');
    clearSave();
    showOverlay('🏆 Sieg!', statsText('Du hast alle ' + TOTAL_WAVES + ' Wellen überstanden!'), true);
  } else {
    state.autoTimer = 12;
    saveGame(); // Spielstand nach jeder geschafften Welle sichern
  }
  updateUI();
}

// ---------- Gegner ----------
function spawnEnemy(typeKey, opts = {}) {
  const t = ENEMY_TYPES[typeKey];
  const scale = waveHpScale(state.wave) * (opts.hpMult || 1);
  const mesh = makeEnemyMesh(typeKey);
  scene.add(mesh);
  state.enemies.push({
    type: typeKey,
    x: opts.x !== undefined ? opts.x : waypoints[0].x,
    y: opts.y !== undefined ? opts.y : waypoints[0].y,
    wp: opts.wp !== undefined ? opts.wp : 1,
    hp: t.hp * scale,
    maxHp: t.hp * scale,
    speed: t.speed,
    radius: t.radius,
    reward: Math.round(t.reward * (1 + state.wave * 0.04) * (opts.rewardMult || 1)),
    lives: t.lives,
    slowT: 0,
    slowFactor: 1,
    poisonT: 0,
    poisonDps: 0,
    dist: opts.dist || 0,
    dead: false,
    hitFlash: 0,
    summonT: typeKey === 'summoner' ? 3 : 0,
    healT: typeKey === 'healer' ? 2 : 0,
    dirX: 1, dirY: 0,
    wobble: Math.random() * Math.PI * 2,
    mesh,
  });
  mesh.userData.enemy = state.enemies[state.enemies.length - 1];
}

function updateEnemies(dt) {
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.poisonT > 0) {
      e.poisonT -= dt;
      e.hp -= e.poisonDps * dt;
      if (e.hp <= 0) { killEnemy(e); continue; }
    }
    // Beschwörer rufen unterwegs Diener herbei
    if (e.type === 'summoner' && e.wp < waypoints.length) {
      e.summonT -= dt;
      if (e.summonT <= 0) {
        e.summonT = 4.5;
        for (let k = 0; k < 2; k++) {
          spawnEnemy('normal', { x: e.x, y: e.y, wp: e.wp, dist: e.dist, hpMult: 0.4, rewardMult: 0.5 });
        }
        spawnParticles(e.x, e.y, 0x7be05a, 12);
        sfx.summon();
      }
    }
    // Heiler regenerieren verletzte Gegner in der Nähe (aber keine anderen Heiler)
    if (e.type === 'healer' && e.wp < waypoints.length) {
      e.healT -= dt;
      if (e.healT <= 0) {
        e.healT = HEAL_INTERVAL;
        const amount = 12 * waveHpScale(state.wave);
        let healed = false;
        for (const o of state.enemies) {
          if (o.dead || o === e || o.type === 'healer') continue;
          if (o.hp < o.maxHp && Math.hypot(o.x - e.x, o.y - e.y) <= HEAL_RANGE) {
            o.hp = Math.min(o.maxHp, o.hp + amount);
            healed = true;
          }
        }
        if (healed) {
          spawnHealPulse(e.x, e.y);
          sfx.heal();
        }
      }
    }
    const spd = e.speed * (e.slowT > 0 ? e.slowFactor : 1);
    let move = spd * dt;
    while (move > 0 && e.wp < waypoints.length) {
      const tgt = waypoints[e.wp];
      const dx = tgt.x - e.x, dy = tgt.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) { e.dirX = dx / d; e.dirY = dy / d; }
      if (d <= move) {
        e.x = tgt.x; e.y = tgt.y;
        e.dist += d; move -= d;
        e.wp++;
      } else {
        e.x += (dx / d) * move;
        e.y += (dy / d) * move;
        e.dist += move;
        move = 0;
      }
    }
    if (e.wp >= waypoints.length) {
      e.dead = true;
      state.lives -= e.lives;
      sfx.leak();
      addFloater(W - 60, waypoints[waypoints.length - 1].y, '-' + e.lives + ' ❤️', '#e85d5d');
      if (state.lives <= 0 && !state.gameOver) {
        state.lives = 0;
        state.gameOver = true;
        sfx.lose();
        saveBest(state.wave - 1);
        clearSave();
        showOverlay('💀 Game Over', statsText('Du hast Welle ' + state.wave + ' erreicht'), false);
      }
      updateUI();
    }
  }
  for (const e of state.enemies) if (e.dead && e.mesh) { disposeEnemyMesh(e.mesh); e.mesh = null; }
  state.enemies = state.enemies.filter(e => !e.dead);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  state.gold += e.reward;
  state.kills++;
  sfx.death();
  addFloater(e.x, e.y - 14, '+' + e.reward, '#f5b942');
  spawnParticles(e.x, e.y, ENEMY_TYPES[e.type].color, e.type === 'boss' ? 26 : 12);
  updateUI();
}

function damageEnemy(e, dmg, slow, poison) {
  if (e.dead) return;
  e.hp -= dmg;
  if (slow) {
    e.slowT = Math.max(e.slowT, slow.dur);
    e.slowFactor = slow.factor;
  }
  if (poison) {
    e.poisonT = Math.max(e.poisonT, poison.dur);
    e.poisonDps = Math.max(e.poisonDps, poison.dps);
  }
  e.hitFlash = 1;
  if (e.hp <= 0) killEnemy(e);
  else sfx.hit();
}

// ---------- Türme ----------
function towerStats(t) {
  const base = TOWER_TYPES[t.type];
  const li = t.level - 1;
  const eq = t.equip ? EQUIP[t.equip] : null;
  return {
    dmg: base.dmg * LEVEL_MULT[li] * (eq && eq.dmg ? eq.dmg : 1),
    // Anhöhe = bessere Sicht: +10 % Reichweite
    range: base.range * RANGE_MULT[li] * (eq && eq.range ? eq.range : 1) * (t.onHill ? 1.1 : 1),
    rate: base.rate * RATE_MULT[li] * (eq && eq.rate ? eq.rate : 1),
  };
}

function addEquipBadge(t) {
  if (!t.equip) return;
  const eq = EQUIP[t.equip];
  const badge = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.09),
    new THREE.MeshStandardMaterial({ color: eq.color, emissive: eq.color, emissiveIntensity: 0.5, roughness: 0.3 })
  );
  badge.position.set(0.42, 0.55, 0.42);
  t.mesh.add(badge);
  t.mesh.userData.badge = badge;
}

function equipTower(t, key) {
  if (t.equip || t.type === 'mine' || !EQUIP[key] || state.gold < EQUIP[key].cost) return;
  state.gold -= EQUIP[key].cost;
  t.invested += EQUIP[key].cost;
  t.equip = key;
  addEquipBadge(t);
  sfx.upgrade();
  spawnParticles(t.x, t.y, EQUIP[key].color, 10);
  if (t.level >= MAX_LEVEL) unlock('vollausbau');
  updateUI();
  if (state.phase === 'build') saveGame();
}

// Blickrichtung zum nächstgelegenen Pfadfeld (Standard-Sektor des Wachturms)
function angleToNearestPath(cx, cy) {
  let bestD = Infinity, bestA = 0;
  for (const key of pathCells) {
    const [c, r] = key.split(',').map(Number);
    const dx = c - cx, dy = r - cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; bestA = Math.atan2(dy, dx); }
  }
  return bestA;
}

function placeTower(cx, cy, type) {
  const cost = TOWER_TYPES[type].cost;
  if (state.gold < cost) return false;
  if (!isBuildable(cx, cy, type)) return false;
  state.gold -= cost;
  const onHill = isHillCell(cx, cy);
  const mesh = makeTowerMesh(type, 1);
  mesh.position.set(cx - COLS / 2 + 0.5, onHill ? HILL_H : 0, cy - ROWS / 2 + 0.5);
  scene.add(mesh);
  const guardAngle = TOWER_TYPES[type].arc ? angleToNearestPath(cx, cy) : 0;
  state.towers.push({
    type, cx, cy, onHill,
    x: (cx + 0.5) * CELL,
    y: (cy + 0.5) * CELL,
    level: 1,
    cooldown: 0,
    invested: cost,
    angle: guardAngle,
    guardAngle,
    manualCd: 0,
    recoil: 0,
    equip: null,
    mesh,
  });
  sfx.place();
  spawnParticles((cx + 0.5) * CELL, (cy + 0.5) * CELL, 0xf5b942, 10);
  if (type === 'mine' && state.towers.filter(t => t.type === 'mine').length >= 3) unlock('magnat');
  updateUI();
  if (state.phase === 'build') saveGame();
  return true;
}

function isBuildable(cx, cy, type) {
  if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return false;
  if (pathCells.has(cx + ',' + cy)) return false;
  if (state.towers.some(t => t.cx === cx && t.cy === cy)) return false;
  if (type) {
    const terr = TOWER_TYPES[type].terrain;
    const hill = isHillCell(cx, cy);
    if (terr === 'ground' && hill) return false; // schwere Türme nur auf ebenem Boden
    if (terr === 'hill' && !hill) return false;  // Fernkämpfer brauchen die Anhöhe
  }
  return true;
}

function updateTowers(dt) {
  for (const t of state.towers) {
    if (t.type === 'mine') continue; // Goldminen kämpfen nicht
    if (t.manualCd > 0) t.manualCd -= dt;
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    if (t === state.controlled) continue; // im gesteuerten Turm schießt der Spieler selbst
    const s = towerStats(t);
    let best = null;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d > s.range) continue;
      if (TOWER_TYPES[t.type].arc) {
        // Automatik nur im schmalen Sektor um die Wachrichtung
        const da = Math.atan2(e.y - t.y, e.x - t.x) - t.guardAngle;
        if (Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) > TOWER_TYPES[t.type].arc) continue;
      }
      if (!best || e.dist > best.dist) best = e;
    }
    if (!best) continue;
    t.cooldown = 1 / s.rate;
    t.angle = Math.atan2(best.y - t.y, best.x - t.x);
    t.recoil = 1;
    const base = TOWER_TYPES[t.type];
    if (base.laser) {
      damageEnemy(best, s.dmg);
      addBeam(t, best);
      sfx.bolt();
    } else {
      const mesh = makeProjectileMesh(t.type);
      mesh.position.set(pxToWX(t.x), (t.mesh.userData.muzzleY || 0.6) + (t.onHill ? HILL_H : 0), pxToWZ(t.y));
      scene.add(mesh);
      state.projectiles.push({
        x: t.x, y: t.y,
        target: best,
        tx: best.x, ty: best.y,
        speed: base.projSpeed,
        dmg: s.dmg,
        splash: base.splash || 0,
        slow: base.slow || null,
        poison: base.poison
          ? { dps: base.poison.dps * LEVEL_MULT[t.level - 1], dur: base.poison.dur }
          : null,
        lob: !!base.lob,
        traveled: 0,
        type: t.type,
        mesh,
      });
      if (t.type === 'cannon' || t.type === 'mortar') sfx.cannon();
      else if (t.type === 'frost') sfx.frost();
      else if (t.type === 'poison') sfx.poison();
      else sfx.shoot();
    }
  }
}

// ---------- Blitzstrahlen ----------
function addBeam(t, e) {
  const from = new THREE.Vector3(pxToWX(t.x), (t.mesh.userData.beamY || 1.18) + (t.onHill ? HILL_H : 0), pxToWZ(t.y));
  const to = new THREE.Vector3(pxToWX(e.x), ENEMY_TYPES[e.type].radius / CELL, pxToWZ(e.y));
  const pts = [from];
  const segs = 6;
  for (let i = 1; i < segs; i++) {
    const f = i / segs;
    pts.push(new THREE.Vector3(
      from.x + (to.x - from.x) * f + (Math.random() - 0.5) * 0.3,
      from.y + (to.y - from.y) * f + (Math.random() - 0.5) * 0.3,
      from.z + (to.z - from.z) * f + (Math.random() - 0.5) * 0.3
    ));
  }
  pts.push(to);
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0xc9a7ff, transparent: true, opacity: 1 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  state.beams.push({ line, ttl: 0.14, maxTtl: 0.14 });
  spawnParticles(e.x, e.y, 0xc9a7ff, 6);
}

// ---------- Projektile ----------
function updateProjectiles(dt) {
  for (const p of state.projectiles) {
    if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d <= step + 6) {
      p.hit = true;
      if (p.splash > 0) {
        spawnParticles(p.tx, p.ty, 0xffb347, 16);
        spawnPulse(p.tx, p.ty, 0xffb347, p.splash);
        for (const e of state.enemies) {
          if (!e.dead && Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash + e.radius) {
            damageEnemy(e, p.dmg, p.slow, p.poison);
          }
        }
      } else if (p.target && !p.target.dead) {
        damageEnemy(p.target, p.dmg, p.slow, p.poison);
      }
    } else {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      if (p.lob) p.traveled += step;
    }
  }
  for (const p of state.projectiles) if (p.hit && p.mesh) { scene.remove(p.mesh); p.mesh = null; }
  state.projectiles = state.projectiles.filter(p => !p.hit);

  for (const b of state.beams) {
    b.ttl -= dt;
    if (b.ttl <= 0) {
      scene.remove(b.line);
      b.line.geometry.dispose();
      b.line.material.dispose();
    } else {
      b.line.material.opacity = b.ttl / b.maxTtl;
    }
  }
  state.beams = state.beams.filter(b => b.ttl > 0);
}

// ---------- Partikel (3D) ----------
const particleGeo = new THREE.SphereGeometry(1, 8, 6);
const particleMatCache = {};
function particleMat(color) {
  if (!particleMatCache[color]) {
    particleMatCache[color] = new THREE.MeshBasicMaterial({ color });
  }
  return particleMatCache[color];
}

function spawnParticles(xPx, yPx, color, n) {
  const wx = pxToWX(xPx), wz = pxToWZ(yPx);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 1 + Math.random() * 2.5;
    const mesh = new THREE.Mesh(particleGeo, particleMat(color));
    const size = 0.04 + Math.random() * 0.07;
    mesh.scale.setScalar(size);
    mesh.position.set(wx, 0.3 + Math.random() * 0.3, wz);
    scene.add(mesh);
    state.particles.push({
      mesh, size,
      vx: Math.cos(a) * v,
      vy: 1.5 + Math.random() * 2.5,
      vz: Math.sin(a) * v,
      ttl: 0.4 + Math.random() * 0.4,
      maxTtl: 0.8,
    });
  }
}

function updateParticles(dt) {
  for (const p of state.particles) {
    p.vy -= 9 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y = Math.max(0.03, p.mesh.position.y + p.vy * dt);
    p.mesh.position.z += p.vz * dt;
    p.ttl -= dt;
    p.mesh.scale.setScalar(Math.max(0.001, p.size * (p.ttl / p.maxTtl)));
    if (p.ttl <= 0) scene.remove(p.mesh);
  }
  state.particles = state.particles.filter(p => p.ttl > 0);

  // Ring-Pulse (Heilung, Explosionen) wachsen und verblassen
  for (const pu of state.pulses) {
    pu.ttl -= dt;
    const f = 1 - pu.ttl / pu.maxTtl;
    const r = 0.3 + f * (pu.range / CELL);
    pu.mesh.scale.set(r, r, 1);
    pu.mesh.material.opacity = 0.7 * (pu.ttl / pu.maxTtl);
    if (pu.ttl <= 0) {
      scene.remove(pu.mesh);
      pu.mesh.geometry.dispose();
      pu.mesh.material.dispose();
    }
  }
  state.pulses = state.pulses.filter(pu => pu.ttl > 0);
}

function spawnPulse(xPx, yPx, color, rangePx) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pxToWX(xPx), 0.18, pxToWZ(yPx));
  scene.add(ring);
  state.pulses.push({ mesh: ring, ttl: 0.6, maxTtl: 0.6, range: rangePx });
}

function spawnHealPulse(xPx, yPx) {
  spawnPulse(xPx, yPx, 0x7be05a, HEAL_RANGE);
}

// ---------- Schwebende Texte (HTML-Overlay) ----------
const wrap = document.getElementById('game-wrap');

function addFloater(xPx, yPx, text, color) {
  const div = document.createElement('div');
  div.className = 'floater';
  div.textContent = text;
  div.style.color = color;
  wrap.appendChild(div);
  state.floaters.push({
    el: div,
    pos: new THREE.Vector3(pxToWX(xPx), 0.8, pxToWZ(yPx)),
    ttl: 1.4,
  });
}

const projVec = new THREE.Vector3();
function worldToScreen(v) {
  projVec.copy(v).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return {
    x: (projVec.x * 0.5 + 0.5) * r.width,
    y: (-projVec.y * 0.5 + 0.5) * r.height,
    behind: projVec.z > 1,
  };
}

function updateFloaters(dt) {
  for (const f of state.floaters) {
    f.ttl -= dt;
    f.pos.y += 0.9 * dt;
    if (f.ttl <= 0) { f.el.remove(); continue; }
    const s = worldToScreen(f.pos);
    f.el.style.left = s.x + 'px';
    f.el.style.top = s.y + 'px';
    f.el.style.opacity = Math.min(1, f.ttl);
  }
  state.floaters = state.floaters.filter(f => f.ttl > 0);
}

// ---------- Wachturm-Steuerung (Ego-Ansicht) ----------
const fp = { yaw: 0, pitch: 0.06, locked: false, drag: { active: false, moved: 0, lastX: 0, lastY: 0 } };

function enterTower(t) {
  if (state.controlled || !TOWER_TYPES[t.type].enterable) return;
  state.controlled = t;
  state.buildType = null;
  state.selectedTower = null;
  hideTowerPanel();
  updateShopButtons();
  fp.yaw = t.guardAngle;
  fp.pitch = 0.06;
  t.mesh.visible = false;
  camera.fov = 60;
  camera.updateProjectionMatrix();
  el.fpHud.style.display = 'block';
  // Maus einfangen, wo möglich (sonst: Ziehen zum Zielen)
  if (renderer.domElement.requestPointerLock) {
    try { renderer.domElement.requestPointerLock(); } catch (e) { /* Fallback: Drag */ }
  }
}

function exitTower() {
  const t = state.controlled;
  if (!t) return;
  t.guardAngle = fp.yaw; // Blickrichtung wird zur neuen Wachrichtung
  t.angle = fp.yaw;
  state.controlled = null;
  t.mesh.visible = true;
  camera.fov = 42;
  camera.updateProjectionMatrix();
  el.fpHud.style.display = 'none';
  if (document.pointerLockElement) document.exitPointerLock();
  updateCamera();
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && !state.controlled) {
    // Lock kam an, obwohl der Turm schon wieder verlassen wurde -> sofort freigeben
    document.exitPointerLock();
    return;
  }
  if (!locked && fp.locked && state.controlled) exitTower(); // Esc bei Pointer-Lock
  fp.locked = locked;
});

function updateFPCamera() {
  const t = state.controlled;
  const eyeY = (t.mesh.userData.eyeY || 1.2) + (t.onHill ? HILL_H : 0);
  camera.position.set(pxToWX(t.x), eyeY, pxToWZ(t.y));
  const cp = Math.cos(fp.pitch);
  camera.lookAt(
    camera.position.x + Math.cos(fp.yaw) * cp,
    camera.position.y - Math.sin(fp.pitch),
    camera.position.z + Math.sin(fp.yaw) * cp
  );
}

function aimFP(dx, dy) {
  fp.yaw += dx * 0.0032;
  fp.pitch = Math.min(0.9, Math.max(-0.5, fp.pitch + dy * 0.0032));
}

const tracerFrom = new THREE.Vector3();
const tracerTo = new THREE.Vector3();

function manualShoot() {
  const t = state.controlled;
  if (!t || t.manualCd > 0 || state.paused || state.gameOver) return;
  const m = TOWER_TYPES[t.type].manual;
  t.manualCd = 1 / m.rate;
  t.recoil = 1;
  const dmg = m.dmg * LEVEL_MULT[t.level - 1] * (t.equip === 'ammo' ? EQUIP.ammo.dmg : 1);
  const rangeW = m.range / CELL;
  camera.updateMatrixWorld(true); // Blickrichtung kann sich seit dem letzten Frame geändert haben
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);

  if (t.type === 'mortar') {
    // Artillerie: Granate fliegt im Bogen zum anvisierten Bodenpunkt
    if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
    let tx = (hitPoint.x + COLS / 2) * CELL;
    let ty = (hitPoint.z + ROWS / 2) * CELL;
    const dx = tx - t.x, dy = ty - t.y;
    const d = Math.hypot(dx, dy);
    if (d > m.range) { tx = t.x + (dx / d) * m.range; ty = t.y + (dy / d) * m.range; }
    t.angle = Math.atan2(ty - t.y, tx - t.x);
    const mesh = makeProjectileMesh('cannon');
    mesh.scale.setScalar(1.3);
    mesh.position.set(pxToWX(t.x), (t.mesh.userData.muzzleY || 0.5) + (t.onHill ? HILL_H : 0), pxToWZ(t.y));
    scene.add(mesh);
    state.projectiles.push({
      x: t.x, y: t.y, target: null, tx, ty,
      speed: 300, dmg, splash: m.splash, slow: null, poison: null,
      lob: true, traveled: 0, type: 'cannon', mesh,
    });
    sfx.cannon();
    return;
  }
  const meshes = [];
  for (const e of state.enemies) if (e.mesh) meshes.push(e.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  tracerFrom.copy(camera.position);
  tracerFrom.y -= 0.06;
  let hitEnemy = null;
  if (hits.length && hits[0].distance <= rangeW) {
    let obj = hits[0].object;
    while (obj && !(obj.userData && obj.userData.enemy)) obj = obj.parent;
    if (obj && obj.userData.enemy && !obj.userData.enemy.dead) {
      hitEnemy = obj.userData.enemy;
      tracerTo.copy(hits[0].point);
    }
  }
  if (!hitEnemy) {
    tracerTo.copy(raycaster.ray.direction).multiplyScalar(rangeW).add(camera.position);
  }
  const geo = new THREE.BufferGeometry().setFromPoints([tracerFrom.clone(), tracerTo.clone()]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 1 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  state.beams.push({ line, ttl: 0.09, maxTtl: 0.09 });
  sfx.guard();
  if (hitEnemy) {
    spawnParticles(hitEnemy.x, hitEnemy.y, 0xffd27a, 6);
    damageEnemy(hitEnemy, dmg);
    if (hitEnemy.dead) {
      state.manualKills++;
      if (state.manualKills >= 15) unlock('schuetze');
    }
  }
}

// ---------- Haupt-Update (Spiellogik) ----------
function update(dt) {
  if (state.phase === 'wave') {
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const s = state.spawnQueue.shift();
        spawnEnemy(s.type);
        state.spawnTimer = s.delay;
      }
    } else if (state.enemies.length === 0 && !state.gameOver) {
      endWave();
    }
  } else if (state.autoTimer > 0 && !state.gameOver) {
    state.autoTimer -= dt;
    if (state.autoTimer <= 0) startWave();
    else updateWaveButton();
  }
  updateEnemies(dt);
  updateTowers(dt);
  updateProjectiles(dt);
  updateParticles(dt);
}

// ---------- Szene synchronisieren (jeden Frame) ----------
const upVec = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();

function syncScene(rawDt) {
  // Gegner
  for (const e of state.enemies) {
    if (!e.mesh) continue;
    e.wobble += rawDt * 7;
    const rw = e.radius / CELL;
    const bob = Math.abs(Math.sin(e.wobble)) * 0.06;
    e.mesh.position.set(pxToWX(e.x), rw + bob, pxToWZ(e.y));
    e.mesh.userData.bodyG.rotation.y = -Math.atan2(e.dirY, e.dirX);
    // Status-Färbung: verlangsamt = blau, vergiftet = grün
    e.mesh.userData.bodyMat.color.set(
      e.slowT > 0 ? SLOW_TINT : e.poisonT > 0 ? POISON_TINT : e.mesh.userData.baseColor
    );
    // Treffer-Aufblitzen
    if (e.hitFlash > 0) {
      e.hitFlash = Math.max(0, e.hitFlash - rawDt * 6);
      e.mesh.userData.bodyMat.emissive.setScalar(e.hitFlash * 0.5);
    }
    // Beschwörer-Orbs kreisen
    if (e.mesh.userData.orbiter) e.mesh.userData.orbiter.rotation.y += rawDt * 3;
    // Lebensbalken
    const frac = Math.max(0, e.hp / e.maxHp);
    const fg = e.mesh.userData.fg;
    fg.scale.x = Math.max(0.001, e.mesh.userData.bw * frac);
    e.mesh.userData.fgMat.color.set(frac > 0.5 ? 0x5fd068 : frac > 0.25 ? 0xe8b64f : 0xe85d5d);
  }

  // Türme (Geschütz drehen, Rückstoß, Kristall/Orb animieren)
  for (const t of state.towers) {
    const ud = t.mesh.userData;
    if (ud.turret) ud.turret.rotation.y = -t.angle;
    if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - rawDt * 5);
    if (ud.gun) ud.gun.position.x = -0.14 * t.recoil;
    if (ud.crystal) {
      ud.crystal.rotation.y += rawDt * 1.5;
      ud.crystal.scale.setScalar(1 + t.recoil * 0.3);
    }
    if (ud.orbiter) ud.orbiter.rotation.y += rawDt * 2.2;
    if (ud.orb) {
      ud.orb.position.y = ud.orb.userData.baseY + Math.sin(performance.now() / 400) * 0.06;
      ud.orb.scale.setScalar(1 + t.recoil * 0.5);
    }
    if (ud.badge) {
      ud.badge.rotation.y += rawDt * 2;
      ud.badge.position.y = 0.55 + Math.sin(performance.now() / 500) * 0.04;
    }
  }

  // Projektile
  for (const p of state.projectiles) {
    if (!p.mesh) continue;
    let y = p.type === 'archer' ? 0.85 : 0.5;
    if (p.lob) {
      // Ballistische Flugbahn: Höhe folgt einem Sinusbogen über die Flugstrecke
      const remain = Math.hypot(p.tx - p.x, p.ty - p.y);
      const frac = p.traveled / Math.max(1, p.traveled + remain);
      y = 0.5 + Math.sin(Math.min(1, frac) * Math.PI) * 1.7;
    }
    p.mesh.position.set(pxToWX(p.x), y, pxToWZ(p.y));
    if (p.type === 'archer') {
      tmpDir.set(p.tx - p.x, 0, p.ty - p.y).normalize();
      p.mesh.quaternion.setFromUnitVectors(upVec, tmpDir);
    }
  }

  // Bauvorschau (Geister-Turm folgt dem Zeiger)
  if (ghost) ghost.visible = false;
  if (state.buildType && state.hoverCell) {
    const [cx, cy] = state.hoverCell;
    const hill = isHillCell(cx, cy);
    const lift = hill ? HILL_H : 0;
    const ok = isBuildable(cx, cy, state.buildType) && state.gold >= TOWER_TYPES[state.buildType].cost;
    guardArc.visible = false;
    cellHighlight.visible = true;
    cellHighlight.material.color.set(ok ? 0x5fd068 : 0xe85d5d);
    cellHighlight.position.set(cx - COLS / 2 + 0.5, 0.16 + lift, cy - ROWS / 2 + 0.5);
    if (ghost) {
      ghost.visible = true;
      ghost.position.set(cx - COLS / 2 + 0.5, lift, cy - ROWS / 2 + 0.5);
    }
    if (ok) {
      showRangeAt(cx - COLS / 2 + 0.5, cy - ROWS / 2 + 0.5, TOWER_TYPES[state.buildType].range * (hill ? 1.1 : 1));
    } else {
      rangeGroup.visible = false;
    }
  } else if (state.selectedTower) {
    cellHighlight.visible = false;
    const t = state.selectedTower;
    if (t.type === 'mine') {
      rangeGroup.visible = false;
      guardArc.visible = false;
    } else {
      showRangeAt(pxToWX(t.x), pxToWZ(t.y), towerStats(t).range);
      if (TOWER_TYPES[t.type].arc) showGuardArc(t);
      else guardArc.visible = false;
    }
  } else {
    cellHighlight.visible = false;
    rangeGroup.visible = false;
    guardArc.visible = false;
  }

  // Auswahlring
  if (state.selectedTower) {
    selectRing.visible = true;
    selectRing.position.x = pxToWX(state.selectedTower.x);
    selectRing.position.y = 0.14 + (state.selectedTower.onHill ? HILL_H : 0);
    selectRing.position.z = pxToWZ(state.selectedTower.y);
  } else {
    selectRing.visible = false;
  }
}

// ---------- UI ----------
const el = {
  gold: document.querySelector('#stat-gold span'),
  lives: document.querySelector('#stat-lives span'),
  wave: document.querySelector('#stat-wave span'),
  btnWave: document.getElementById('btn-wave'),
  btnPause: document.getElementById('btn-pause'),
  btnSpeed: document.getElementById('btn-speed'),
  btnSound: document.getElementById('btn-sound'),
  shop: document.getElementById('shop'),
  panel: document.getElementById('tower-panel'),
  tpName: document.getElementById('tp-name'),
  tpStats: document.getElementById('tp-stats'),
  tpEnter: document.getElementById('tp-enter'),
  tpEquip: document.getElementById('tp-equip'),
  tpUpgrade: document.getElementById('tp-upgrade'),
  tpSell: document.getElementById('tp-sell'),
  fpHud: document.getElementById('fp-hud'),
  fpExit: document.getElementById('fp-exit'),
  overlay: document.getElementById('overlay'),
  ovTitle: document.getElementById('ov-title'),
  ovText: document.getElementById('ov-text'),
  ovRestart: document.getElementById('ov-restart'),
  ovEndless: document.getElementById('ov-endless'),
  pauseOv: document.getElementById('pause-ov'),
  mapBar: document.getElementById('map-bar'),
  wavePreview: document.getElementById('wave-preview'),
  btnMusic: document.getElementById('btn-music'),
  btnRestart: document.getElementById('btn-restart'),
  btnAch: document.getElementById('btn-ach'),
  achPanel: document.getElementById('ach-panel'),
};

el.btnAch.addEventListener('click', () => {
  ensureAudio();
  el.achPanel.style.display = el.achPanel.style.display === 'block' ? 'none' : 'block';
});

function buildMapBar() {
  el.mapBar.innerHTML = '<span>Karte:</span>';
  MAPS.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.textContent = m.name + ' (' + m.difficulty + ')';
    btn.dataset.map = i;
    btn.addEventListener('click', () => { ensureAudio(); loadMap(i); });
    el.mapBar.appendChild(btn);
  });
  updateMapButtons();
}

function updateMapButtons() {
  for (const btn of el.mapBar.querySelectorAll('button')) {
    const i = Number(btn.dataset.map);
    btn.classList.toggle('selected', i === currentMap);
    const best = loadBestFor(i);
    btn.textContent = MAPS[i].name + ' (' + MAPS[i].difficulty + ')' + (best > 0 ? ' · ★' + best : '');
  }
}

function buildShop() {
  el.shop.innerHTML = '';
  for (const key of TOWER_KEYS) {
    const t = TOWER_TYPES[key];
    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    btn.dataset.type = key;
    const terrTag = t.terrain === 'hill' ? ' · ⛰️ nur Anhöhe' : t.terrain === 'ground' ? ' · nur Boden' : '';
    btn.innerHTML =
      '<div>' + t.name + ' <span class="cost">💰' + t.cost + '</span></div>' +
      '<small>' + t.desc + terrTag + '</small>';
    btn.addEventListener('click', () => {
      ensureAudio();
      selectBuildType(state.buildType === key ? null : key);
    });
    el.shop.appendChild(btn);
  }
}

function selectBuildType(key) {
  if (state.controlled) return; // im Wachturm wird nicht gebaut
  state.buildType = key;
  setGhost(key);
  state.selectedTower = null;
  hideTowerPanel();
  updateShopButtons();
}

function updateShopButtons() {
  for (const btn of el.shop.children) {
    const key = btn.dataset.type;
    btn.classList.toggle('selected', state.buildType === key);
    btn.classList.toggle('unaffordable', state.gold < TOWER_TYPES[key].cost);
  }
}

function updateWaveButton() {
  const bossTag = (state.wave + 1) % 5 === 0 ? ' ⚠️ Boss!' : '';
  if (state.phase === 'wave') {
    el.btnWave.textContent = 'Welle ' + state.wave + ' läuft…';
    el.btnWave.disabled = true;
  } else if (state.autoTimer > 0) {
    el.btnWave.textContent = 'Welle ' + (state.wave + 1) + ' (' + Math.ceil(state.autoTimer) + 's) — Bonus!' + bossTag;
    el.btnWave.disabled = false;
  } else {
    el.btnWave.textContent = (state.wave === 0 ? 'Welle starten' : 'Nächste Welle') + bossTag;
    el.btnWave.disabled = false;
  }
  updateWavePreview();
}

// Vorschau: Was bringt die nächste Welle?
const ENEMY_NAMES = { normal: 'Normale', fast: 'Flinke', tank: 'Panzer', healer: 'Heiler', boss: 'Bosse', summoner: 'Beschwörer' };

function updateWavePreview() {
  if (state.gameOver) { el.wavePreview.textContent = ''; return; }
  if (state.phase === 'wave') {
    const left = state.enemies.length + state.spawnQueue.length;
    el.wavePreview.textContent = '⚔️ Welle ' + state.wave + ': noch ' + left + ' Gegner';
    return;
  }
  const q = buildWave(state.wave + 1);
  const counts = {};
  for (const s of q) counts[s.type] = (counts[s.type] || 0) + 1;
  const parts = Object.entries(counts).map(([k, n]) => n + ' ' + (ENEMY_NAMES[k] || k));
  el.wavePreview.textContent = '🔭 Nächste Welle: ' + q.length + ' Gegner — ' + parts.join(' · ');
}

function updateUI() {
  el.gold.textContent = state.gold;
  el.lives.textContent = state.lives;
  el.wave.textContent = state.endless
    ? state.wave + ' (Endlos)'
    : state.wave + '/' + TOTAL_WAVES;
  updateShopButtons();
  updateWaveButton();
  if (state.selectedTower) showTowerPanel(state.selectedTower);
}

function showTowerPanel(t) {
  const base = TOWER_TYPES[t.type];
  el.tpName.textContent = base.name + ' (Stufe ' + t.level + ')';
  if (t.type === 'mine') {
    const inc = Math.round(TOWER_TYPES.mine.income * LEVEL_MULT[t.level - 1]);
    el.tpStats.innerHTML = 'Einkommen: ' + inc + ' 💰 pro Welle';
  } else {
    const s = towerStats(t);
    el.tpStats.innerHTML =
      'Schaden: ' + Math.round(s.dmg) + '<br>' +
      'Reichweite: ' + Math.round(s.range) + '<br>' +
      'Feuerrate: ' + s.rate.toFixed(2) + '/s' +
      (t.onHill ? '<br>⛰️ Anhöhe: +10 % Reichweite' : '') +
      (t.type === 'poison' ? '<br>Gift: ' + Math.round(TOWER_TYPES.poison.poison.dps * LEVEL_MULT[t.level - 1]) + ' Schaden/s (3s)' : '') +
      (TOWER_TYPES[t.type].manual
        ? '<br>Automatik nur im blauen Sektor<br>Manuell: ' +
          Math.round(TOWER_TYPES[t.type].manual.dmg * LEVEL_MULT[t.level - 1] * (t.equip === 'ammo' ? EQUIP.ammo.dmg : 1)) +
          ' Schaden' + (TOWER_TYPES[t.type].manual.splash ? ' (Fläche)' : '')
        : '');
  }
  // Ausrüstung: ein Gegenstand pro Turm (nicht für Goldminen)
  el.tpEquip.innerHTML = '';
  if (t.type !== 'mine') {
    if (t.equip) {
      el.tpEquip.textContent = 'Ausrüstung: ' + EQUIP[t.equip].icon + ' ' + EQUIP[t.equip].name;
    } else {
      const label = document.createElement('div');
      label.textContent = 'Ausrüsten:';
      const row = document.createElement('div');
      row.className = 'eq-row';
      for (const [key, eq] of Object.entries(EQUIP)) {
        const btn = document.createElement('button');
        btn.textContent = eq.icon + ' ' + eq.cost;
        btn.title = eq.name;
        btn.disabled = state.gold < eq.cost;
        btn.addEventListener('click', () => equipTower(t, key));
        row.appendChild(btn);
      }
      el.tpEquip.append(label, row);
    }
  }
  el.tpEnter.style.display = TOWER_TYPES[t.type].enterable ? '' : 'none';
  if (t.level < MAX_LEVEL) {
    const cost = upgradeCost(t.type, t.level);
    el.tpUpgrade.textContent = 'Aufwerten (💰' + cost + ')';
    el.tpUpgrade.disabled = state.gold < cost;
    el.tpUpgrade.style.display = '';
  } else {
    el.tpUpgrade.style.display = 'none';
  }
  el.tpSell.textContent = 'Verkaufen (+💰' + sellValue(t) + ')';

  const rect = renderer.domElement.getBoundingClientRect();
  const s2 = worldToScreen(new THREE.Vector3(pxToWX(t.x), 1.2, pxToWZ(t.y)));
  let px = s2.x + 20;
  let py = s2.y - 60;
  px = Math.min(Math.max(4, px), rect.width - 185);
  py = Math.max(4, Math.min(py, rect.height - 160));
  el.panel.style.left = px + 'px';
  el.panel.style.top = py + 'px';
  el.panel.style.display = 'flex';
}

function hideTowerPanel() {
  el.panel.style.display = 'none';
}

function sellValue(t) {
  return Math.round(t.invested * 0.7);
}

function showOverlay(title, text, isVictory) {
  if (state.controlled) exitTower();
  el.ovTitle.textContent = title;
  el.ovText.textContent = text;
  el.ovRestart.textContent = 'Neustart';
  el.ovEndless.style.display = isVictory ? '' : 'none';
  el.overlay.style.display = 'flex';
}

// Startbildschirm beim ersten Öffnen (wenn kein Spielstand wartet)
function showStartScreen() {
  el.ovTitle.textContent = '🏰 Turm-Verteidigung 3D';
  el.ovText.textContent =
    'Halte 20 Wellen stand! Baue Türme auf Gras und Anhöhen, rüste sie aus, ' +
    'betritt Wachturm und Mörser für die Ego-Ansicht — und pass auf Heiler und Beschwörer auf. ' +
    'Karte oben wählen, dann Welle starten. Viel Erfolg!';
  el.ovRestart.textContent = '▶ Spielen';
  el.ovEndless.style.display = 'none';
  el.overlay.style.display = 'flex';
}

function hideOverlay() {
  el.overlay.style.display = 'none';
}

// ---------- Eingaben ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function pickCell(evt) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((evt.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((evt.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return null;
  const cx = Math.floor(hitPoint.x + COLS / 2);
  const cy = Math.floor(hitPoint.z + ROWS / 2);
  if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return null;
  return { cx, cy };
}

function pickTower(evt) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((evt.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((evt.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const meshes = state.towers.map(t => t.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length === 0) return null;
  let obj = hits[0].object;
  while (obj && !state.towers.some(t => t.mesh === obj)) obj = obj.parent;
  return state.towers.find(t => t.mesh === obj) || null;
}

// Kamera-Orbit mit rechter Maustaste
const orbit = { active: false, moved: 0, lastX: 0, lastY: 0 };

// Touch-Gesten: 1 Finger = tippen/zielen, 2 Finger = Kamera drehen + Pinch-Zoom
const touchPts = new Map();
const pinch = { active: false, dist: 0, midX: 0, midY: 0 };

function touchInfo() {
  const pts = [...touchPts.values()];
  const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
  return {
    dist: Math.hypot(dx, dy),
    midX: (pts[0].x + pts[1].x) / 2,
    midY: (pts[0].y + pts[1].y) / 2,
  };
}

// Linksklick/Tipp aufs Spielfeld: bauen oder Turm auswählen
function primaryAction(evt) {
  if (state.gameOver && !state.victory) return;
  if (state.buildType) {
    const cell = pickCell(evt);
    if (!cell) { selectBuildType(null); return; }
    if (placeTower(cell.cx, cell.cy, state.buildType)) {
      if (state.gold < TOWER_TYPES[state.buildType].cost) selectBuildType(null);
      else updateShopButtons();
    } else {
      // Auswahl bleibt in der Hand — nur erklären, warum es hier nicht geht
      const base = TOWER_TYPES[state.buildType];
      const hill = isHillCell(cell.cx, cell.cy);
      let msg = 'Feld belegt';
      if (state.gold < base.cost) msg = 'Zu wenig Gold';
      else if (pathCells.has(cell.cx + ',' + cell.cy)) msg = 'Nicht auf dem Pfad!';
      else if (base.terrain === 'hill' && !hill) msg = 'Nur auf Anhöhen ⛰️';
      else if (base.terrain === 'ground' && hill) msg = 'Nur auf ebenem Boden';
      addFloater((cell.cx + 0.5) * CELL, (cell.cy + 0.5) * CELL, msg, '#e85d5d');
    }
    return;
  }
  const tower = pickTower(evt);
  if (tower) {
    state.selectedTower = tower;
    showTowerPanel(tower);
  } else {
    state.selectedTower = null;
    hideTowerPanel();
  }
}

renderer.domElement.addEventListener('pointerdown', (evt) => {
  ensureAudio();
  if (evt.pointerType === 'touch') {
    touchPts.set(evt.pointerId, {
      x: evt.clientX, y: evt.clientY,
      moved: 0, gesture: false, t0: performance.now(),
    });
    renderer.domElement.setPointerCapture(evt.pointerId);
    if (touchPts.size === 2) {
      const i = touchInfo();
      pinch.active = true;
      pinch.dist = i.dist; pinch.midX = i.midX; pinch.midY = i.midY;
      for (const p of touchPts.values()) p.gesture = true; // kein Tipp mehr aus dieser Geste
    }
    return;
  }
  // Im Wachturm: linke Taste schießt (bzw. startet Ziel-Ziehen ohne Pointer-Lock)
  if (state.controlled) {
    if (evt.button === 2) { exitTower(); return; }
    if (evt.button !== 0) return;
    if (fp.locked) {
      manualShoot();
    } else {
      fp.drag.active = true;
      fp.drag.moved = 0;
      fp.drag.lastX = evt.clientX;
      fp.drag.lastY = evt.clientY;
      renderer.domElement.setPointerCapture(evt.pointerId);
    }
    return;
  }
  if (evt.button === 2) {
    orbit.active = true;
    orbit.moved = 0;
    orbit.lastX = evt.clientX;
    orbit.lastY = evt.clientY;
    renderer.domElement.setPointerCapture(evt.pointerId);
    return;
  }
  if (evt.button !== 0) return;
  primaryAction(evt);
});

renderer.domElement.addEventListener('pointermove', (evt) => {
  if (evt.pointerType === 'touch') {
    const p = touchPts.get(evt.pointerId);
    if (!p) return;
    const dx = evt.clientX - p.x, dy = evt.clientY - p.y;
    p.moved += Math.abs(dx) + Math.abs(dy);
    p.x = evt.clientX; p.y = evt.clientY;
    if (pinch.active && touchPts.size === 2) {
      const i = touchInfo();
      const ratio = pinch.dist / Math.max(1, i.dist);
      if (state.controlled) {
        camera.fov = Math.min(70, Math.max(25, camera.fov * ratio));
        camera.updateProjectionMatrix();
      } else {
        camCtl.radius = Math.min(28, Math.max(9, camCtl.radius * ratio));
        camCtl.theta -= (i.midX - pinch.midX) * 0.005;
        camCtl.phi = Math.min(1.25, Math.max(0.4, camCtl.phi - (i.midY - pinch.midY) * 0.004));
        updateCamera();
      }
      pinch.dist = i.dist; pinch.midX = i.midX; pinch.midY = i.midY;
    } else if (touchPts.size === 1) {
      if (state.controlled) {
        aimFP(dx * 1.8, dy * 1.8);
      } else if (state.buildType) {
        const cell = pickCell(evt);
        state.hoverCell = cell ? [cell.cx, cell.cy] : null;
      }
    }
    return;
  }
  if (state.controlled) {
    if (fp.locked) {
      aimFP(evt.movementX || 0, evt.movementY || 0);
    } else if (fp.drag.active) {
      const dx = evt.clientX - fp.drag.lastX;
      const dy = evt.clientY - fp.drag.lastY;
      fp.drag.moved += Math.abs(dx) + Math.abs(dy);
      fp.drag.lastX = evt.clientX;
      fp.drag.lastY = evt.clientY;
      aimFP(dx * 1.6, dy * 1.6);
    }
    return;
  }
  if (orbit.active) {
    const dx = evt.clientX - orbit.lastX;
    const dy = evt.clientY - orbit.lastY;
    orbit.moved += Math.abs(dx) + Math.abs(dy);
    orbit.lastX = evt.clientX;
    orbit.lastY = evt.clientY;
    camCtl.theta -= dx * 0.005;
    camCtl.phi = Math.min(1.25, Math.max(0.4, camCtl.phi - dy * 0.004));
    updateCamera();
    if (state.selectedTower) showTowerPanel(state.selectedTower);
    return;
  }
  const cell = pickCell(evt);
  state.hoverCell = cell ? [cell.cx, cell.cy] : null;
});

function onTouchEnd(evt) {
  const p = touchPts.get(evt.pointerId);
  touchPts.delete(evt.pointerId);
  if (touchPts.size < 2) pinch.active = false;
  if (evt.type === 'pointercancel' || !p) return;
  // Kurzer Tipp ohne Geste = Klick
  if (!p.gesture && p.moved < 12 && performance.now() - p.t0 < 600) {
    if (state.controlled) manualShoot();
    else primaryAction(evt);
  }
}
renderer.domElement.addEventListener('pointercancel', onTouchEnd);

renderer.domElement.addEventListener('pointerup', (evt) => {
  if (evt.pointerType === 'touch') { onTouchEnd(evt); return; }
  if (state.controlled && fp.drag.active && evt.button === 0) {
    fp.drag.active = false;
    if (fp.drag.moved < 6) manualShoot(); // Tipp/Klick ohne Ziehen = Schuss
    return;
  }
  if (evt.button === 2 && orbit.active) {
    orbit.active = false;
    if (orbit.moved < 6) {
      // Rechtsklick ohne Ziehen = Abbrechen/Abwählen
      selectBuildType(null);
      state.selectedTower = null;
      hideTowerPanel();
    }
  }
});

renderer.domElement.addEventListener('pointerleave', () => { state.hoverCell = null; });

renderer.domElement.addEventListener('wheel', (evt) => {
  evt.preventDefault();
  if (state.controlled) {
    // Zoom in der Ego-Ansicht (Zielfernrohr-Gefühl)
    camera.fov = Math.min(70, Math.max(25, camera.fov + evt.deltaY * 0.02));
    camera.updateProjectionMatrix();
    return;
  }
  camCtl.radius = Math.min(28, Math.max(9, camCtl.radius * (1 + evt.deltaY * 0.001)));
  updateCamera();
  if (state.selectedTower) showTowerPanel(state.selectedTower);
}, { passive: false });

renderer.domElement.addEventListener('contextmenu', (evt) => evt.preventDefault());

document.addEventListener('keydown', (evt) => {
  if (evt.code === 'Escape') {
    if (state.controlled) { exitTower(); return; }
    selectBuildType(null);
    state.selectedTower = null;
    hideTowerPanel();
  } else if (evt.code === 'Space') {
    evt.preventDefault();
    togglePause();
  } else if (evt.code === 'KeyR') {
    Object.assign(camCtl, CAM_DEFAULT);
    updateCamera();
  } else if (evt.code === 'Digit1') selectBuildType('archer');
  else if (evt.code === 'Digit2') selectBuildType('cannon');
  else if (evt.code === 'Digit3') selectBuildType('frost');
  else if (evt.code === 'Digit4') selectBuildType('bolt');
  else if (evt.code === 'Digit5') selectBuildType('guard');
  else if (evt.code === 'Digit6') selectBuildType('mortar');
  else if (evt.code === 'Digit7') selectBuildType('poison');
  else if (evt.code === 'Digit8') selectBuildType('mine');
  else if (evt.code === 'Enter') { ensureAudio(); startWave(); updateUI(); }
});

el.btnWave.addEventListener('click', () => { ensureAudio(); startWave(); updateUI(); });

function togglePause() {
  if (state.gameOver) return;
  state.paused = !state.paused;
  el.btnPause.textContent = state.paused ? '▶' : '⏸';
  el.pauseOv.style.display = state.paused ? 'flex' : 'none';
}
el.btnPause.addEventListener('click', () => { ensureAudio(); togglePause(); });

el.btnSpeed.addEventListener('click', () => {
  state.speed = state.speed >= 3 ? 1 : state.speed + 1;
  el.btnSpeed.textContent = state.speed + '×';
});

el.btnSound.addEventListener('click', () => {
  ensureAudio();
  muted = !muted;
  el.btnSound.textContent = muted ? '🔇' : '🔊';
});

// ---------- Hintergrundmusik (kleiner Chiptune-Loop, Am–F–C–G) ----------
const music = { on: false, timer: null, step: 0 };
const MUSIC_BASS = [45, 41, 36, 43]; // MIDI-Grundtöne der Akkorde
const MUSIC_ARP = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

function musicStep() {
  if (!audioCtx || muted) { music.step++; return; }
  const bar = Math.floor(music.step / 8) % 4;
  const pos = music.step % 8;
  if (pos === 0) beep(midiFreq(MUSIC_BASS[bar]), 0.6, 'triangle', 0.05);
  beep(midiFreq(MUSIC_ARP[bar][pos % 3] + (pos >= 4 ? 12 : 0)), 0.18, 'sine', 0.02);
  music.step++;
}

function toggleMusic() {
  ensureAudio();
  music.on = !music.on;
  el.btnMusic.classList.toggle('off', !music.on);
  if (music.on) {
    music.step = 0;
    music.timer = setInterval(musicStep, 170);
  } else {
    clearInterval(music.timer);
    music.timer = null;
  }
}
el.btnMusic.addEventListener('click', toggleMusic);

el.tpEnter.addEventListener('click', () => {
  ensureAudio();
  if (state.selectedTower) enterTower(state.selectedTower);
});

el.fpExit.addEventListener('click', () => exitTower());

el.tpUpgrade.addEventListener('click', () => {
  const t = state.selectedTower;
  if (!t || t.level >= MAX_LEVEL) return;
  const cost = upgradeCost(t.type, t.level);
  if (state.gold < cost) return;
  state.gold -= cost;
  t.invested += cost;
  t.level++;
  rebuildTowerMesh(t);
  if (t.level >= MAX_LEVEL && t.equip) unlock('vollausbau');
  sfx.upgrade();
  spawnParticles(t.x, t.y, 0xf5b942, 14);
  updateUI();
  if (state.phase === 'build') saveGame();
});

el.tpSell.addEventListener('click', () => {
  const t = state.selectedTower;
  if (!t) return;
  state.gold += sellValue(t);
  scene.remove(t.mesh);
  state.towers = state.towers.filter(x => x !== t);
  state.selectedTower = null;
  hideTowerPanel();
  sfx.sell();
  addFloater(t.x, t.y, '+' + sellValue(t) + ' 💰', '#f5b942');
  updateUI();
  if (state.phase === 'build') saveGame();
});

el.ovRestart.addEventListener('click', () => { ensureAudio(); clearSave(); resetGame(); });

el.btnRestart.addEventListener('click', () => {
  ensureAudio();
  if (state.wave > 0 && !state.gameOver &&
      !window.confirm('Neu starten? Der gespeicherte Spielstand geht verloren.')) return;
  clearSave();
  resetGame();
});

el.ovEndless.addEventListener('click', () => {
  ensureAudio();
  state.endless = true;
  state.gameOver = false;
  state.victory = false;
  state.autoTimer = -1;
  hideOverlay();
  updateUI();
});

// ---------- Spielschleife ----------
let lastTime = performance.now();

function loop(now) {
  const rawDt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (!state.paused && !(state.gameOver && !state.victory)) {
    for (let i = 0; i < state.speed; i++) update(rawDt);
  }
  syncScene(rawDt);
  updateFloaters(rawDt);
  if (state.controlled) updateFPCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---------- Start ----------
let savedMap = 0;
try {
  savedMap = parseInt(localStorage.getItem('td3d-karte') || '0', 10) || 0;
  if (savedMap < 0 || savedMap >= MAPS.length) savedMap = 0;
} catch (e) { savedMap = 0; }
loadMapData(savedMap);
buildMapScene();
buildMapBar();
buildShop();
renderAchPanel();
resetGame();
if (!tryLoadGame()) showStartScreen(); // fortsetzen oder Startbildschirm zeigen
requestAnimationFrame(loop);
