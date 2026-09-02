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
require(path.join(ROOT, 'src/track.js'));
require(path.join(ROOT, 'src/kart.js'));
require(path.join(ROOT, 'src/brain.js'));
const MK = global.MK;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
};
const QUIET = process.argv.includes('--quiet');

const GENS = arg('gen', 300);
const POP = arg('pop', 96);
const ELITE = Math.max(4, Math.round(POP / 8));
const SEED = arg('seed', 7);
const DT = 1 / 120;

const track = MK.track.build();
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
  { s: L - 14, v: 0,  secs: 24 },     // Startaufstellung, aus dem Stand
  { s: L / 3,  v: 30, secs: 22 },
  { s: 2 * L / 3, v: 30, secs: 22 }
];

const net = MK.brain.create(new Float64Array(NW));
function run(weights, start, collect) {
  net.w.set(weights);
  const k = MK.kart.state(start.s, 0);
  k.v = start.v;
  const steps = Math.round(start.secs / DT);
  let prev = k.s, dist = 0, wall = 0, vmax = 0, air = 0;
  for (let i = 0; i < steps; i++) {
    MK.kart.step(k, track, MK.brain.decide(net, k, track), DT);
    MK.kart.pads(k, track);                          // Turbofelder wie im Spiel
    let d = ((k.s - prev + L * 1.5) % L) - L * 0.5;
    dist += d; prev = k.s;
    if (k.touching) wall += DT;
    if (k.air) air += DT;
    if (k.v > vmax) vmax = k.v;
    if (i > 900 && dist < 30) break;                 // steht oder faehrt rueckwaerts
  }
  return collect ? { dist, wall, vmax, air } : dist - 25 * wall;
}
function fitness(weights) {
  let f = 0;
  for (const st of STARTS) f += run(weights, st, false);
  return f;
}

/* Rundenzeit aus dem Stand - das eigentliche Ziel, nur zur Anzeige */
function lapTimes(weights, laps) {
  net.w.set(weights);
  const k = MK.kart.state(L - 14, 0);
  let prev = k.s, dist = 0, t = 0, out = [], next = 14, wall = 0, vmax = 0;
  for (let i = 0; i < Math.round(400 / DT); i++) {
    MK.kart.step(k, track, MK.brain.decide(net, k, track), DT);
    MK.kart.pads(k, track);
    dist += ((k.s - prev + L * 1.5) % L) - L * 0.5; prev = k.s; t += DT;
    if (k.touching) wall += DT;
    if (k.v > vmax) vmax = k.v;
    if (dist >= next) {                       // erste Marke = Start-Ziel-Linie
      if (next > 14) out.push(t);
      next = next > 14 ? next + L : 14 + L;
      t = 0;
      if (out.length >= laps) break;
    }
  }
  return { laps: out, wall, vmax };
}

/* --- Startpopulation: frisch oder aus vorhandenen Gewichten (--from) --- */
let seedW = null;
if (process.argv.includes('--from')) {
  require(path.join(ROOT, 'src/brainweights.js'));
  seedW = Float64Array.from(MK.brainWeights.w);
  console.log('Starte von vorhandenen Gewichten (Runde ' + MK.brainWeights.lap + ' s)');
}
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
    const lt = lapTimes(best, 1);
    const mean = scored.reduce((a, b) => a + b.f, 0) / scored.length;
    console.log(`Gen ${String(gen).padStart(3)} | beste Bewertung ${scored[0].f.toFixed(0).padStart(5)} ` +
      `| Mittel ${mean.toFixed(0).padStart(5)} | Streuung ${sigma.toFixed(3)} ` +
      `| Runde ${lt.laps.length ? lt.laps[0].toFixed(2) + ' s' : '--'} | Hitze ${heat.toFixed(1)} ` +
      `| Planke ${lt.wall.toFixed(1)} s | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}

/* --- Ergebnis pruefen und ablegen --- */
const rounded = Float64Array.from(best, v => Math.round(v * 1e4) / 1e4);
const check = lapTimes(rounded, 3);
console.log('\nErgebnis nach Rundung der Gewichte auf vier Stellen:');
console.log('  Rundenzeiten:', check.laps.map(t => t.toFixed(2) + ' s').join(', ') || 'keine Runde beendet');
console.log('  Plankenkontakt:', check.wall.toFixed(1), 's | Spitze', (check.vmax * 3.6).toFixed(0), 'km/h');

const out = `/* Gewichte des KI-Fahrers - erzeugt von ai/train.js
 * Aufbau ${MK.brain.SHAPE.join('-')}, ${NW} Zahlen, ${GENS} Generationen a ${POP} Individuen,
 * Startwert ${SEED}. Beste Runde im Training: ${check.laps.length ? check.laps[0].toFixed(2) + ' s' : '-'}.
 * Nicht von Hand aendern - neu erzeugen mit:  node ai/train.js
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};
  MK.brainWeights = {
    shape: [${MK.brain.SHAPE.join(', ')}],
    lap: ${check.laps.length ? check.laps[0].toFixed(2) : 'null'},
    w: [${Array.from(rounded).join(',')}]
  };
})(typeof window !== 'undefined' ? window : global);
`;
fs.writeFileSync(path.join(ROOT, 'src/brainweights.js'), out);
console.log('  geschrieben: src/brainweights.js (' + (out.length / 1024).toFixed(1) + ' kB)');
