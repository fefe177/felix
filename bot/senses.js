// Sinne: übersetzt, was der Bot "wahrnimmt", in Text für Claude.
// Hier wird nichts entschieden – nur beschrieben, was zu sehen ist.

const { Vec3 } = require('vec3')

const RAD = 180 / Math.PI
const REACH_BLOCK = 4.5
const REACH_ENTITY = 3

// Raycast-Seiten von prismarine-world: 0=unten 1=oben 2=Nord 3=Süd 4=West 5=Ost
const FACE_VECTORS = [
  new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1),
  new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)
]
const FACE_NAMES = ['Unterseite', 'Oberseite', 'Nordseite', 'Südseite', 'Westseite', 'Ostseite']

const COMPASS_NAMES = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten']
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

// Kompass: 0 = Norden (-z), 90 = Osten (+x), 180 = Süden, 270 = Westen
function compassFromYaw (yaw) {
  return ((-yaw * RAD) % 360 + 360) % 360
}
function yawFromCompass (deg) {
  return -deg / RAD
}
function compassName (deg) {
  return COMPASS_NAMES[Math.round(deg / 45) % 8]
}
function normDeg (d) {
  d = ((d % 360) + 360) % 360
  return d > 180 ? d - 360 : d
}

function eyePos (bot) {
  return bot.entity.position.offset(0, bot.entity.eyeHeight, 0)
}

// Winkel eines Punktes relativ zur Blickrichtung. right > 0 = rechts, up > 0 = oben.
function relativeAngles (bot, point) {
  const d = point.minus(eyePos(bot))
  const targetYaw = Math.atan2(-d.x, -d.z)
  const targetPitch = Math.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z))
  return {
    right: normDeg((bot.entity.yaw - targetYaw) * RAD),
    up: (targetPitch - bot.entity.pitch) * RAD
  }
}

function describeAngles ({ right, up }) {
  const parts = []
  if (Math.abs(right) < 3) parts.push('genau vor dir')
  else if (Math.abs(right) > 150) parts.push(`hinter dir (${Math.round(Math.abs(right))}° ${right > 0 ? 'rechts' : 'links'})`)
  else parts.push(`${Math.round(Math.abs(right))}° ${right > 0 ? 'rechts' : 'links'}`)
  if (Math.abs(up) >= 3) parts.push(`${Math.round(Math.abs(up))}° ${up > 0 ? 'hoch' : 'runter'}`)
  return parts.join(', ')
}

function fmt (n) { return (Math.round(n * 10) / 10).toFixed(1) }
function fmtPos (p) { return `(${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})` }
function blockPos (p) { return `(${p.x}, ${p.y}, ${p.z})` }

function isLiving (e) {
  return ['player', 'hostile', 'animal', 'passive', 'mob', 'water_creature', 'ambient'].includes(e.type)
}

function entityHealth (bot, e) {
  if (!isLiving(e) || !e.metadata) return null
  const data = bot.registry.entitiesByName[e.name]
  const idx = data?.metadataKeys ? data.metadataKeys.indexOf('health') : 9
  const h = e.metadata[idx >= 0 ? idx : 9]
  return typeof h === 'number' ? h : null
}

function entityLabel (e) {
  if (e.type === 'player') return `Spieler ${e.username}`
  if (e.name === 'item') {
    try {
      const it = e.getDroppedItem()
      if (it) return `Item ${it.name} x${it.count}`
    } catch {}
    return 'Item'
  }
  if (e.name === 'experience_orb') return 'XP-Kugel'
  return e.name || e.displayName || 'unbekannt'
}

// Blickt man vom Auge aus frei auf den Punkt? (kein Röntgenblick!)
function canSee (bot, point, maxDist = 64) {
  const eye = eyePos(bot)
  const d = point.minus(eye)
  const dist = d.norm()
  if (dist < 0.01) return true
  if (dist > maxDist) return false
  const hit = bot.world.raycast(eye, d.scaled(1 / dist), dist)
  if (!hit) return true
  return hit.intersect.distanceTo(eye) >= dist - 0.6
}

// Blöcke sind sichtbar, wenn der Strahl zur Mitte (oder zu einer zugewandten Seite) genau diesen Block trifft.
function canSeeBlock (bot, pos) {
  const eye = eyePos(bot)
  const center = pos.offset(0.5, 0.5, 0.5)
  const points = [center]
  const d = eye.minus(center)
  if (Math.abs(d.x) > 0.5) points.push(center.offset(Math.sign(d.x) * 0.45, 0, 0))
  if (Math.abs(d.y) > 0.5) points.push(center.offset(0, Math.sign(d.y) * 0.45, 0))
  if (Math.abs(d.z) > 0.5) points.push(center.offset(0, 0, Math.sign(d.z) * 0.45))
  for (const p of points) {
    const dir = p.minus(eye)
    const dist = dir.norm()
    const hit = bot.world.raycast(eye, dir.scaled(1 / dist), dist + 0.6)
    if (hit && hit.position.equals(pos)) return true
  }
  return false
}

// Nahe Wesen, nach Entfernung sortiert und durchnummeriert (dieselben Nummern wie auf Screenshot und Karte).
function listEntities (bot, prevDist, radius = 24, max = 12) {
  const me = bot.entity.position
  const list = Object.values(bot.entities)
    .filter(e => e !== bot.entity && e.position && e.position.distanceTo(me) <= radius)
    .map(e => ({ e, dist: e.position.distanceTo(me) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, max)
  return list.map((x, i) => {
    const e = x.e
    const center = e.position.offset(0, (e.height || 1) * 0.6, 0)
    const prev = prevDist.get(e.id)
    let motion = ''
    if (prev !== undefined) {
      if (x.dist < prev - 0.3) motion = 'näher als vorher'
      else if (x.dist > prev + 0.3) motion = 'weiter weg als vorher'
    }
    return {
      n: i + 1,
      e,
      id: e.id,
      label: entityLabel(e),
      dist: x.dist,
      angles: relativeAngles(bot, center),
      visible: canSee(bot, center),
      hostile: e.type === 'hostile',
      health: entityHealth(bot, e),
      dy: e.position.y - me.y,
      motion
    }
  })
}

function describeEntities (entities) {
  if (!entities.length) return '👀 Keine Wesen in der Nähe.'
  const lines = entities.map(x => {
    const bits = [`${x.n}. ${x.hostile ? '⚠ ' : ''}${x.label}`, `${fmt(x.dist)} Blöcke`, describeAngles(x.angles)]
    if (Math.abs(x.dy) >= 1.5) bits.push(`${Math.round(Math.abs(x.dy))} Blöcke ${x.dy > 0 ? 'höher' : 'tiefer'}`)
    if (x.health !== null) bits.push(`❤ ${fmt(x.health)}`)
    if (x.motion) bits.push(x.motion)
    if (!x.visible) bits.push('hinter Blöcken versteckt (nur hörbar)')
    if (x.dist <= REACH_ENTITY) bits.push('IN SCHLAGWEITE')
    return '  ' + bits.join(' · ')
  })
  return '👀 Wesen in der Nähe (Nummern wie auf dem Bild und der Karte):\n' + lines.join('\n')
}

// Was ist genau im Fadenkreuz?
function crosshair (bot) {
  const eye = eyePos(bot)
  const block = bot.blockAtCursor(16)
  const blockDist = block ? block.intersect.distanceTo(eye) : Infinity
  let entity = null
  try { entity = bot.entityAtCursor(Math.min(16, blockDist)) } catch {}
  if (entity) {
    const dist = entity.position.distanceTo(bot.entity.position)
    return { kind: 'entity', entity, dist, inReach: dist <= REACH_ENTITY + 0.4 }
  }
  if (block) {
    return {
      kind: 'block',
      block,
      face: block.face,
      faceVec: FACE_VECTORS[block.face],
      dist: blockDist,
      inReach: blockDist <= REACH_BLOCK
    }
  }
  return { kind: 'none' }
}

function describeCrosshair (bot, ch) {
  if (ch.kind === 'entity') {
    return `🎯 Fadenkreuz: ${entityLabel(ch.entity)} (${fmt(ch.dist)} Blöcke) – ${ch.inReach ? 'in Schlagweite ✅' : 'zu weit zum Schlagen (max. 3)'}`
  }
  if (ch.kind === 'block') {
    const p = ch.block.position
    return `🎯 Fadenkreuz: Block ${ch.block.name} bei ${blockPos(p)}, ${FACE_NAMES[ch.face]}, ${fmt(ch.dist)} Blöcke – ${ch.inReach ? 'erreichbar ✅' : 'zu weit (max. 4.5)'}`
  }
  return '🎯 Fadenkreuz: nur Luft/Himmel'
}

function passable (b) {
  return !b || b.boundingBox === 'empty'
}
function isLiquid (b, name) {
  return b && (b.name === name || (name === 'water' && (b.name === 'bubble_column' || b.getProperties?.().waterlogged === true)))
}

// Karte von oben, Norden ist oben. Zeigt nur die Umgebung auf Fußhöhe.
function map (bot, entities, radius = 6) {
  const me = bot.entity.position
  const fx = Math.floor(me.x)
  const fz = Math.floor(me.z)
  let fy = Math.floor(me.y + 0.01)
  if (!passable(bot.blockAt(new Vec3(fx, fy, fz)))) fy += 1 // steht auf Stufe/Halbblock
  const markers = new Map()
  for (const x of entities.slice(0, 9)) {
    const key = `${Math.floor(x.e.position.x)},${Math.floor(x.e.position.z)}`
    if (!markers.has(key) && Math.abs(x.e.position.y - fy) <= 4) markers.set(key, String(x.n))
  }
  const arrow = ARROWS[Math.round(compassFromYaw(bot.entity.yaw) / 45) % 8]
  const rows = []
  for (let dz = -radius; dz <= radius; dz++) {
    let row = ''
    for (let dx = -radius; dx <= radius; dx++) {
      const x = fx + dx
      const z = fz + dz
      if (dx === 0 && dz === 0) { row += arrow; continue }
      const mark = markers.get(`${x},${z}`)
      if (mark) { row += mark; continue }
      const at = (dy) => bot.blockAt(new Vec3(x, fy + dy, z))
      const feet = at(0)
      const head = at(1)
      const below = at(-1)
      if (!feet || !head || !below) { row += '?'; continue }
      if (isLiquid(feet, 'lava') || isLiquid(below, 'lava')) { row += 'L'; continue }
      if (isLiquid(feet, 'water') || isLiquid(below, 'water')) { row += '~'; continue }
      if (/_log$|_stem$/.test(feet.name) || /_log$|_stem$/.test(head.name)) { row += 'T'; continue }
      if (!passable(feet)) {
        row += passable(head) && passable(at(2)) ? '^' : '#'
      } else if (!passable(head)) {
        row += '#'
      } else if (!passable(below)) {
        row += '.'
      } else {
        const below2 = at(-2)
        if (isLiquid(below, 'lava') || isLiquid(below2, 'lava')) row += 'L'
        else if (below2 && !passable(below2)) row += 'v'
        else row += 'O'
      }
    }
    rows.push(row)
  }
  const legend = `${arrow}=du (Pfeil = Blickrichtung)  .=Boden  ^=1 Block hoch  v=1 Block runter  #=Wand  O=Loch/Abgrund  ~=Wasser  L=LAVA  T=Baumstamm  1-9=Wesen`
  return `🗺 Karte von oben (Norden oben, Osten rechts, 1 Zeichen = 1 Block, Mitte = x ${fx}, z ${fz}, Fußhöhe y ${fy}):\n` +
    rows.map(r => '   ' + r).join('\n') + '\n   ' + legend
}

// Interessante Blöcke, die man gerade wirklich sehen kann (keine durch Wände).
const INTEREST = [
  { label: 'Holz (Baumstamm)', test: n => /_log$|_stem$/.test(n) && !n.startsWith('stripped_') },
  { label: 'Erz', test: n => /_ore$/.test(n) || n === 'ancient_debris' },
  { label: 'Werkbank', test: n => n === 'crafting_table' },
  { label: 'Ofen', test: n => n === 'furnace' || n === 'blast_furnace' || n === 'smoker' },
  { label: 'Kiste', test: n => n === 'chest' || n === 'barrel' || n === 'trapped_chest' },
  { label: 'Bett', test: n => /_bed$/.test(n) },
  { label: 'Lava', test: n => n === 'lava' },
  { label: 'Tür', test: n => /_door$/.test(n) }
]

function visibleBlocks (bot, radius = 16) {
  const names = bot.registry.blocksArray.filter(b => INTEREST.some(g => g.test(b.name)))
  const ids = names.map(b => b.id)
  if (!ids.length) return ''
  const positions = bot.findBlocks({ matching: ids, maxDistance: radius, count: 300 })
  const groups = new Map()
  const eye = eyePos(bot)
  for (const pos of positions) {
    const b = bot.blockAt(pos)
    if (!b) continue
    const group = INTEREST.find(g => g.test(b.name))
    if (!group) continue
    const g = groups.get(group.label) || { names: new Map(), seen: 0, nearest: null }
    if (g.seen >= 40) continue
    if (!canSeeBlock(bot, pos)) continue
    g.seen++
    g.names.set(b.name, (g.names.get(b.name) || 0) + 1)
    const d = pos.offset(0.5, 0.5, 0.5).distanceTo(eye)
    if (!g.nearest || d < g.nearest.d) g.nearest = { d, pos, name: b.name }
    groups.set(group.label, g)
  }
  if (!groups.size) return ''
  const lines = []
  for (const [label, g] of groups) {
    const kinds = [...g.names].map(([n, c]) => `${c}× ${n}`).join(', ')
    const ang = describeAngles(relativeAngles(bot, g.nearest.pos.offset(0.5, 0.5, 0.5)))
    lines.push(`  ${label}: ${kinds} – nächstes: ${g.nearest.name} bei ${blockPos(g.nearest.pos)}, ${fmt(g.nearest.d)} Blöcke, ${ang}`)
  }
  return '🔎 Sichtbare Blöcke (nur was du wirklich sehen kannst):\n' + lines.join('\n')
}

function timeText (bot) {
  const t = bot.time?.timeOfDay
  if (typeof t !== 'number') return ''
  const h = Math.floor((t / 1000 + 6) % 24)
  const m = Math.floor((t % 1000) * 60 / 1000)
  const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} Uhr`
  const night = t >= 12542 && t <= 23460
  return night ? `🌙 Nacht, ${clock} (Monster!)` : `☀ Tag, ${clock}`
}

function itemText (item) {
  return item ? `${item.name}${item.count > 1 ? ' x' + item.count : ''}` : 'nichts'
}

function status (bot, modeText) {
  const p = bot.entity.position
  const c = compassFromYaw(bot.entity.yaw)
  const pitch = bot.entity.pitch * RAD
  const lines = []
  lines.push(`📍 Position ${fmtPos(p)} · Blick nach ${compassName(c)} (${Math.round(c)}°), Neigung ${Math.round(pitch)}° ${pitch > 5 ? '(nach oben)' : pitch < -5 ? '(nach unten)' : '(geradeaus)'}`)
  const bits = [`❤ Leben ${fmt(bot.health)}/20`, `🍗 Hunger ${bot.food}/20`]
  if (bot.oxygenLevel !== undefined && bot.oxygenLevel < 20) bits.push(`🫧 Luft ${bot.oxygenLevel}/20`)
  if (bot.experience) bits.push(`⭐ Level ${bot.experience.level}`)
  bits.push(timeText(bot))
  if (bot.isRaining) bits.push('🌧 Regen')
  bits.push(`Spielmodus ${bot.game?.gameMode}`)
  const dim = String(bot.game?.dimension || '').replace('minecraft:', '')
  if (dim && dim !== 'overworld') bits.push(`Dimension ${dim}`)
  lines.push(bits.filter(Boolean).join(' · '))
  const off = bot.inventory.slots[45]
  lines.push(`✋ In der Hand: ${itemText(bot.heldItem)} (Hotbar-Slot ${bot.quickBarSlot})${off ? ` · Nebenhand: ${itemText(off)}` : ''}`)
  if (bot.food <= 6) lines.push('⚠ Du hast großen Hunger – iss etwas, sonst kannst du nicht sprinten und heilst nicht.')
  if (modeText) lines.push(modeText)
  return lines.join('\n')
}

module.exports = {
  RAD,
  REACH_BLOCK,
  REACH_ENTITY,
  FACE_VECTORS,
  FACE_NAMES,
  compassFromYaw,
  yawFromCompass,
  compassName,
  eyePos,
  relativeAngles,
  describeAngles,
  entityLabel,
  listEntities,
  describeEntities,
  crosshair,
  describeCrosshair,
  map,
  visibleBlocks,
  status,
  itemText,
  fmt,
  fmtPos,
  blockPos
}
