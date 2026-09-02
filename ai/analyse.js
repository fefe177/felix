#!/usr/bin/env node
/* Schleifental GP - Fahrstil des KI-Fahrers vermessen.
 * Vergleicht das trainierte Netz mit dem handgeschriebenen Autopiloten:
 * Rundenzeit, Turbo-Anteil, Drifts, Plankenkontakt, Linie.
 *   node ai/analyse.js
 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.self = global;
global.THREE = require(path.join(ROOT, 'vendor/three.min.js'));
require(path.join(ROOT, 'src/track.js'));
require(path.join(ROOT, 'src/kart.js'));
require(path.join(ROOT, 'src/brain.js'));
require(path.join(ROOT, 'src/brainweights.js'));
const MK = global.MK;

const track = MK.track.build(), L = track.length, DT = 1 / 120;

function drive(controller, laps) {
  const k = MK.kart.state(L - 14, 0);
  let prev = k.s, dist = 0, t = 0, next = 14, times = [];
  let boost = 0, drift = 0, wall = 0, air = 0, vmax = 0, vsum = 0, n = 0;
  let turbos = 0, wasBoost = false, xsum = 0, richtung = 0;
  for (let i = 0; i < Math.round(500 / DT); i++) {
    const inp = controller(k);
    MK.kart.step(k, track, inp, DT);
    MK.kart.pads(k, track);
    dist += ((k.s - prev + L * 1.5) % L) - L * 0.5; prev = k.s; t += DT;
    if (k.boost > 0) boost += DT;
    if (!wasBoost && k.boost > 0) turbos++;
    wasBoost = k.boost > 0;
    if (k.drift > 0) drift += DT;
    if (k.touching) wall += DT;
    if (k.air) air += DT;
    if (k.v > vmax) vmax = k.v;
    vsum += k.v; n++; xsum += Math.abs(k.x);
    if (Math.sign(inp.steer) !== richtung && Math.abs(inp.steer) > 0.25) richtung = Math.sign(inp.steer);
    if (dist >= next) {
      if (next > 14) times.push(t);
      next = next > 14 ? next + L : 14 + L;
      t = 0;
      if (times.length >= laps) break;
    }
  }
  const ges = times.reduce((a, b) => a + b, 0) || 1;
  return {
    runden: times.map(x => +x.toFixed(2)),
    beste: times.length ? +Math.min(...times).toFixed(2) : null,
    turboAnteil: +(boost / (ges + 1e-9) * 100).toFixed(0),
    turbos: +(turbos / Math.max(1, times.length)).toFixed(1),
    driftAnteil: +(drift / (ges + 1e-9) * 100).toFixed(0),
    planke: +(wall / Math.max(1, times.length)).toFixed(2),
    luft: +(air / Math.max(1, times.length)).toFixed(2),
    spitze: +(vmax * 3.6).toFixed(0),
    mittel: +(vsum / n * 3.6).toFixed(0),
    abstandMitte: +(xsum / n).toFixed(1)
  };
}

const net = MK.brain.create(Float64Array.from(MK.brainWeights.w), MK.brainWeights.shape);
console.log('KI-Fahrer (neuronales Netz):');
console.log(' ', JSON.stringify(drive(k => MK.brain.decide(net, k, track), 3)));
console.log('Autopilot (handgeschrieben, Pure Pursuit):');
console.log(' ', JSON.stringify(drive(k => MK.kart.autopilot(k, track, { top: 46 }), 3)));

/* Lenkverhalten des Netzes: wie oft wechselt es die Richtung? */
const k2 = MK.kart.state(L - 14, 0);
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
