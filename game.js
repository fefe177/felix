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

// ---------- Pfad ----------
const WAYPOINT_CELLS = [
  [-1, 2], [16, 2], [16, 6], [3, 6], [3, 10], [20, 10],
];
const waypoints = WAYPOINT_CELLS.map(([c, r]) => ({
  x: (c + 0.5) * CELL,
  y: (r + 0.5) * CELL,
}));

const pathCells = new Set();
for (let i = 0; i < WAYPOINT_CELLS.length - 1; i++) {
  let [c1, r1] = WAYPOINT_CELLS[i];
  const [c2, r2] = WAYPOINT_CELLS[i + 1];
  const dc = Math.sign(c2 - c1), dr = Math.sign(r2 - r1);
  while (c1 !== c2 || r1 !== r2) {
    if (c1 >= 0 && c1 < COLS && r1 >= 0 && r1 < ROWS) pathCells.add(c1 + ',' + r1);
    c1 += dc; r1 += dr;
  }
  if (c2 >= 0 && c2 < COLS && r2 >= 0 && r2 < ROWS) pathCells.add(c2 + ',' + r2);
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
    projSpeed: 260, splash: 58, color: '#4a4a55',
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
    laser: true, color: '#6b4fa0',
    desc: 'Hohe Reichweite &amp; Schaden',
  },
  guard: {
    name: 'Wachturm', cost: 120, dmg: 22, range: 135, rate: 1.8,
    projSpeed: 460, color: '#7a6a4f',
    arc: 0.5, // halber Öffnungswinkel des Automatik-Sektors (rad, ≈ ±29°)
    manual: { dmg: 50, rate: 3, range: 300 },
    desc: 'Betretbar — selbst zielen &amp; schießen!',
  },
};
const TOWER_KEYS = ['archer', 'cannon', 'frost', 'bolt', 'guard'];

const LEVEL_MULT = [1, 1.6, 2.5];
const RANGE_MULT = [1, 1.12, 1.25];
const RATE_MULT = [1, 1.15, 1.32];
const MAX_LEVEL = 3;

function upgradeCost(type, level) {
  return Math.round(TOWER_TYPES[type].cost * 0.9 * level);
}

// ---------- Gegnertypen ----------
const ENEMY_TYPES = {
  normal: { hp: 34, speed: 55, reward: 6, radius: 12, lives: 1, color: 0xc94f4f },
  fast:   { hp: 22, speed: 95, reward: 7, radius: 10, lives: 1, color: 0xe8b64f },
  tank:   { hp: 110, speed: 36, reward: 12, radius: 15, lives: 2, color: 0x5a7d5a },
  boss:   { hp: 650, speed: 30, reward: 60, radius: 20, lives: 5, color: 0x7a4fa0 },
};
const SLOW_TINT = 0x7ab8d9;

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

  // Pfad-Kacheln
  const tileGeo = new THREE.BoxGeometry(0.98, 0.14, 0.98);
  const tileMatA = new THREE.MeshStandardMaterial({ color: 0x8a6d46, roughness: 0.9 });
  const tileMatB = new THREE.MeshStandardMaterial({ color: 0x7f6440, roughness: 0.9 });
  for (const key of pathCells) {
    const [c, r] = key.split(',').map(Number);
    const tile = new THREE.Mesh(tileGeo, (c + r) % 2 === 0 ? tileMatA : tileMatB);
    tile.position.set(c - COLS / 2 + 0.5, 0.07, r - ROWS / 2 + 0.5);
    tile.receiveShadow = true;
    scene.add(tile);
  }

  // Start- und Zielportal
  const mkPortal = (x, z, color) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.09, 10, 24),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 })
    );
    ring.position.set(x, 0.62, z);
    ring.rotation.y = Math.PI / 2;
    ring.castShadow = true;
    scene.add(ring);
  };
  mkPortal(-(COLS / 2 + 0.35), pxToWZ(waypoints[0].y), 0x2fae53);
  mkPortal(COLS / 2 + 0.35, pxToWZ(waypoints[waypoints.length - 1].y), 0xc93f3f);

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
  t.mesh.position.set(t.cx - COLS / 2 + 0.5, 0, t.cy - ROWS / 2 + 0.5);
  scene.add(t.mesh);
  if (t.mesh.userData.turret) t.mesh.userData.turret.rotation.y = -t.angle;
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

  g.userData = { body, bodyG, bodyMat, bgMat, fgMat, fg, bw, rw, baseColor: t.color };
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

function makeProjectileMesh(type) {
  if (type === 'cannon') return new THREE.Mesh(projGeos.cannon, MAT.darkBall);
  if (type === 'frost') return new THREE.Mesh(projGeos.frost, frostBallMat);
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
  const arc = TOWER_TYPES.guard.arc;
  const key = t.guardAngle.toFixed(3);
  if (guardArc.userData.key !== key) {
    guardArc.geometry.dispose();
    // Winkelabbildung: Logik-Winkel a -> Kreiswinkel -a (Z-Achse gespiegelt)
    guardArc.geometry = new THREE.CircleGeometry(1, 24, -t.guardAngle - arc, arc * 2);
    guardArc.userData.key = key;
  }
  const rw = (TOWER_TYPES.guard.range * RANGE_MULT[t.level - 1]) / CELL;
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

// ---------- Spielzustand ----------
const state = {};

function clearActors() {
  if (state.enemies) for (const e of state.enemies) if (e.mesh) disposeEnemyMesh(e.mesh);
  if (state.towers) for (const t of state.towers) scene.remove(t.mesh);
  if (state.projectiles) for (const p of state.projectiles) scene.remove(p.mesh);
  if (state.beams) for (const b of state.beams) { scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); }
  if (state.particles) for (const p of state.particles) scene.remove(p.mesh);
  if (state.floaters) for (const f of state.floaters) f.el.remove();
}

function resetGame() {
  if (state.controlled) exitTower();
  clearActors();
  state.controlled = null;
  state.kills = 0;
  state.gold = 140;
  state.lives = 20;
  state.wave = 0;
  state.phase = 'build';
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.beams = [];
  state.particles = [];
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
  return 1 + (w - 1) * 0.32 + Math.pow(Math.max(0, w - 8), 1.6) * 0.05;
}

function buildWave(w) {
  const queue = [];
  const isBossWave = w % 5 === 0;
  let count = Math.min(6 + w * 2, 42);
  if (isBossWave) count = Math.max(4, Math.floor(count * 0.6));
  for (let i = 0; i < count; i++) {
    let type = 'normal';
    if (w >= 3 && i % 3 === 2) type = 'fast';
    if (w >= 5 && i % 4 === 3) type = 'tank';
    queue.push({ type, delay: type === 'fast' ? 0.55 : 0.85 });
  }
  if (isBossWave) {
    const bosses = 1 + Math.floor(w / 10);
    for (let i = 0; i < bosses; i++) queue.push({ type: 'boss', delay: 1.6 });
  }
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

// Beste Welle dauerhaft im Browser speichern
function loadBest() {
  try { return parseInt(localStorage.getItem('td3d-beste-welle') || '0', 10) || 0; }
  catch (e) { return 0; }
}
function saveBest(w) {
  try { if (w > loadBest()) localStorage.setItem('td3d-beste-welle', String(w)); }
  catch (e) { /* z. B. Speicher blockiert — dann eben ohne Highscore */ }
}
function statsText(prefix) {
  return prefix + ' · Abschüsse: ' + state.kills + ' · Beste Welle: ' + loadBest();
}

function endWave() {
  state.phase = 'build';
  const bonus = 25 + state.wave * 3;
  state.gold += bonus;
  saveBest(state.wave);
  addFloater(W / 2, H / 2 - 40, 'Welle geschafft! +' + bonus + ' 💰', '#5fd068');
  if (state.wave >= TOTAL_WAVES && !state.endless) {
    state.victory = true;
    state.gameOver = true;
    sfx.win();
    showOverlay('🏆 Sieg!', statsText('Du hast alle ' + TOTAL_WAVES + ' Wellen überstanden!'), true);
  } else {
    state.autoTimer = 12;
  }
  updateUI();
}

// ---------- Gegner ----------
function spawnEnemy(typeKey) {
  const t = ENEMY_TYPES[typeKey];
  const scale = waveHpScale(state.wave);
  const mesh = makeEnemyMesh(typeKey);
  scene.add(mesh);
  state.enemies.push({
    type: typeKey,
    x: waypoints[0].x,
    y: waypoints[0].y,
    wp: 1,
    hp: t.hp * scale,
    maxHp: t.hp * scale,
    speed: t.speed,
    radius: t.radius,
    reward: Math.round(t.reward * (1 + state.wave * 0.04)),
    lives: t.lives,
    slowT: 0,
    slowFactor: 1,
    dist: 0,
    dead: false,
    hitFlash: 0,
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
        showOverlay('💀 Game Over', statsText('Du hast Welle ' + state.wave + ' erreicht'), false);
      }
      updateUI();
    }
  }
  for (const e of state.enemies) if (e.dead && e.mesh) { disposeEnemyMesh(e.mesh); e.mesh = null; }
  state.enemies = state.enemies.filter(e => !e.dead);
}

function damageEnemy(e, dmg, slow) {
  if (e.dead) return;
  e.hp -= dmg;
  if (slow) {
    e.slowT = Math.max(e.slowT, slow.dur);
    e.slowFactor = slow.factor;
  }
  e.hitFlash = 1;
  if (e.hp <= 0) {
    e.dead = true;
    state.gold += e.reward;
    state.kills++;
    sfx.death();
    addFloater(e.x, e.y - 14, '+' + e.reward, '#f5b942');
    spawnParticles(e.x, e.y, ENEMY_TYPES[e.type].color, e.type === 'boss' ? 26 : 12);
    updateUI();
  } else {
    sfx.hit();
  }
}

// ---------- Türme ----------
function towerStats(t) {
  const base = TOWER_TYPES[t.type];
  const li = t.level - 1;
  return {
    dmg: base.dmg * LEVEL_MULT[li],
    range: base.range * RANGE_MULT[li],
    rate: base.rate * RATE_MULT[li],
  };
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
  if (!isBuildable(cx, cy)) return false;
  state.gold -= cost;
  const mesh = makeTowerMesh(type, 1);
  mesh.position.set(cx - COLS / 2 + 0.5, 0, cy - ROWS / 2 + 0.5);
  scene.add(mesh);
  const guardAngle = type === 'guard' ? angleToNearestPath(cx, cy) : 0;
  state.towers.push({
    type, cx, cy,
    x: (cx + 0.5) * CELL,
    y: (cy + 0.5) * CELL,
    level: 1,
    cooldown: 0,
    invested: cost,
    angle: guardAngle,
    guardAngle,
    manualCd: 0,
    recoil: 0,
    mesh,
  });
  sfx.place();
  spawnParticles((cx + 0.5) * CELL, (cy + 0.5) * CELL, 0xf5b942, 10);
  updateUI();
  return true;
}

function isBuildable(cx, cy) {
  if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return false;
  if (pathCells.has(cx + ',' + cy)) return false;
  return !state.towers.some(t => t.cx === cx && t.cy === cy);
}

function updateTowers(dt) {
  for (const t of state.towers) {
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
      if (t.type === 'guard') {
        // Automatik nur im schmalen Sektor um die Wachrichtung
        const da = Math.atan2(e.y - t.y, e.x - t.x) - t.guardAngle;
        if (Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) > TOWER_TYPES.guard.arc) continue;
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
      mesh.position.set(pxToWX(t.x), t.mesh.userData.muzzleY || 0.6, pxToWZ(t.y));
      scene.add(mesh);
      state.projectiles.push({
        x: t.x, y: t.y,
        target: best,
        tx: best.x, ty: best.y,
        speed: base.projSpeed,
        dmg: s.dmg,
        splash: base.splash || 0,
        slow: base.slow || null,
        type: t.type,
        mesh,
      });
      if (t.type === 'cannon') sfx.cannon();
      else if (t.type === 'frost') sfx.frost();
      else sfx.shoot();
    }
  }
}

// ---------- Blitzstrahlen ----------
function addBeam(t, e) {
  const from = new THREE.Vector3(pxToWX(t.x), t.mesh.userData.beamY || 1.18, pxToWZ(t.y));
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
        for (const e of state.enemies) {
          if (!e.dead && Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash + e.radius) {
            damageEnemy(e, p.dmg, p.slow);
          }
        }
      } else if (p.target && !p.target.dead) {
        damageEnemy(p.target, p.dmg, p.slow);
      }
    } else {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
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
  if (state.controlled || t.type !== 'guard') return;
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
  if (!locked && fp.locked && state.controlled) exitTower(); // Esc bei Pointer-Lock
  fp.locked = locked;
});

function updateFPCamera() {
  const t = state.controlled;
  const eyeY = t.mesh.userData.eyeY || 1.2;
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
  const m = TOWER_TYPES.guard.manual;
  t.manualCd = 1 / m.rate;
  const dmg = m.dmg * LEVEL_MULT[t.level - 1];
  const rangeW = m.range / CELL;
  camera.updateMatrixWorld(true); // Blickrichtung kann sich seit dem letzten Frame geändert haben
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
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
    // Verlangsamungs-Färbung
    e.mesh.userData.bodyMat.color.set(e.slowT > 0 ? SLOW_TINT : e.mesh.userData.baseColor);
    // Treffer-Aufblitzen
    if (e.hitFlash > 0) {
      e.hitFlash = Math.max(0, e.hitFlash - rawDt * 6);
      e.mesh.userData.bodyMat.emissive.setScalar(e.hitFlash * 0.5);
    }
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
  }

  // Projektile
  for (const p of state.projectiles) {
    if (!p.mesh) continue;
    const y = p.type === 'archer' ? 0.85 : 0.5;
    p.mesh.position.set(pxToWX(p.x), y, pxToWZ(p.y));
    if (p.type === 'archer') {
      tmpDir.set(p.tx - p.x, 0, p.ty - p.y).normalize();
      p.mesh.quaternion.setFromUnitVectors(upVec, tmpDir);
    }
  }

  // Bauvorschau
  if (state.buildType && state.hoverCell) {
    const [cx, cy] = state.hoverCell;
    const ok = isBuildable(cx, cy) && state.gold >= TOWER_TYPES[state.buildType].cost;
    guardArc.visible = false;
    cellHighlight.visible = true;
    cellHighlight.material.color.set(ok ? 0x5fd068 : 0xe85d5d);
    cellHighlight.position.x = cx - COLS / 2 + 0.5;
    cellHighlight.position.z = cy - ROWS / 2 + 0.5;
    if (ok) {
      showRangeAt(cx - COLS / 2 + 0.5, cy - ROWS / 2 + 0.5, TOWER_TYPES[state.buildType].range);
    } else {
      rangeGroup.visible = false;
    }
  } else if (state.selectedTower) {
    cellHighlight.visible = false;
    const t = state.selectedTower;
    showRangeAt(pxToWX(t.x), pxToWZ(t.y), towerStats(t).range);
    if (t.type === 'guard') showGuardArc(t);
    else guardArc.visible = false;
  } else {
    cellHighlight.visible = false;
    rangeGroup.visible = false;
    guardArc.visible = false;
  }

  // Auswahlring
  if (state.selectedTower) {
    selectRing.visible = true;
    selectRing.position.x = pxToWX(state.selectedTower.x);
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
};

function buildShop() {
  el.shop.innerHTML = '';
  for (const key of TOWER_KEYS) {
    const t = TOWER_TYPES[key];
    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    btn.dataset.type = key;
    btn.innerHTML =
      '<div>' + t.name + ' <span class="cost">💰' + t.cost + '</span></div>' +
      '<small>' + t.desc + '</small>';
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
  const s = towerStats(t);
  el.tpName.textContent = base.name + ' (Stufe ' + t.level + ')';
  el.tpStats.innerHTML =
    'Schaden: ' + Math.round(s.dmg) + '<br>' +
    'Reichweite: ' + Math.round(s.range) + '<br>' +
    'Feuerrate: ' + s.rate.toFixed(2) + '/s' +
    (t.type === 'guard'
      ? '<br>Automatik nur im blauen Sektor<br>Manuell: ' + Math.round(TOWER_TYPES.guard.manual.dmg * LEVEL_MULT[t.level - 1]) + ' Schaden'
      : '');
  el.tpEnter.style.display = t.type === 'guard' ? '' : 'none';
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
  el.ovEndless.style.display = isVictory ? '' : 'none';
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
    if (cell && placeTower(cell.cx, cell.cy, state.buildType)) {
      if (state.gold < TOWER_TYPES[state.buildType].cost) selectBuildType(null);
      else updateShopButtons();
    } else {
      selectBuildType(null);
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
  sfx.upgrade();
  spawnParticles(t.x, t.y, 0xf5b942, 14);
  updateUI();
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
});

el.ovRestart.addEventListener('click', () => { ensureAudio(); resetGame(); });

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
buildShop();
resetGame();
requestAnimationFrame(loop);
