#!/usr/bin/env node
/* Schleifental GP - Fahrstil des KI-Fahrers vermessen.
 * Vergleicht das trainierte Netz mit dem handgeschriebenen Autopiloten:
 * Laufzeit vom Start ins Ziel, Turbo-Anteil, Drifts, Plankenkontakt, Abstuerze.
 *   node ai/analyse.js
 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.self = global;
global.THREE = require(path.join(ROOT, 'vendor/three.min.js'));
require(path.join(ROOT, 'src/courses.js'));
require(path.join(ROOT, 'src/track.js'));
require(path.join(ROOT, 'src/kart.js'));
require(path.join(ROOT, 'src/brain.js'));
require(path.join(ROOT, 'src/brainweights.js'));
const MK = global.MK;

const ID = process.argv[2] || MK.courses[0].id;
const spec = MK.courseById(ID);
const track = MK.track.build(spec), L = track.length, DT = 1 / 120;
console.log(`Strecke: ${spec.name} (${(L / 1000).toFixed(2)} km, Grad ${spec.grad})`);

function drive(controller) {
  const k = MK.kart.state(0, 0);
  let t = 0, boost = 0, drift = 0, wall = 0, air = 0, vmax = 0, vsum = 0, n = 0;
  let turbos = 0, wasBoost = false, xsum = 0, fell = 0, ziel = false;
  for (let i = 0; i < Math.round(300 / DT); i++) {
    const inp = controller(k);
    MK.kart.step(k, track, inp, DT);
    MK.kart.pads(k, track);
    t += DT;
    if (k.boost > 0) boost += DT;
    if (!wasBoost && k.boost > 0) turbos++;
    wasBoost = k.boost > 0;
    if (k.drift > 0) drift += DT;
    if (k.touching) wall += DT;
    if (k.air) air += DT;
    if (k.v > vmax) vmax = k.v;
    vsum += k.v; n++; xsum += Math.abs(k.x);
    if (k.fell) { fell++; k.fell = 0; k.s = Math.max(0, k.s - 120); k.v = 20; k.h = 0; k.air = false; }
    if (k.s >= L - 2) { ziel = true; break; }
  }
  return {
    laufzeit: +t.toFixed(2), imZiel: ziel, abstuerze: fell,
    turboAnteil: +(boost / t * 100).toFixed(0),
    turbos: turbos,
    driftAnteil: +(drift / t * 100).toFixed(0),
    planke: +wall.toFixed(2),
    luft: +air.toFixed(2),
    spitze: +(vmax * 3.6).toFixed(0),
    mittel: +(vsum / n * 3.6).toFixed(0),
    abstandMitte: +(xsum / n).toFixed(1)
  };
}

const w = MK.brainWeights[ID];
if (!w) { console.log('Fuer diese Strecke gibt es noch keine Gewichte.'); process.exit(0); }
const net = MK.brain.create(Float64Array.from(w.w), w.shape);
console.log('KI-Fahrer (neuronales Netz):');
console.log(' ', JSON.stringify(drive(k => MK.brain.decide(net, k, track))));
console.log('Autopilot (handgeschrieben, Pure Pursuit):');
console.log(' ', JSON.stringify(drive(k => MK.kart.autopilot(k, track, { top: 46 }))));

/* Lenkverhalten des Netzes: wie oft wechselt es die Richtung? */
const k2 = MK.kart.state(0, 0);
let wechsel = 0, letzte = 0, proben = 0;
for (let i = 0; i < Math.round(60 / DT); i++) {
  const inp = MK.brain.decide(net, k2, track);
  MK.kart.step(k2, track, inp, DT);
  MK.kart.pads(k2, track);
  const s = Math.abs(inp.steer) > 0.3 ? Math.sign(inp.steer) : 0;
  if (s !== 0 && letzte !== 0 && s !== letzte) wechsel++;
  if (s !== 0) letzte = s;
  proben++;
}
console.log('Lenkrichtungswechsel je Minute:', Math.round(wechsel));
