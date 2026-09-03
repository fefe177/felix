/* Schleifental GP - die Strecken.
 *
 * Jede Strecke ist reine Beschreibung: Kontrollpunkte der Abfahrt, die
 * eingesetzten Kunststuecke und eine Farbwelt. src/track.js macht daraus die
 * Geometrie, src/world.js die Landschaft.
 *
 * Kontrollpunkte sind [x, Hoehe, z]. Alle Positionen der Kunststuecke sind
 * Anteile der Streckenlaenge (0 = Start, 1 = Ziel).
 */
(function (root) {
  'use strict';
  var MK = root.MK = root.MK || {};

  /* Farbwelten. himmel = Verlauf von oben nach unten. */
  var ALPEN = {
    himmel: ['#2f6fb5', '#79b6e8', '#bfe0f2', '#e9f1e2'],
    nebel: '#cfe3f0', nebelVon: 420, nebelBis: 2600,
    boden: '#6f9e4e', huegel: '#5c8a52', huegelFern: '#6f8f92', fels: '#8d8f93',
    stamm: '#6a4a30', krone: '#3f7f3c', krone2: '#4f9445',
    asphalt: '#3b414f', asphalt2: '#343a47', unten: '#333a4b', kante: '#2b3040',
    sonne: '#fff6d8', sonnePos: [-0.42, 0.55, 0.32], licht: '#fff2dc',
    himmelLicht: '#dcefff', bodenLicht: '#5d7f45', baeume: 260, wolken: 26
  };
  var KRATER = {
    himmel: ['#3b1955', '#8a3a63', '#e0724a', '#ffb765'],
    nebel: '#e8a06a', nebelVon: 360, nebelBis: 2200,
    boden: '#8a5136', huegel: '#6d4030', huegelFern: '#5a3a3e', fels: '#5e463c',
    stamm: '#4a3226', krone: '#6b6338', krone2: '#7d7040',
    asphalt: '#3a3540', asphalt2: '#332e39', unten: '#3a3038', kante: '#2a2228',
    sonne: '#ffd9a0', sonnePos: [0.62, 0.18, -0.5], licht: '#ffd2a0',
    himmelLicht: '#ffcfa8', bodenLicht: '#7a4a30', baeume: 120, wolken: 14
  };
  var WOLKEN = {
    himmel: ['#141c46', '#3a4f92', '#8fa8dd', '#dbe6fa'],
    nebel: '#cddcf5', nebelVon: 300, nebelBis: 2000,
    boden: '#c9d8f2', huegel: '#9fb4e0', huegelFern: '#b6c6e8', fels: '#8f9dc0',
    stamm: '#5c5a72', krone: '#6f86b8', krone2: '#7d93c4',
    asphalt: '#333a4d', asphalt2: '#2d3446', unten: '#39415a', kante: '#272d3f',
    sonne: '#ffe9c0', sonnePos: [-0.3, 0.12, -0.62], licht: '#ffe3c8',
    himmelLicht: '#dbe6fa', bodenLicht: '#8b9ec8', baeume: 40, wolken: 46
  };

  MK.courses = [
    {
      id: 'talfahrt',
      name: 'Talfahrt',
      tagline: 'Vom Gipfel ins Tal',
      grad: 1,
      roadHalf: 8.0,
      palette: ALPEN,
      grund: -9,
      course: [
        [   0, 210,    0], [ 110, 206,   10], [ 230, 190,   40], [ 330, 168,  120],
        [ 400, 150,  230], [ 430, 136,  350], [ 470, 124,  460], [ 560, 116,  540],
        [ 680, 112,  560], [ 800, 108,  520], [ 890, 102,  430], [ 930,  96,  320],
        [ 950,  92,  210], [ 960,  88,  100], [ 940,  80,  -20], [ 880,  72, -130],
        [ 790,  66, -200], [ 680,  62, -230], [ 570,  56, -210], [ 480,  50, -215],
        [ 390,  42, -160], [ 385,  34,  -60], [ 450,  26,   -5], [ 545,  18,  -30],
        [ 575,  12, -110], [ 520,   6, -190], [ 400,   2, -240], [ 270,   0, -250],
        [ 150,   0, -240]
      ],
      loops: [
        { u: 0.360, hgt: 44, c: 0.50, pf: 0.30, lat:  9 },
        { u: 0.660, hgt: 38, c: 0.50, pf: 0.30, lat: -9 }
      ],
      twists: [{ u: 0.185, len: 130, turns: 1 }],
      banks:  [{ u: 0.530, len: 215, angle: 82 }],
      bumps:  [{ u: 0.128, len: 34, hgt: 2.6 }, { u: 0.790, len: 30, hgt: 2.4 }],
      gaps:   [{ u: 0.487, len: 34, vRef: 33 }],
      pads:   [0.030, 0.230, 0.330, 0.455, 0.620, 0.760, 0.880]
    },

    {
      id: 'kraterrand',
      name: 'Kraterrand',
      tagline: 'Spirale in den Vulkan',
      grad: 2,
      roadHalf: 6.8,
      palette: KRATER,
      grund: -20,
      /* Eine Spirale abwaerts in den Krater, mit wechselndem Radius, damit sie
         nicht gleichmaessig bleibt. Zum Schluss der Sturz auf den Kraterboden. */
      course: (function () {
        var pts = [], i, n = 15;
        for (i = 0; i <= n; i++) {
          var a = i * 36 * Math.PI / 180;                 // 1,5 Umdrehungen
          var r = 275 - i * 9 + (i % 2 ? 11 : -11);       // leichte Wellen im Radius
          pts.push([Math.cos(a) * r, 176 - i * 9, Math.sin(a) * r]);
        }
        return pts.concat([                                // Sturz auf den Kraterboden
          [-120,  28,  -72], [ -55,  17, -128], [  35,   9, -142],
          [ 125,   4, -106], [ 180,   1,  -36], [ 200,   0,   44]
        ]);
      })(),
      loops: [
        { u: 0.205, hgt: 40, c: 0.50, pf: 0.30, lat:  8 },
        { u: 0.520, hgt: 34, c: 0.50, pf: 0.30, lat: -8 },
        { u: 0.790, hgt: 30, c: 0.50, pf: 0.30, lat:  8 }
      ],
      twists: [{ u: 0.375, len: 150, turns: 1 }, { u: 0.665, len: 120, turns: 1 }],
      banks:  [{ u: 0.290, len: 170, angle: 84 }, { u: 0.610, len: 140, angle: 80 }],
      bumps:  [{ u: 0.115, len: 30, hgt: 2.8 }, { u: 0.700, len: 26, hgt: 2.2 }],
      gaps:   [{ u: 0.445, len: 40, vRef: 36 }, { u: 0.880, len: 32, vRef: 34 }],
      pads:   [0.035, 0.250, 0.420, 0.575, 0.855]
    },

    {
      id: 'wolkenpfad',
      name: 'Wolkenpfad',
      tagline: 'Schmaler Grat ueber den Wolken',
      grad: 3,
      roadHalf: 6.0,
      palette: WOLKEN,
      grund: 40,
      course: [
        [0, 300, 0], [156, 296, 0], [328, 288, 30], [480, 278, 113],
        [566, 268, 228], [523, 258, 330], [395, 250, 379], [264, 242, 343],
        [197, 232, 246], [215, 222, 130], [297, 212, 48], [426, 202, 15],
        [559, 192, 48], [656, 182, 139], [690, 172, 256], [640, 160, 362],
        [525, 150, 426], [394, 142, 426], [279, 134, 369], [212, 126, 271],
        [230, 118, 162], [330, 112, 98], [459, 108, 98], [574, 102, 164],
        [625, 92, 272], [574, 80, 371], [459, 70, 420], [344, 66, 394]
      ],
      loops: [
        { u: 0.300, hgt: 36, c: 0.50, pf: 0.30, lat:  8 },
        { u: 0.700, hgt: 34, c: 0.50, pf: 0.30, lat: -8 },
        { u: 0.760, hgt: 30, c: 0.50, pf: 0.30, lat:  8 }
      ],
      twists: [{ u: 0.470, len: 165, turns: 1 }, { u: 0.885, len: 130, turns: 1 }],
      banks:  [{ u: 0.180, len: 150, angle: 84 }, { u: 0.600, len: 160, angle: 86 }],
      bumps:  [{ u: 0.060, len: 28, hgt: 2.2 }, { u: 0.840, len: 26, hgt: 2.0 }],
      gaps:   [{ u: 0.120, len: 42, vRef: 38 }, { u: 0.395, len: 38, vRef: 36 },
               { u: 0.930, len: 34, vRef: 34 }],
      pads:   [0.045, 0.360, 0.660, 0.905]
    }
  ];

  MK.courseById = function (id) {
    for (var i = 0; i < MK.courses.length; i++) if (MK.courses[i].id === id) return MK.courses[i];
    return MK.courses[0];
  };
})(typeof window !== 'undefined' ? window : global);
