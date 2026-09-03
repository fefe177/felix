#!/usr/bin/env node
/* Schleifental GP - Training des KI-Fahrers.
 *
 * Evolutionsstrategie, selbst geschrieben: keine Bibliothek, kein Gradient,
 * kein Rueckwaertsdurchlauf. Eine Population von Gewichtssaetzen faehrt die
 * Strecke in der echten Spielphysik (ohne Grafik, rund 450 000 Schritte je
 * Sekunde), die besten werden behalten und leicht veraendert weitervererbt.
 *
 *   node ai/train.js [--gen 300] [--pop 96] [--seed 7] [--quiet]
 *
 * Bewertung: zurueckgelegte Strecke in fester Zeit, abzueglich Strafe fuer
 * Zeit an der Leitplanke. Gestartet wird an drei Stellen der Runde, damit das
 * Netz die ganze Strecke lernt und nicht nur den Anfang.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
global.self = global;
global.THREE = require(path.join(ROOT, 'vendor/three.min.js'));
require(path.join(ROOT, 'src/courses.js'));
require(path.join(ROOT, 'src/track.js'));
require(path.join(ROOT, 'src/kart.js'));
require(path.join(ROOT, 'src/brain.js'));
const MK = global.MK;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
};
const QUIET = process.argv.includes('--quiet');
const COURSE = (function () {
  const i = process.argv.indexOf('--course');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : MK.courses[0].id;
})();

const GENS = arg('gen', 300);
const POP = arg('pop', 96);
const ELITE = Math.max(4, Math.round(POP / 8));
const SEED = arg('seed', 7);
const DT = 1 / 120;

const spec = MK.courseById(COURSE);
const track = MK.track.build(spec);
const L = track.length;
const NW = MK.brain.weightCount(MK.brain.SHAPE);

/* --- eigener Zufallszahlengeber, damit Laeufe wiederholbar sind --- */
let seed = SEED >>> 0;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function gauss() {                                   // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* --- Bewertung --- */
const STARTS = [
  { s: 0,          v: 0,  secs: 26 },   // Startrampe, aus dem Stand
  { s: L * 0.33,   v: 32, secs: 24 },
  { s: L * 0.62,   v: 32, secs: 24 }
];

const net = MK.brain.create(new Float64Array(NW));
function run(weights, start, collect) {
  net.w.set(weights);
  const k = MK.kart.state(start.s, 0);
  k.v = start.v;
  const steps = Math.round(start.secs / DT);
  let prev = k.s, dist = 0, wall = 0, vmax = 0, air = 0, fell = 0, done = 0;
  for (let i = 0; i < steps; i++) {
    MK.kart.step(k, track, MK.brain.decide(net, k, track), DT);
    MK.kart.pads(k, track);                          // Turbofelder wie im Spiel
    dist += k.s - prev; prev = k.s;
    if (k.touching) wall += DT;
    if (k.air) air += DT;
    if (k.v > vmax) vmax = k.v;
    if (k.fell) { fell++; k.fell = 0; k.s = Math.max(0, k.s - 120); k.v = 20; k.h = 0; k.air = false; }
    if (k.s >= L - 2) { done = 1; break; }            // im Ziel
    if (i > 900 && dist < 30) break;                  // steht oder faehrt rueckwaerts
  }
  return collect ? { dist, wall, vmax, air, fell, done }
                 : dist - 25 * wall - 400 * fell + (done ? 600 : 0);
}
function fitness(weights) {
  let f = 0;
  for (const st of STARTS) f += run(weights, st, false);
  return f;
}

/* Laufzeit vom Start bis ins Ziel - das eigentliche Ziel, nur zur Anzeige */
function courseTime(weights) {
  net.w.set(weights);
  const k = MK.kart.state(0, 0);
  let t = 0, wall = 0, vmax = 0, fell = 0;
  for (let i = 0; i < Math.round(300 / DT); i++) {
    MK.kart.step(k, track, MK.brain.decide(net, k, track), DT);
    MK.kart.pads(k, track);
    t += DT;
    if (k.touching) wall += DT;
    if (k.v > vmax) vmax = k.v;
    if (k.fell) { fell++; k.fell = 0; k.s = Math.max(0, k.s - 120); k.v = 20; k.h = 0; k.air = false; }
    if (k.s >= L - 2) return { zeit: t, wall, vmax, fell, ziel: true };
  }
  return { zeit: t, wall, vmax, fell, ziel: false };
}

/* --- Startpopulation: frisch oder aus vorhandenen Gewichten (--from) --- */
let seedW = null;
if (process.argv.includes('--from')) {
  require(path.join(ROOT, 'src/brainweights.js'));
  const alt = MK.brainWeights && MK.brainWeights[COURSE];
  if (alt) { seedW = Float64Array.from(alt.w); console.log('Starte von vorhandenen Gewichten'); }
}
console.log(`Strecke: ${spec.name} (${(track.length / 1000).toFixed(2)} km)`);
let pop = [];
for (let i = 0; i < POP; i++) {
  const w = new Float64Array(NW);
  if (seedW) { w.set(seedW); if (i > 0) for (let j = 0; j < NW; j++) w[j] += gauss() * 0.06; }
  else for (let j = 0; j < NW; j++) w[j] = gauss() * 0.4;
  pop.push(w);
}

let best = null, bestFit = -Infinity;
let stagnation = 0, heat = 1;                 // Streuung wieder anheben, wenn nichts mehr besser wird
const t0 = Date.now();
for (let gen = 0; gen < GENS; gen++) {
  const scored = pop.map(w => ({ w, f: fitness(w) })).sort((a, b) => b.f - a.f);
  if (scored[0].f > bestFit + 0.5) {
    bestFit = scored[0].f; best = Float64Array.from(scored[0].w);
    stagnation = 0; heat = Math.max(1, heat * 0.55);
  } else {
    if (scored[0].f > bestFit) { bestFit = scored[0].f; best = Float64Array.from(scored[0].w); }
    if (++stagnation >= 18) { heat = Math.min(2.2, heat * 1.4); stagnation = 0; }
  }

  const sigma = Math.max(0.025, 0.28 * Math.pow(0.986, gen)) * heat;
  const next = [best];                                     // Bester bleibt erhalten
  for (let i = 0; i < ELITE && next.length < POP; i++) next.push(scored[i].w);
  while (next.length < POP) {
    const parent = scored[(rnd() * ELITE) | 0].w;
    const child = Float64Array.from(parent);
    for (let j = 0; j < NW; j++) if (rnd() < 0.85) child[j] += gauss() * sigma;
    next.push(child);
  }
  pop = next;

  if (!QUIET && (gen % 10 === 0 || gen === GENS - 1)) {
    const ct = courseTime(best);
    const mean = scored.reduce((a, b) => a + b.f, 0) / scored.length;
    console.log(`Gen ${String(gen).padStart(3)} | Bewertung ${scored[0].f.toFixed(0).padStart(5)} ` +
      `| Mittel ${mean.toFixed(0).padStart(5)} | Streuung ${sigma.toFixed(3)} | Hitze ${heat.toFixed(1)} ` +
      `| Lauf ${ct.ziel ? ct.zeit.toFixed(1) + ' s' : 'nicht im Ziel'} ` +
      `| Planke ${ct.wall.toFixed(1)} s | Abstuerze ${ct.fell} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}

/* --- Ergebnis pruefen und ablegen --- */
const rounded = Float64Array.from(best, v => Math.round(v * 1e4) / 1e4);
const check = courseTime(rounded);
console.log('\nErgebnis nach Rundung der Gewichte auf vier Stellen:');
console.log('  Laufzeit:', check.ziel ? check.zeit.toFixed(2) + ' s' : 'Ziel nicht erreicht');
console.log('  Plankenkontakt:', check.wall.toFixed(1), 's | Abstuerze:', check.fell,
            '| Spitze', (check.vmax * 3.6).toFixed(0), 'km/h');

/* Vorhandene Gewichte der anderen Strecken erhalten */
const ZIEL = path.join(ROOT, 'src/brainweights.js');
let alle = {};
if (fs.existsSync(ZIEL)) {
  delete require.cache[require.resolve(ZIEL)];
  MK.brainWeights = null;
  require(ZIEL);
  alle = MK.brainWeights || {};
}
alle[COURSE] = { shape: MK.brain.SHAPE, lauf: check.ziel ? +check.zeit.toFixed(2) : null,
                 w: Array.from(rounded) };

const teile = Object.keys(alle).map(id =>
  `    ${id}: {\n      shape: [${alle[id].shape.join(', ')}],\n` +
  `      lauf: ${alle[id].lauf === null ? 'null' : alle[id].lauf},\n` +
  `      w: [${alle[id].w.join(',')}]\n    }`).join(',\n');
const out = `/* Gewichte der KI-Fahrer, je Strecke eine Zahlenreihe.
 * Erzeugt von ai/train.js - Aufbau ${MK.brain.SHAPE.join('-')}, ${NW} Zahlen je Strecke.
 * Nicht von Hand aendern, neu erzeugen mit:
 *   node ai/train.js --course <name> --gen 300
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};
  MK.brainWeights = {
${teile}
  };
})(typeof window !== 'undefined' ? window : global);
`;
fs.writeFileSync(ZIEL, out);
console.log('  geschrieben: src/brainweights.js (' + (out.length / 1024).toFixed(1) + ' kB, Strecken: ' +
            Object.keys(alle).join(', ') + ')');
