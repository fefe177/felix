'use strict';

// ============================================================
//  Turm-Verteidigung — komplettes Tower-Defense-Spiel
//  Reines HTML5-Canvas, keine Abhängigkeiten.
// ============================================================

// ---------- Grundkonstanten ----------
const COLS = 20, ROWS = 14, CELL = 40;
const W = COLS * CELL, H = ROWS * CELL;
const TOTAL_WAVES = 20;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------- Pfad ----------
// Wegpunkte in Zellkoordinaten (Zentrum der Zelle); Start/Ende außerhalb.
const WAYPOINT_CELLS = [
  [-1, 2], [16, 2], [16, 6], [3, 6], [3, 10], [20, 10],
];
const waypoints = WAYPOINT_CELLS.map(([c, r]) => ({
  x: (c + 0.5) * CELL,
  y: (r + 0.5) * CELL,
}));

// Zellen, die vom Pfad belegt sind (dort kann nicht gebaut werden)
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
    projSpeed: 420, color: '#8b5a2b', accent: '#d9a066',
    desc: 'Schnell, günstig, Einzelziel',
  },
  cannon: {
    name: 'Kanone', cost: 100, dmg: 34, range: 105, rate: 0.75,
    projSpeed: 260, splash: 58, color: '#4a4a55', accent: '#8a8a99',
    desc: 'Flächenschaden, langsam',
  },
  frost: {
    name: 'Frostturm', cost: 70, dmg: 6, range: 95, rate: 1.4,
    projSpeed: 340, slow: { factor: 0.55, dur: 2.0 },
    color: '#3d7ea6', accent: '#a8dcf0',
    desc: 'Verlangsamt Gegner',
  },
  bolt: {
    name: 'Blitzturm', cost: 150, dmg: 85, range: 190, rate: 0.55,
    laser: true, color: '#6b4fa0', accent: '#c9a7ff',
    desc: 'Hohe Reichweite &amp; Schaden',
  },
};
const TOWER_KEYS = ['archer', 'cannon', 'frost', 'bolt'];

// Multiplikatoren pro Stufe (Stufe 1 = Basis, max. Stufe 3)
const LEVEL_MULT = [1, 1.6, 2.5];
const RANGE_MULT = [1, 1.12, 1.25];
const RATE_MULT = [1, 1.15, 1.32];
const MAX_LEVEL = 3;

function upgradeCost(type, level) {
  return Math.round(TOWER_TYPES[type].cost * 0.9 * level);
}

// ---------- Gegnertypen ----------
const ENEMY_TYPES = {
  normal: { hp: 34, speed: 55, reward: 6, radius: 12, lives: 1, color: '#c94f4f', dark: '#8a2f2f' },
  fast:   { hp: 22, speed: 95, reward: 7, radius: 10, lives: 1, color: '#e8b64f', dark: '#a87c22' },
  tank:   { hp: 110, speed: 36, reward: 12, radius: 15, lives: 2, color: '#5a7d5a', dark: '#37522f' },
  boss:   { hp: 650, speed: 30, reward: 60, radius: 20, lives: 5, color: '#7a4fa0', dark: '#4d2d6e' },
};

// ---------- Spielzustand ----------
const state = {};

function resetGame() {
  state.gold = 140;
  state.lives = 20;
  state.wave = 0;
  state.phase = 'build';      // 'build' | 'wave'
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.beams = [];
  state.particles = [];
  state.floaters = [];
  state.spawnQueue = [];
  state.spawnTimer = 0;
  state.autoTimer = -1;       // Countdown bis zur automatischen nächsten Welle
  state.speed = 1;
  state.paused = false;
  state.gameOver = false;
  state.victory = false;
  state.endless = false;
  state.buildType = null;     // gewählter Turmtyp zum Bauen
  state.selectedTower = null; // angeklickter Turm (Panel)
  state.hoverCell = null;
  hideOverlay();
  hideTowerPanel();
  updateUI();
}

// ---------- Sound (WebAudio, winzige Synth-Effekte) ----------
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
  // Bonus für frühen Start
  if (state.autoTimer > 0) {
    const bonus = Math.ceil(state.autoTimer) * 2;
    state.gold += bonus;
    addFloater(W - 90, 30, '+' + bonus + ' 💰', '#f5b942');
  }
  state.wave++;
  state.phase = 'wave';
  state.spawnQueue = buildWave(state.wave);
  state.spawnTimer = 0.5;
  state.autoTimer = -1;
  sfx.wave();
  updateUI();
}

function endWave() {
  state.phase = 'build';
  const bonus = 25 + state.wave * 3;
  state.gold += bonus;
  addFloater(W / 2, H / 2 - 40, 'Welle geschafft! +' + bonus + ' 💰', '#5fd068');
  if (state.wave >= TOTAL_WAVES && !state.endless) {
    state.victory = true;
    state.gameOver = true;
    sfx.win();
    showOverlay('🏆 Sieg!', 'Du hast alle ' + TOTAL_WAVES + ' Wellen überstanden!', true);
  } else {
    state.autoTimer = 12;
  }
  updateUI();
}

// ---------- Gegner ----------
function spawnEnemy(typeKey) {
  const t = ENEMY_TYPES[typeKey];
  const scale = waveHpScale(state.wave);
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
    wobble: Math.random() * Math.PI * 2,
  });
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
      // Gegner ist durchgekommen
      e.dead = true;
      state.lives -= e.lives;
      sfx.leak();
      addFloater(W - 40, waypoints[waypoints.length - 1].y, '-' + e.lives + ' ❤️', '#e85d5d');
      if (state.lives <= 0 && !state.gameOver) {
        state.lives = 0;
        state.gameOver = true;
        sfx.lose();
        showOverlay('💀 Game Over', 'Du hast Welle ' + state.wave + ' erreicht.', false);
      }
      updateUI();
    }
  }
  state.enemies = state.enemies.filter(e => !e.dead);
}

function damageEnemy(e, dmg, slow) {
  if (e.dead) return;
  e.hp -= dmg;
  if (slow) {
    e.slowT = Math.max(e.slowT, slow.dur);
    e.slowFactor = slow.factor;
  }
  if (e.hp <= 0) {
    e.dead = true;
    state.gold += e.reward;
    sfx.death();
    addFloater(e.x, e.y - 14, '+' + e.reward, '#f5b942');
    spawnParticles(e.x, e.y, ENEMY_TYPES[e.type].color, e.type === 'boss' ? 22 : 10);
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

function placeTower(cx, cy, type) {
  const cost = TOWER_TYPES[type].cost;
  if (state.gold < cost) return false;
  if (!isBuildable(cx, cy)) return false;
  state.gold -= cost;
  state.towers.push({
    type, cx, cy,
    x: (cx + 0.5) * CELL,
    y: (cy + 0.5) * CELL,
    level: 1,
    cooldown: 0,
    invested: cost,
    angle: 0,
  });
  sfx.place();
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
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    const s = towerStats(t);
    // Ziel: Gegner, der am weitesten auf dem Pfad ist und in Reichweite liegt
    let best = null;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d <= s.range && (!best || e.dist > best.dist)) best = e;
    }
    if (!best) continue;
    t.cooldown = 1 / s.rate;
    t.angle = Math.atan2(best.y - t.y, best.x - t.x);
    const base = TOWER_TYPES[t.type];
    if (base.laser) {
      // Sofortiger Blitzstrahl
      damageEnemy(best, s.dmg);
      state.beams.push({ x1: t.x, y1: t.y, x2: best.x, y2: best.y, ttl: 0.12, color: base.accent });
      sfx.bolt();
    } else {
      state.projectiles.push({
        x: t.x, y: t.y,
        target: best,
        tx: best.x, ty: best.y,
        speed: base.projSpeed,
        dmg: s.dmg,
        splash: base.splash || 0,
        slow: base.slow || null,
        type: t.type,
      });
      if (t.type === 'cannon') sfx.cannon();
      else if (t.type === 'frost') sfx.frost();
      else sfx.shoot();
    }
  }
}

// ---------- Projektile ----------
function updateProjectiles(dt) {
  for (const p of state.projectiles) {
    if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d <= step + 6) {
      // Einschlag
      p.hit = true;
      if (p.splash > 0) {
        spawnParticles(p.tx, p.ty, '#ffb347', 14);
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
      // Ziel weg und kein Flächenschaden -> Projektil verpufft am Zielort
      if ((!p.target || p.target.dead) && !p.splash && d < 4) p.hit = true;
    }
  }
  state.projectiles = state.projectiles.filter(p => !p.hit);
  for (const b of state.beams) b.ttl -= dt;
  state.beams = state.beams.filter(b => b.ttl > 0);
}

// ---------- Partikel & schwebende Texte ----------
function spawnParticles(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 40 + Math.random() * 120;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      ttl: 0.4 + Math.random() * 0.4,
      maxTtl: 0.8,
      r: 2 + Math.random() * 3,
      color,
    });
  }
}

function addFloater(x, y, text, color) {
  state.floaters.push({ x, y, text, color, ttl: 1.4 });
}

function updateParticles(dt) {
  for (const p of state.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
    p.ttl -= dt;
  }
  state.particles = state.particles.filter(p => p.ttl > 0);
  for (const f of state.floaters) { f.y -= 28 * dt; f.ttl -= dt; }
  state.floaters = state.floaters.filter(f => f.ttl > 0);
}

// ---------- Haupt-Update ----------
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

// ---------- Zeichnen ----------
function draw() {
  ctx.clearRect(0, 0, W, H);

  // Gras (Schachbrett)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (c + r) % 2 === 0 ? '#2c4a32' : '#28452e';
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }

  // Pfad
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#6e5637';
  ctx.lineWidth = CELL * 0.86;
  drawPathLine();
  ctx.strokeStyle = '#8a6d46';
  ctx.lineWidth = CELL * 0.68;
  drawPathLine();

  // Start-/Zielmarkierung
  const sp = waypoints[0], ep = waypoints[waypoints.length - 1];
  ctx.fillStyle = '#5fd068';
  ctx.beginPath(); ctx.arc(2, sp.y, 14, -Math.PI / 2, Math.PI / 2); ctx.fill();
  ctx.fillStyle = '#e85d5d';
  ctx.beginPath(); ctx.arc(W - 2, ep.y, 14, Math.PI / 2, -Math.PI / 2); ctx.fill();

  // Bauvorschau
  if (state.buildType && state.hoverCell) {
    const [cx, cy] = state.hoverCell;
    const ok = isBuildable(cx, cy) && state.gold >= TOWER_TYPES[state.buildType].cost;
    ctx.fillStyle = ok ? 'rgba(95,208,104,.35)' : 'rgba(232,93,93,.35)';
    ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
    if (ok) {
      drawRange((cx + 0.5) * CELL, (cy + 0.5) * CELL, TOWER_TYPES[state.buildType].range);
    }
  }

  // Reichweite des ausgewählten Turms
  if (state.selectedTower) {
    const t = state.selectedTower;
    drawRange(t.x, t.y, towerStats(t).range);
  }

  // Türme
  for (const t of state.towers) drawTower(t);

  // Gegner
  for (const e of state.enemies) drawEnemy(e);

  // Projektile
  for (const p of state.projectiles) drawProjectile(p);

  // Blitzstrahlen
  for (const b of state.beams) {
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = Math.min(1, b.ttl / 0.12);
    ctx.beginPath();
    // Gezackter Blitz
    const segs = 5;
    ctx.moveTo(b.x1, b.y1);
    for (let i = 1; i < segs; i++) {
      const f = i / segs;
      const mx = b.x1 + (b.x2 - b.x1) * f + (Math.random() - 0.5) * 10;
      const my = b.y1 + (b.y2 - b.y1) * f + (Math.random() - 0.5) * 10;
      ctx.lineTo(mx, my);
    }
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Partikel
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.ttl / p.maxTtl);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Schwebende Texte
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.min(1, f.ttl);
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  // Pause-Hinweis
  if (state.paused && !state.gameOver) {
    ctx.fillStyle = 'rgba(10,15,25,.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8edf5';
    ctx.font = 'bold 36px "Segoe UI", sans-serif';
    ctx.fillText('⏸ Pause', W / 2, H / 2);
  }
}

function drawPathLine() {
  ctx.beginPath();
  ctx.moveTo(waypoints[0].x, waypoints[0].y);
  for (let i = 1; i < waypoints.length; i++) ctx.lineTo(waypoints[i].x, waypoints[i].y);
  ctx.stroke();
}

function drawRange(x, y, range) {
  ctx.fillStyle = 'rgba(245,185,66,.08)';
  ctx.strokeStyle = 'rgba(245,185,66,.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawTower(t) {
  const base = TOWER_TYPES[t.type];
  const { x, y } = t;
  // Sockel
  ctx.fillStyle = '#3a3a45';
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = base.color;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  // Rohr / Aufsatz Richtung Ziel
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t.angle);
  ctx.fillStyle = base.accent;
  if (t.type === 'cannon') {
    ctx.fillRect(0, -4, 17, 8);
  } else if (t.type === 'frost') {
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(4, -6); ctx.lineTo(4, 6);
    ctx.closePath(); ctx.fill();
  } else if (t.type === 'bolt') {
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(0, -2.5, 15, 5);
  } else {
    ctx.fillRect(0, -2.5, 15, 5);
  }
  ctx.restore();
  // Stufen-Punkte
  ctx.fillStyle = '#f5b942';
  for (let i = 0; i < t.level; i++) {
    ctx.beginPath();
    ctx.arc(x - 8 + i * 8, y + 15, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Auswahlring
  if (state.selectedTower === t) {
    ctx.strokeStyle = '#f5b942';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEnemy(e) {
  const t = ENEMY_TYPES[e.type];
  e.wobble += 0.15;
  const wob = Math.sin(e.wobble) * 1.5;
  // Schatten
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + e.radius * 0.8, e.radius * 0.9, e.radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Körper
  ctx.fillStyle = e.slowT > 0 ? '#7ab8d9' : t.color;
  ctx.strokeStyle = t.dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(e.x, e.y + wob, e.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Augen
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.35, e.y + wob - 2, e.radius * 0.22, 0, Math.PI * 2);
  ctx.arc(e.x + e.radius * 0.35, e.y + wob - 2, e.radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.3, e.y + wob - 2, e.radius * 0.1, 0, Math.PI * 2);
  ctx.arc(e.x + e.radius * 0.4, e.y + wob - 2, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Boss-Krone
  if (e.type === 'boss') {
    ctx.fillStyle = '#f5b942';
    ctx.beginPath();
    const bx = e.x, by = e.y + wob - e.radius - 3;
    ctx.moveTo(bx - 10, by);
    ctx.lineTo(bx - 10, by - 8);
    ctx.lineTo(bx - 5, by - 3);
    ctx.lineTo(bx, by - 9);
    ctx.lineTo(bx + 5, by - 3);
    ctx.lineTo(bx + 10, by - 8);
    ctx.lineTo(bx + 10, by);
    ctx.closePath();
    ctx.fill();
  }
  // Lebensbalken
  const bw = e.radius * 2.2;
  const frac = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(e.x - bw / 2, e.y - e.radius - 10, bw, 5);
  ctx.fillStyle = frac > 0.5 ? '#5fd068' : frac > 0.25 ? '#e8b64f' : '#e85d5d';
  ctx.fillRect(e.x - bw / 2, e.y - e.radius - 10, bw * frac, 5);
}

function drawProjectile(p) {
  if (p.type === 'cannon') {
    ctx.fillStyle = '#2e2e35';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.type === 'frost') {
    ctx.fillStyle = '#a8dcf0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Pfeil
    const a = Math.atan2(p.ty - p.y, p.tx - p.x);
    ctx.strokeStyle = '#d9a066';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x - Math.cos(a) * 7, p.y - Math.sin(a) * 7);
    ctx.lineTo(p.x + Math.cos(a) * 7, p.y + Math.sin(a) * 7);
    ctx.stroke();
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
  tpUpgrade: document.getElementById('tp-upgrade'),
  tpSell: document.getElementById('tp-sell'),
  overlay: document.getElementById('overlay'),
  ovTitle: document.getElementById('ov-title'),
  ovText: document.getElementById('ov-text'),
  ovRestart: document.getElementById('ov-restart'),
  ovEndless: document.getElementById('ov-endless'),
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
  if (state.phase === 'wave') {
    el.btnWave.textContent = 'Welle ' + state.wave + ' läuft…';
    el.btnWave.disabled = true;
  } else if (state.autoTimer > 0) {
    el.btnWave.textContent = 'Welle ' + (state.wave + 1) + ' (' + Math.ceil(state.autoTimer) + 's) — Bonus!';
    el.btnWave.disabled = false;
  } else {
    el.btnWave.textContent = state.wave === 0 ? 'Welle starten' : 'Nächste Welle';
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
    'Feuerrate: ' + s.rate.toFixed(2) + '/s';
  if (t.level < MAX_LEVEL) {
    const cost = upgradeCost(t.type, t.level);
    el.tpUpgrade.textContent = 'Aufwerten (💰' + cost + ')';
    el.tpUpgrade.disabled = state.gold < cost;
    el.tpUpgrade.style.display = '';
  } else {
    el.tpUpgrade.style.display = 'none';
  }
  el.tpSell.textContent = 'Verkaufen (+💰' + sellValue(t) + ')';

  // Panel neben dem Turm positionieren (in CSS-Pixeln)
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / W, scaleY = rect.height / H;
  let px = t.x * scaleX + 24;
  let py = t.y * scaleY - 40;
  px = Math.min(px, rect.width - 185);
  py = Math.max(4, Math.min(py, rect.height - 150));
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
  el.ovTitle.textContent = title;
  el.ovText.textContent = text;
  el.ovEndless.style.display = isVictory ? '' : 'none';
  el.overlay.style.display = 'flex';
}

function hideOverlay() {
  el.overlay.style.display = 'none';
}

// ---------- Eingaben ----------
function canvasCell(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = (evt.clientX - rect.left) * (W / rect.width);
  const y = (evt.clientY - rect.top) * (H / rect.height);
  return { x, y, cx: Math.floor(x / CELL), cy: Math.floor(y / CELL) };
}

canvas.addEventListener('pointermove', (evt) => {
  const { cx, cy } = canvasCell(evt);
  state.hoverCell = (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) ? [cx, cy] : null;
});

canvas.addEventListener('pointerleave', () => { state.hoverCell = null; });

canvas.addEventListener('pointerdown', (evt) => {
  ensureAudio();
  if (state.gameOver && !state.victory) return;
  const { x, y, cx, cy } = canvasCell(evt);

  if (state.buildType) {
    if (placeTower(cx, cy, state.buildType)) {
      // Turmtyp bleibt gewählt, solange Gold reicht (schnelles Bauen)
      if (state.gold < TOWER_TYPES[state.buildType].cost) selectBuildType(null);
      else updateShopButtons();
    } else {
      selectBuildType(null);
    }
    return;
  }

  // Turm anklicken?
  const clicked = state.towers.find(t => Math.hypot(t.x - x, t.y - y) <= 18);
  if (clicked) {
    state.selectedTower = clicked;
    showTowerPanel(clicked);
  } else {
    state.selectedTower = null;
    hideTowerPanel();
  }
});

canvas.addEventListener('contextmenu', (evt) => {
  evt.preventDefault();
  selectBuildType(null);
  state.selectedTower = null;
  hideTowerPanel();
});

document.addEventListener('keydown', (evt) => {
  if (evt.code === 'Escape') {
    selectBuildType(null);
    state.selectedTower = null;
    hideTowerPanel();
  } else if (evt.code === 'Space') {
    evt.preventDefault();
    togglePause();
  } else if (evt.code === 'Digit1') selectBuildType('archer');
  else if (evt.code === 'Digit2') selectBuildType('cannon');
  else if (evt.code === 'Digit3') selectBuildType('frost');
  else if (evt.code === 'Digit4') selectBuildType('bolt');
  else if (evt.code === 'Enter') { ensureAudio(); startWave(); updateUI(); }
});

el.btnWave.addEventListener('click', () => { ensureAudio(); startWave(); updateUI(); });

function togglePause() {
  if (state.gameOver) return;
  state.paused = !state.paused;
  el.btnPause.textContent = state.paused ? '▶' : '⏸';
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

el.tpUpgrade.addEventListener('click', () => {
  const t = state.selectedTower;
  if (!t || t.level >= MAX_LEVEL) return;
  const cost = upgradeCost(t.type, t.level);
  if (state.gold < cost) return;
  state.gold -= cost;
  t.invested += cost;
  t.level++;
  sfx.upgrade();
  spawnParticles(t.x, t.y, '#f5b942', 12);
  updateUI();
});

el.tpSell.addEventListener('click', () => {
  const t = state.selectedTower;
  if (!t) return;
  state.gold += sellValue(t);
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

// Panel bei Fenstergröße neu positionieren
window.addEventListener('resize', () => {
  if (state.selectedTower) showTowerPanel(state.selectedTower);
});

// ---------- Spielschleife ----------
let lastTime = performance.now();

function loop(now) {
  const rawDt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (!state.paused && !(state.gameOver && !state.victory)) {
    // Bei mehrfacher Geschwindigkeit in kleinen Schritten simulieren
    for (let i = 0; i < state.speed; i++) update(rawDt);
  }
  draw();
  requestAnimationFrame(loop);
}

// ---------- Start ----------
buildShop();
resetGame();
requestAnimationFrame(loop);
