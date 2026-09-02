/* Schleifental GP - der KI-Fahrer.
 *
 * Ein kleines neuronales Netz, von Hand geschrieben: keine Bibliothek, keine
 * Matrixklasse, nur ein flaches Zahlenfeld und zwei Schleifen. Das Netz sieht
 * dieselbe Welt, die ein Mensch sieht (Tempo, Lage auf der Fahrbahn, Verlauf
 * der Strecke voraus) und bedient dieselben vier Tasten (Gas, Bremse, Lenkung,
 * Drift). Die Gewichte kommen aus ai/train.js.
 *
 *   Aufbau:  18 Eingaenge -> 16 verdeckte Neuronen (tanh) -> 3 Ausgaenge (tanh)
 *   Das sind 18*16 + 16 + 16*3 + 3 = 355 Zahlen.
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};

  var SHAPE = [18, 16, 3];
  var AHEAD = [12, 25, 45, 70, 105, 150];   // Blickweiten fuer die Kruemmung
  var PITCH = [10, 45, 90];                 // Blickweiten fuer Steigung
  var VCURV = [20, 60];                     // Blickweiten fuer Kuppen und Loopings

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* Schnelle Naeherung fuer tanh (Pade 3/2). Math.tanh kostet in JS rund
     80 ns je Aufruf, bei 19 Neuronen und 120 Schritten je Sekunde faellt das
     im Training ins Gewicht. Abweichung unter 0,3 Prozent. */
  function act(x) {
    if (x < -3) return -1;
    if (x > 3) return 1;
    var x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }

  function weightCount(shape) {
    var n = 0;
    for (var i = 0; i + 1 < shape.length; i++) n += shape[i] * shape[i + 1] + shape[i + 1];
    return n;
  }

  function create(weights, shape) {
    shape = shape || SHAPE;
    var w = weights || new Float64Array(weightCount(shape));
    return { shape: shape, w: w, buf: [new Float64Array(shape[0])] .concat(
      shape.slice(1).map(function (n) { return new Float64Array(n); })) };
  }

  /* Vorwaertsrechnung: fuer jede Schicht  y = tanh(W*x + b) */
  function forward(net, x) {
    var shape = net.shape, w = net.w, buf = net.buf, p = 0;
    var inp = x;
    for (var L = 0; L + 1 < shape.length; L++) {
      var nIn = shape[L], nOut = shape[L + 1], out = buf[L + 1];
      for (var j = 0; j < nOut; j++) {
        var sum = w[p + nIn * nOut + j];                 // Schwellwert
        var base = p + j * nIn;
        for (var i = 0; i < nIn; i++) sum += w[base + i] * inp[i];
        out[j] = act(sum);
      }
      p += nIn * nOut + nOut;
      inp = out;
    }
    return inp;
  }

  /* Was der Fahrer sieht. Alle Werte grob auf -1..1 gebracht. */
  var _s = { yaw: 0, vk: 0, ty: 0, w: 1 };
  function sense(k, track, out) {
    var f = k._f || MK.track.frameAt(track, k.s);
    var i, n = 0;
    out = out || new Float64Array(SHAPE[0]);
    out[n++] = clamp(k.v / 46, -1.4, 1.6);
    out[n++] = clamp(k.x / Math.max(1, f.half), -1.6, 1.6);
    out[n++] = clamp(k.phi / 0.55, -1, 1);
    out[n++] = clamp(k.slide / 8, -1, 1);
    out[n++] = k.air ? 1 : 0;
    out[n++] = k.boost > 0 ? 1 : 0;
    for (i = 0; i < AHEAD.length; i++) {
      out[n++] = clamp(MK.track.sample(track, k.s + AHEAD[i], _s).yaw * 20, -1, 1);
    }
    for (i = 0; i < PITCH.length; i++) {
      out[n++] = clamp(MK.track.sample(track, k.s + PITCH[i], _s).ty, -1, 1);
    }
    for (i = 0; i < VCURV.length; i++) {
      out[n++] = clamp(MK.track.sample(track, k.s + VCURV[i], _s).vk * 15, -1, 1);
    }
    out[n++] = clamp((MK.track.sample(track, k.s + 40, _s).w - 0.81) * 5, -1, 1);
    return out;
  }

  /* Netzausgabe auf die vier Bedienelemente abbilden. */
  var _in = new Float64Array(SHAPE[0]);
  var _cmd = { gas: 0, brake: 0, steer: 0, drift: 0, hop: 0 };
  function decide(net, k, track) {
    var o = forward(net, sense(k, track, _in));
    _cmd.steer = clamp(o[0], -1, 1);
    _cmd.gas = o[1] > 0.02 ? 1 : 0;
    _cmd.brake = o[1] < -0.2 ? 1 : 0;
    _cmd.drift = o[2] > 0.3 ? 1 : 0;
    _cmd.hop = 0;
    return _cmd;
  }

  MK.brain = { SHAPE: SHAPE, create: create, forward: forward, sense: sense,
               decide: decide, weightCount: weightCount, act: act };
})(typeof window !== 'undefined' ? window : global);
