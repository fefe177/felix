// Platzieren: dreht einen Bauplan so, dass seine Vorderseite (Süden im Plan) zum Spieler zeigt,
// und macht daraus Minecraft-Befehle (fill/setblock).

const M = require('./modell')

const FORWARD = {
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 }
}
// Minecraft-Yaw: 0 = Süden, 90 = Westen, 180 = Norden, 270 = Osten
const YAW_ORDER = ['south', 'west', 'north', 'east']

function facingFromYaw (yaw) {
  const idx = ((Math.round(yaw / 90) % 4) + 4) % 4
  return YAW_ORDER[idx]
}

// Richtung (Name) → Vektor und zurück
const VEC = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] }
function vecName (v) {
  return Object.keys(VEC).find(k => VEC[k][0] === v[0] && VEC[k][1] === v[1] && VEC[k][2] === v[2])
}

// Spieler schaut in Richtung `facing`. Im Plan schaut der Spieler nach Norden auf die Südseite.
// Also: Plan-Norden → Blickrichtung f, Plan-Osten → rechte Hand r.
function frame (facing) {
  const f = FORWARD[facing]
  const r = { x: -f.z, z: f.x }
  const mapVec = ([x, y, z]) => [x * r.x - z * f.x, y, x * r.z - z * f.z]
  const mapDir = (name) => VEC[name] ? vecName(mapVec(VEC[name])) : name
  return { facing, f, r, mapVec, mapDir }
}

// Wie oft um 90° im Uhrzeigersinn (von oben gesehen) gedreht wird – für "rotation" (0..15) von Schildern & Bannern.
const CLOCKWISE = ['south', 'west', 'north', 'east']
function quarterTurns (fr) {
  return (CLOCKWISE.indexOf(fr.mapDir('south')) + 4) % 4
}

const DIR_KEYS = ['north', 'south', 'east', 'west']

function rotateSpec (spec, fr) {
  const { name, props } = M.parseBlock(spec)
  const keys = Object.keys(props)
  if (!keys.length) return name
  const out = {}
  for (const k of keys) {
    const v = props[k]
    if (DIR_KEYS.includes(k)) {
      out[fr.mapDir(k)] = v
    } else if (k === 'facing' || k === 'horizontal_facing' || k === 'vertical_direction') {
      out[k] = fr.mapDir(v)
    } else if (k === 'axis' && (v === 'x' || v === 'z')) {
      const d = fr.mapVec(v === 'x' ? [1, 0, 0] : [0, 0, 1])
      out[k] = d[0] !== 0 ? 'x' : 'z'
    } else if (k === 'rotation') {
      out[k] = String((Number(v) + 4 * quarterTurns(fr)) % 16)
    } else if (k === 'shape' && /(north|south|east|west)/.test(v) && !/_(left|right)$/.test(v)) {
      // Schienen: north_south, ascending_east, south_east …
      let s = v.replace(/north|south|east|west/g, (w) => `#${fr.mapDir(w)}`).replace(/#/g, '')
      if (/^(east|west)_(north|south)$/.test(s)) s = s.split('_').reverse().join('_')
      if (s === 'east_west' || s === 'west_east') s = 'east_west'
      if (s === 'south_north') s = 'north_south'
      out[k] = s
    } else {
      out[k] = v
    }
  }
  const ks = Object.keys(out).sort()
  return `${name}[${ks.map(k => `${k}=${out[k]}`).join(',')}]`
}

// Plan-Blöcke → Weltblöcke. base = Blockposition des Spielers (Füße).
function toWorld (blocks, base, facing, distance = 3) {
  const fr = frame(facing)
  const bb = M.bounds(blocks)
  const cx = Math.round((bb.minX + bb.maxX) / 2)
  // Die Vorderkante (größtes z) in Plan-Mitte landet `distance` Blöcke vor dem Spieler.
  const [ox, , oz] = fr.mapVec([cx, 0, bb.maxZ])
  const anchor = { x: base.x + fr.f.x * distance - ox, y: base.y, z: base.z + fr.f.z * distance - oz }
  return {
    anchor,
    facing,
    blocks: placeAt(blocks, anchor, facing)
  }
}

function placeAt (blocks, anchor, facing) {
  const fr = frame(facing)
  return blocks.map(b => {
    const [dx, dy, dz] = fr.mapVec([b.x, b.y, b.z])
    return { x: anchor.x + dx, y: anchor.y + dy, z: anchor.z + dz, block: rotateSpec(b.block, fr) }
  })
}

// Blöcke, die einen anderen Block zum Festhalten brauchen, kommen zuletzt.
function needsSupport (name) {
  return M.NEEDS_FLOOR.test(name) || M.NEEDS_WALL.test(name) ||
    /(_door$|_bed$|lantern$|_button$|^lever$|_trapdoor$|^vine$|_banner$|^bell$|^tripwire|_head$|_skull$|^scaffolding$|^chain$)/.test(name)
}

// Befehle für den Bau. Räumt vorher den Platz frei und füllt Löcher unter dem Bau mit Erde.
function buildCommands (worldBlocks, groundY, dim = 'minecraft:overworld') {
  const run = (c) => `execute in ${dim} run ${c}`
  const bb = M.bounds(worldBlocks)
  const cmds = []
  // 1. Platz freiräumen (über dem Boden), in Scheiben wegen des Fill-Limits (32768 Blöcke)
  const area = (bb.maxX - bb.minX + 1) * (bb.maxZ - bb.minZ + 1)
  const layers = Math.max(1, Math.floor(32768 / area))
  for (let y = Math.max(bb.minY, groundY); y <= bb.maxY; y += layers) {
    cmds.push(run(`fill ${bb.minX} ${y} ${bb.minZ} ${bb.maxX} ${Math.min(bb.maxY, y + layers - 1)} ${bb.maxZ} air`))
  }
  // 2. Löcher unter dem Bau (z. B. am Hang) mit Erde füllen
  for (let y = groundY - 4; y <= groundY - 1; y += layers) {
    cmds.push(run(`fill ${bb.minX} ${y} ${bb.minZ} ${bb.maxX} ${Math.min(groundY - 1, y + layers - 1)} ${bb.maxZ} dirt replace air`))
  }
  // 3. Blöcke setzen: erst alles Feste von unten nach oben, dann Angebautes (Fackeln, Türen …)
  const solid = worldBlocks.filter(b => !needsSupport(M.blockName(b.block))).sort((a, b) => a.y - b.y)
  const attached = worldBlocks.filter(b => needsSupport(M.blockName(b.block))).sort((a, b) => a.y - b.y)
  cmds.push(...runs(solid).map(run))
  for (const b of attached) cmds.push(run(`setblock ${b.x} ${b.y} ${b.z} minecraft:${b.block}`))
  return cmds
}

// Gleiche Blöcke nebeneinander (in x-Richtung) zu einem fill zusammenfassen.
function runs (blocks) {
  const byRow = new Map()
  for (const b of blocks) {
    const k = `${b.y},${b.z}`
    if (!byRow.has(k)) byRow.set(k, [])
    byRow.get(k).push(b)
  }
  const cmds = []
  const rows = [...byRow.values()].sort((a, b) => a[0].y - b[0].y)
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    let i = 0
    while (i < row.length) {
      let j = i
      while (j + 1 < row.length && row[j + 1].x === row[j].x + 1 && row[j + 1].block === row[i].block) j++
      const a = row[i]
      cmds.push(j === i
        ? `setblock ${a.x} ${a.y} ${a.z} minecraft:${a.block}`
        : `fill ${a.x} ${a.y} ${a.z} ${row[j].x} ${a.y} ${a.z} minecraft:${a.block}`)
      i = j + 1
    }
  }
  return cmds
}

// Befehle, um einen Bau wieder zu entfernen (erst das Angebaute, dann von oben nach unten).
function removeCommands (worldBlocks, dim = 'minecraft:overworld') {
  const run = (c) => `execute in ${dim} run ${c}`
  const attached = worldBlocks.filter(b => needsSupport(M.blockName(b.block)))
  const solid = worldBlocks.filter(b => !needsSupport(M.blockName(b.block))).sort((a, b) => b.y - a.y)
  return [...attached, ...solid].map(b => run(`setblock ${b.x} ${b.y} ${b.z} air`))
}

module.exports = { facingFromYaw, frame, rotateSpec, toWorld, placeAt, buildCommands, removeCommands }
