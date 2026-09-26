// Bauplan-Modell: führt Claudes Bauplan-Skript in einer Sandbox aus, prüft alle Blocknamen
// und liefert eine Blockliste, eine automatische Fehlerprüfung und Schichtbilder als Text.
//
// Koordinaten im Bauplan (lokal): x nach Osten (rechts), z nach Süden (zum Spieler hin),
// y nach oben. y = 0 ist die erste Schicht über dem Boden, y = -1 ist die Bodenschicht.
// Die Vorderseite des Gebäudes ist die Südseite (größtes z) – dort steht der Spieler.

const vm = require('vm')

const VERSION = '1.21.4'
const registry = require('prismarine-registry')(VERSION)
const Block = require('prismarine-block')(registry)

const MAX_BLOCKS = 60000
const LIMIT_XZ = 64
const LIMIT_Y_MIN = -8
const LIMIT_Y_MAX = 120

class BauFehler extends Error {}

const DIRS = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] }

// ---------- Blöcke ----------

function parseBlock (text) {
  const m = /^\s*(?:minecraft:)?([a-z0-9_]+)\s*(?:\[([^\]]*)\])?\s*$/.exec(String(text || '').toLowerCase())
  if (!m) throw new BauFehler(`"${text}" ist kein gültiger Block (Beispiel: "oak_stairs[facing=north,half=bottom]")`)
  const props = {}
  if (m[2]) {
    for (const part of m[2].split(',').map(p => p.trim()).filter(Boolean)) {
      const [k, v] = part.split('=').map(s => s && s.trim())
      if (!k || v === undefined) throw new BauFehler(`Zustand "${part}" in "${text}" muss die Form name=wert haben`)
      props[k] = v
    }
  }
  return { name: m[1], props }
}

function similarNames (name) {
  const words = name.split('_').filter(w => w.length > 2)
  return registry.blocksArray.map(b => b.name)
    .filter(n => words.some(w => n.includes(w)))
    .slice(0, 6)
}

const cache = new Map()
// Prüft einen Block und gibt eine einheitliche Schreibweise zurück ("name" oder "name[k=v,...]").
function normalizeBlock (text) {
  if (cache.has(text)) return cache.get(text)
  const { name, props } = parseBlock(text)
  const def = registry.blocksByName[name]
  if (!def) {
    const hint = similarNames(name)
    throw new BauFehler(`Unbekannter Block "${name}".${hint.length ? ' Meintest du: ' + hint.join(', ') + '?' : ''}`)
  }
  const states = def.states || []
  const keys = Object.keys(props).sort()
  for (const k of keys) {
    const st = states.find(s => s.name === k)
    if (!st) throw new BauFehler(`${name} hat keinen Zustand "${k}". Mögliche: ${states.map(s => s.name).join(', ') || 'keine'}`)
    const allowed = st.type === 'bool' ? ['true', 'false'] : (st.values || []).map(String)
    if (!allowed.includes(props[k])) throw new BauFehler(`${name}: ${k}=${props[k]} geht nicht. Erlaubt: ${allowed.join(', ')}`)
  }
  const out = keys.length ? `${name}[${keys.map(k => `${k}=${props[k]}`).join(',')}]` : name
  cache.set(text, out)
  return out
}

function blockName (spec) { return spec.split('[')[0] }
function blockProps (spec) { return parseBlock(spec).props }

// Vollständiger Zustand (fehlende Werte = Standardzustand des Blocks), für die Vorschau.
function fullState (spec) {
  const { name, props } = parseBlock(spec)
  const def = registry.blocksByName[name]
  const defaults = Block.fromStateId(def.defaultState, 0).getProperties()
  const merged = { ...defaults }
  for (const [k, v] of Object.entries(props)) merged[k] = v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v
  return { name, props: merged }
}

function isAir (name) { return name === 'air' || name === 'cave_air' || name === 'void_air' }
function isFullSolid (name) {
  const def = registry.blocksByName[name]
  return !!def && def.boundingBox === 'block' && !/(slab|stairs|fence|wall|pane|bars|door|trapdoor|glass|leaves|lantern|chain|ladder|carpet|bed|sign|banner|torch|button|plate|rail|flower_pot|candle|head|skull|chest|anvil|bell|campfire|lectern|cake|scaffolding|path|farmland|snow)/.test(name)
}

// ---------- Die Bau-Helfer (das "b" im Bauplan) ----------

function int (v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BauFehler(`${what} muss eine Zahl sein (bekommen: ${v})`)
  return Math.round(v)
}

function createBuilder () {
  const blocks = new Map()
  const notes = [] // Hinweise, die die Prüfung später mit ausgibt
  const key = (x, y, z) => `${x},${y},${z}`

  function set (x, y, z, block) {
    x = int(x, 'x'); y = int(y, 'y'); z = int(z, 'z')
    if (Math.abs(x) > LIMIT_XZ || Math.abs(z) > LIMIT_XZ || y < LIMIT_Y_MIN || y > LIMIT_Y_MAX) {
      throw new BauFehler(`Block bei (${x}, ${y}, ${z}) ist zu weit weg (erlaubt: x/z ±${LIMIT_XZ}, y ${LIMIT_Y_MIN}..${LIMIT_Y_MAX})`)
    }
    const spec = normalizeBlock(block)
    if (isAir(blockName(spec))) { blocks.delete(key(x, y, z)); return }
    blocks.set(key(x, y, z), spec)
    if (blocks.size > MAX_BLOCKS) throw new BauFehler(`Zu viele Blöcke (mehr als ${MAX_BLOCKS})`)
  }

  function range (a, b) { const lo = Math.min(a, b); const hi = Math.max(a, b); const out = []; for (let i = lo; i <= hi; i++) out.push(i); return out }

  const b = {
    set,
    get (x, y, z) { return blocks.get(key(Math.round(x), Math.round(y), Math.round(z))) || 'air' },
    fill (x1, y1, z1, x2, y2, z2, block) {
      for (const y of range(int(y1, 'y1'), int(y2, 'y2'))) for (const z of range(int(z1, 'z1'), int(z2, 'z2'))) for (const x of range(int(x1, 'x1'), int(x2, 'x2'))) set(x, y, z, block)
    },
    clear (x1, y1, z1, x2, y2, z2) { b.fill(x1, y1, z1, x2, y2, z2, 'air') },
    // Nur die vier Außenwände (ohne Boden und Decke)
    walls (x1, y1, z1, x2, y2, z2, block) {
      const xs = [Math.min(x1, x2), Math.max(x1, x2)]
      const zs = [Math.min(z1, z2), Math.max(z1, z2)]
      for (const y of range(y1, y2)) {
        for (const x of range(xs[0], xs[1])) { set(x, y, zs[0], block); set(x, y, zs[1], block) }
        for (const z of range(zs[0], zs[1])) { set(xs[0], y, z, block); set(xs[1], y, z, block) }
      }
    },
    // Hohler Kasten: Wände, Boden und Decke
    box (x1, y1, z1, x2, y2, z2, block) {
      b.walls(x1, y1, z1, x2, y2, z2, block)
      b.fill(x1, y1, z1, x2, y1, z2, block)
      b.fill(x1, y2, z1, x2, y2, z2, block)
    },
    line (x1, y1, z1, x2, y2, z2, block) {
      const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1), 1)
      for (let i = 0; i <= n; i++) set(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, z1 + (z2 - z1) * i / n, block)
    },
    // Tür (unten + oben). facing = Blickrichtung beim Hineingehen (Haustür in der Südwand: 'north').
    door (x, y, z, block = 'oak_door', facing = 'north', hinge = 'left') {
      const name = blockName(normalizeBlock(block))
      if (!/_door$/.test(name)) throw new BauFehler(`b.door braucht eine Tür (z. B. oak_door), nicht ${name}`)
      set(x, y, z, `${name}[facing=${facing},half=lower,hinge=${hinge}]`)
      set(x, y + 1, z, `${name}[facing=${facing},half=upper,hinge=${hinge}]`)
    },
    // Bett: Fußteil bei (x,y,z), Kopfteil ein Block weiter in Richtung facing.
    bed (x, y, z, block = 'red_bed', facing = 'north') {
      const name = blockName(normalizeBlock(block))
      if (!/_bed$/.test(name)) throw new BauFehler(`b.bed braucht ein Bett (z. B. red_bed), nicht ${name}`)
      const d = DIRS[facing]
      if (!d || d[1] !== 0) throw new BauFehler('Bett-Richtung muss north, south, east oder west sein')
      for (const [px, pz] of [[x, z], [x + d[0], z + d[2]]]) {
        const before = blocks.get(key(Math.round(px), Math.round(y), Math.round(pz)))
        if (before) notes.push(`Das Bett überschreibt ${blockName(before)} bei (${px},${y},${pz}) – steckt es in einer Wand? Kopfteil liegt 1 Block Richtung facing.`)
      }
      set(x, y, z, `${name}[facing=${facing},part=foot]`)
      set(x + d[0], y, z + d[2], `${name}[facing=${facing},part=head]`)
    },
    // Zylinder (Turm). hollow: nur die Außenhaut.
    cylinder (cx, y1, cz, r, height, block, { hollow = false } = {}) {
      for (let y = y1; y < y1 + height; y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
            const d = Math.hypot(x - cx, z - cz)
            if (d <= r + 0.3 && (!hollow || d > r - 0.7)) set(x, y, z, block)
          }
        }
      }
    },
    // Kugel oder Kuppel (half: true = nur obere Hälfte)
    sphere (cx, cy, cz, r, block, { hollow = false, half = false } = {}) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        if (half && y < cy) continue
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
            const d = Math.hypot(x - cx, y - cy, z - cz)
            if (d <= r + 0.3 && (!hollow || d > r - 0.7)) set(x, y, z, block)
          }
        }
      }
    },
    // Satteldach aus Treppen über dem Rechteck x1..x2 / z1..z2, beginnt auf Höhe y.
    // axis 'x' = First läuft von West nach Ost (Dachflächen zeigen nach Norden/Süden), 'z' = umgekehrt.
    gableRoof (x1, z1, x2, z2, y, stairs, { axis = 'x', overhang = 1, gable = null, ridge = null } = {}) {
      const stairName = blockName(normalizeBlock(stairs))
      if (!/_stairs$/.test(stairName)) throw new BauFehler(`gableRoof braucht Treppen (z. B. spruce_stairs), nicht ${stairName}`)
      const [ax1, ax2] = [Math.min(x1, x2), Math.max(x1, x2)]
      const [az1, az2] = [Math.min(z1, z2), Math.max(z1, z2)]
      const along = axis === 'x' ? [ax1 - overhang, ax2 + overhang] : [az1 - overhang, az2 + overhang]
      let lo = axis === 'x' ? az1 - overhang : ax1 - overhang
      let hi = axis === 'x' ? az2 + overhang : ax2 + overhang
      const put = (a, c, yy, spec) => axis === 'x' ? set(a, yy, c, spec) : set(c, yy, a, spec)
      const [upLo, upHi] = axis === 'x' ? ['south', 'north'] : ['east', 'west']
      let yy = y
      while (lo < hi) {
        for (let a = along[0]; a <= along[1]; a++) {
          put(a, lo, yy, `${stairName}[facing=${upLo},half=bottom]`)
          put(a, hi, yy, `${stairName}[facing=${upHi},half=bottom]`)
        }
        // Giebelwand unter dem Dach füllen
        if (gable && lo + 1 <= hi - 1) {
          const inner = axis === 'x' ? [ax1, ax2] : [az1, az2]
          for (let c = Math.max(lo + 1, axis === 'x' ? az1 : ax1); c <= Math.min(hi - 1, axis === 'x' ? az2 : ax2); c++) {
            put(inner[0], c, yy, gable)
            put(inner[1], c, yy, gable)
          }
        }
        lo++; hi--; yy++
      }
      if (lo === hi) {
        const slab = stairName.replace(/_stairs$/, '_slab')
        const spec = ridge || (registry.blocksByName[slab] ? slab : 'oak_slab')
        for (let a = along[0]; a <= along[1]; a++) put(a, lo, yy, spec)
      }
      return yy
    }
  }
  return { b, blocks, notes }
}

// Führt ein Bauplan-Skript aus. Rückgabe: Liste {x, y, z, block}
function runPlan (code) {
  const { b, blocks, notes } = createBuilder()
  const log = []
  const context = vm.createContext({
    b,
    Math,
    console: { log: (...a) => { if (log.length < 50) log.push(a.join(' ')) } }
  })
  try {
    vm.runInContext(String(code), context, { timeout: 3000, filename: 'bauplan.js' })
  } catch (err) {
    if (err instanceof BauFehler) throw err
    const where = /bauplan\.js:(\d+)/.exec(err.stack || '')
    throw new BauFehler(`Fehler im Bauplan${where ? ` (Zeile ${where[1]})` : ''}: ${err.message}`)
  }
  const list = []
  for (const [k, block] of blocks) {
    const [x, y, z] = k.split(',').map(Number)
    list.push({ x, y, z, block })
  }
  if (!list.length) throw new BauFehler('Der Bauplan enthält keinen einzigen Block.')
  return { blocks: list, log, notes }
}

// ---------- Prüfen ----------

function bounds (blocks) {
  const bb = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
  for (const { x, y, z } of blocks) {
    bb.minX = Math.min(bb.minX, x); bb.maxX = Math.max(bb.maxX, x)
    bb.minY = Math.min(bb.minY, y); bb.maxY = Math.max(bb.maxY, y)
    bb.minZ = Math.min(bb.minZ, z); bb.maxZ = Math.max(bb.maxZ, z)
  }
  return bb
}

const GRAVITY = /^(sand|red_sand|gravel|.*_concrete_powder|anvil|chipped_anvil|damaged_anvil|suspicious_sand|suspicious_gravel|pointed_dripstone|scaffolding)$/
const NEEDS_FLOOR = /(^torch$|^soul_torch$|^redstone_torch$|_carpet$|_pressure_plate$|rail$|^redstone_wire$|_sapling$|^poppy$|^dandelion$|_tulip$|^allium$|^azure_bluet$|^oxeye_daisy$|^cornflower$|^lily_of_the_valley$|^flower_pot$|^potted_|_candle$|^candle$|^sweet_berry_bush$|^short_grass$|^fern$|^tall_grass$|^rose_bush$|^sunflower$|^lilac$|^peony$|_sign$)/
const NEEDS_WALL = /(^wall_torch$|_wall_torch$|^ladder$|_wall_sign$|_wall_banner$|_wall_hanging_sign$)/

function check (blocks) {
  const map = new Map(blocks.map(b => [`${b.x},${b.y},${b.z}`, b.block]))
  const at = (x, y, z) => map.get(`${x},${y},${z}`)
  const warnings = []

  // Schwebende Blöcke: nicht über andere Blöcke mit dem Boden verbunden
  const supported = new Set()
  const queue = []
  for (const b of blocks) if (b.y <= 0) { const k = `${b.x},${b.y},${b.z}`; supported.add(k); queue.push(b) }
  while (queue.length) {
    const c = queue.pop()
    for (const d of Object.values(DIRS)) {
      const k = `${c.x + d[0]},${c.y + d[1]},${c.z + d[2]}`
      if (!supported.has(k) && map.has(k)) { supported.add(k); queue.push({ x: c.x + d[0], y: c.y + d[1], z: c.z + d[2] }) }
    }
  }
  const floating = blocks.filter(b => !supported.has(`${b.x},${b.y},${b.z}`))
  if (floating.length) {
    warnings.push(`${floating.length} Block/Blöcke schweben ohne Verbindung zum Boden, z. B. ${floating.slice(0, 4).map(b => `(${b.x},${b.y},${b.z}) ${blockName(b.block)}`).join(', ')}`)
  }

  for (const { x, y, z, block } of blocks) {
    const name = blockName(block)
    const props = blockProps(block)
    const below = at(x, y - 1, z)
    if (GRAVITY.test(name) && y > 0 && !below) warnings.push(`${name} bei (${x},${y},${z}) fällt runter (darunter ist Luft)`)
    if (NEEDS_FLOOR.test(name) && !NEEDS_WALL.test(name) && y > 0 && !below) warnings.push(`${name} bei (${x},${y},${z}) braucht einen Block darunter`)
    if (NEEDS_WALL.test(name) && props.facing) {
      const d = DIRS[props.facing]
      if (d && !at(x - d[0], y, z - d[2])) warnings.push(`${name} bei (${x},${y},${z}) hängt an nichts – facing zeigt von der Wand weg, dahinter (${x - d[0]},${y},${z - d[2]}) muss ein Block sein`)
    }
    if (name === 'lantern' && props.hanging === 'true' && !at(x, y + 1, z)) warnings.push(`hängende Laterne bei (${x},${y},${z}) hat keinen Block darüber`)
    if (/_door$/.test(name)) {
      const other = at(x, props.half === 'upper' ? y - 1 : y + 1, z)
      if (!other || blockName(other) !== name) warnings.push(`Tür bei (${x},${y},${z}) ist nur halb – benutze b.door()`)
    }
    if (/_bed$/.test(name)) {
      const d = DIRS[props.facing] || [0, 0, 0]
      const sign = props.part === 'foot' ? 1 : -1
      const other = at(x + d[0] * sign, y, z + d[2] * sign)
      if (!other || blockName(other) !== name) warnings.push(`Bett bei (${x},${y},${z}) ist nur halb – benutze b.bed()`)
    }
  }
  // Doppelte Meldungen zusammenfassen
  const counted = new Map()
  for (const w of warnings) {
    const kind = w.replace(/\(-?\d+,-?\d+,-?\d+\)/g, '(…)')
    counted.set(kind, (counted.get(kind) || { first: w, n: 0 }))
    counted.get(kind).n++
  }
  return [...counted.values()].map(({ first, n }) => n > 1 ? `${first} (und ${n - 1} ähnliche)` : first)
}

// ---------- Schichten als Text ----------

const STAIR_ARROWS = { north: '^', south: 'v', east: '>', west: '<' }
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@$%&*+=?!'

function describe (blocks, { maxCells = 9000 } = {}) {
  const bb = bounds(blocks)
  const w = bb.maxX - bb.minX + 1
  const h = bb.maxY - bb.minY + 1
  const d = bb.maxZ - bb.minZ + 1
  const counts = new Map()
  for (const b of blocks) counts.set(blockName(b.block), (counts.get(blockName(b.block)) || 0) + 1)
  const sorted = [...counts].sort((a, b) => b[1] - a[1])
  const lines = []
  lines.push(`Größe: ${w} breit (x ${bb.minX}..${bb.maxX}) × ${d} tief (z ${bb.minZ}..${bb.maxZ}) × ${h} hoch (y ${bb.minY}..${bb.maxY}), ${blocks.length} Blöcke`)
  lines.push('Material: ' + sorted.map(([n, c]) => `${n} ×${c}`).join(', '))

  if (w * d * h > maxCells) {
    lines.push(`(Schichtbilder weggelassen, weil der Bau sehr groß ist: ${w}×${d}×${h})`)
    return lines.join('\n')
  }
  const legend = new Map()
  sorted.forEach(([n], i) => legend.set(n, CHARS[i] || '?'))
  const map = new Map(blocks.map(b => [`${b.x},${b.y},${b.z}`, b.block]))
  lines.push('')
  lines.push('Schichten von unten nach oben. Jede Zeile = ein z-Wert (oben Norden/hinten, unten Süden/vorne zum Spieler), jede Spalte = ein x-Wert (links Westen). "." = Luft, Pfeile ^ > v < = Treppen mit facing north/east/south/west.')
  lines.push('Legende: ' + [...legend].map(([n, c]) => `${c}=${n}`).join(' '))
  for (let y = bb.minY; y <= bb.maxY; y++) {
    lines.push(`y=${y}:`)
    for (let z = bb.minZ; z <= bb.maxZ; z++) {
      let row = ''
      for (let x = bb.minX; x <= bb.maxX; x++) {
        const spec = map.get(`${x},${y},${z}`)
        if (!spec) { row += '.'; continue }
        const name = blockName(spec)
        if (/_stairs$/.test(name)) row += STAIR_ARROWS[blockProps(spec).facing] || legend.get(name)
        else row += legend.get(name)
      }
      lines.push(`  ${String(z).padStart(3)} ${row}`)
    }
  }
  return lines.join('\n')
}

module.exports = {
  VERSION,
  registry,
  Block,
  BauFehler,
  DIRS,
  runPlan,
  check,
  describe,
  bounds,
  normalizeBlock,
  parseBlock,
  blockName,
  blockProps,
  fullState,
  isFullSolid,
  NEEDS_FLOOR,
  NEEDS_WALL
}
