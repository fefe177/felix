// Körper: Claudes Hände und Füße in Minecraft.
// Jede Aktion hier ist so klein wie ein Tastendruck oder Mausklick. Es gibt keinen Autopiloten:
// kein "geh zu", kein automatisches Kämpfen. Was passiert, entscheidet Claude Zug um Zug.

const mineflayer = require('mineflayer')
const { Vec3 } = require('vec3')
const S = require('./senses')
const { Eyes } = require('./eyes')

const MOVE_KEYS = ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']
const FACING_COMPASS = { north: 0, east: 90, south: 180, west: 270 }
// Rückmeldungen unserer eigenen /tick-Befehle sollen den Chat nicht zumüllen.
const TICK_MESSAGES = /^(The game is (frozen|running normally)|Gamerule logAdminCommands is now set to)/i
const REPLACEABLE = new Set([
  'air', 'cave_air', 'void_air', 'water', 'lava', 'short_grass', 'grass', 'tall_grass', 'fern', 'large_fern',
  'dead_bush', 'snow', 'vine', 'seagrass', 'tall_seagrass', 'fire', 'soul_fire', 'light', 'glow_lichen',
  'hanging_roots', 'crimson_roots', 'warped_roots', 'nether_sprouts', 'bubble_column'
])
const SWITCHES = /(_door|_trapdoor|_fence_gate|_button|^lever|^repeater|^comparator|^note_block|^bell|^daylight_detector)$/
const CONTAINERS = /^(chest|trapped_chest|barrel|ender_chest|.*shulker_box|hopper|dispenser|dropper)$/
const FURNACES = /^(furnace|blast_furnace|smoker)$/
const FACE_OFFSETS = [
  new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)
]

class UserError extends Error {}

function sleep (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function withTimeout (promise, ms, message) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve, reject) => { timer = setTimeout(() => reject(new UserError(message)), ms) })
  ])
}

function itemName (s) {
  return String(s || '').trim().toLowerCase().replace(/^minecraft:/, '').replace(/\s+/g, '_')
}

function reasonText (reason) {
  if (!reason) return 'unbekannt'
  if (typeof reason === 'string') {
    try { return reasonText(JSON.parse(reason)) } catch { return reason }
  }
  if (reason.text !== undefined || reason.extra || reason.translate) {
    return [reason.text || reason.translate || '', ...(reason.extra || []).map(reasonText)].join('')
  }
  return JSON.stringify(reason)
}

class Body {
  constructor () {
    this.bot = null
    this.connected = false
    this.mode = 'turn'
    this.turnAvailable = false
    this.turnProblem = null
    this.events = []
    this.chatLog = []
    this.capture = null
    this.prevDist = new Map()
    this.lastEntities = []
    this.window = null
    this.eyes = null
    this.eyesProblem = null
    this.queue = Promise.resolve()
    this.lastAttack = null
    this.lastHealth = 20
  }

  // Aktionen laufen immer nacheinander, nie gleichzeitig.
  serial (fn) {
    const run = this.queue.then(fn)
    this.queue = run.catch(() => {})
    return run
  }

  ensure () {
    if (!this.bot || !this.connected) throw new UserError('Du bist nicht in Minecraft. Benutze zuerst "connect".')
    return this.bot
  }

  pushEvent (text) {
    if (this.events[this.events.length - 1] === text) return
    this.events.push(text)
    if (this.events.length > 25) this.events.shift()
  }

  // ---------- Verbindung ----------

  async connect ({ host, port, username, version, eyes = true }) {
    if (this.bot) await this.disconnect()
    host = host || process.env.MC_HOST || '127.0.0.1'
    port = port || Number(process.env.MC_PORT) || 25565
    username = username || process.env.MC_USERNAME || 'Claude'
    version = version || process.env.MC_VERSION || undefined

    const bot = mineflayer.createBot({ host, port, username, version, auth: 'offline', hideErrors: true })
    try {
      await new Promise((resolve, reject) => {
        const done = (err) => {
          clearTimeout(timer)
          bot.off('spawn', onSpawn)
          bot.off('error', onError)
          bot.off('kicked', onKicked)
          bot.off('end', onEnd)
          if (err) reject(err)
          else resolve()
        }
        const onSpawn = () => done()
        const onError = (err) => done(err.code === 'ECONNREFUSED'
          ? new UserError(`Kein Minecraft-Server auf ${host}:${port}. Läuft der Server schon ("npm run server")?`)
          : err)
        const onKicked = (reason) => done(new UserError('Der Server hat mich rausgeworfen: ' + reasonText(reason)))
        const onEnd = (reason) => done(new UserError('Verbindung beendet: ' + reasonText(reason)))
        const timer = setTimeout(() => done(new UserError('Zeitüberschreitung beim Verbinden (45 s).')), 45000)
        bot.once('spawn', onSpawn)
        bot.once('error', onError)
        bot.once('kicked', onKicked)
        bot.once('end', onEnd)
      })
    } catch (err) {
      try { bot.quit() } catch {}
      throw err
    }

    this.bot = bot
    this.connected = true
    this.events = []
    this.chatLog = []
    this.prevDist = new Map()
    this.lastHealth = bot.health
    this.attachListeners(bot)
    try { await withTimeout(bot.waitForChunksToLoad(), 15000, 'chunks') } catch {}

    const notes = []
    notes.push(`✅ Verbunden mit ${host}:${port} als "${username}" (Minecraft ${bot.version}).`)
    notes.push(await this.setupTurnMode())

    if (eyes) {
      this.eyes = new Eyes(bot)
      try {
        await this.eyes.start()
        this.eyesProblem = null
        notes.push(`👁 Augen an: Nach jeder Aktion bekommst du ein Bild. Felix kann unter http://localhost:${this.eyes.port} sehen, was du siehst.`)
      } catch (err) {
        await this.eyes.stop()
        this.eyes = null
        this.eyesProblem = err.message
        notes.push('👁 Augen aus (kein Screenshot möglich): ' + err.message.split('\n')[0] + ' – du bekommst trotzdem Text und Karte.')
      }
    }
    return notes.join('\n')
  }

  attachListeners (bot) {
    bot.on('messagestr', (msg, position) => this.onMessage(msg, position))
    bot.on('health', () => {
      const lost = this.lastHealth - bot.health
      if (lost >= 0.5) this.pushEvent(`💥 Du hast ${S.fmt(lost)} Schaden bekommen! Leben jetzt ${S.fmt(bot.health)}/20.`)
      else if (bot.health > this.lastHealth + 0.5) this.pushEvent(`💚 Geheilt: Leben ${S.fmt(bot.health)}/20.`)
      this.lastHealth = bot.health
    })
    bot.on('entityHurt', (e) => {
      if (e === bot.entity || !e.position) return
      if (e.position.distanceTo(bot.entity.position) > 16) return
      const mine = this.lastAttack && this.lastAttack.id === e.id && Date.now() - this.lastAttack.time < 3000
      this.pushEvent(mine ? `⚔ Treffer! ${S.entityLabel(e)} wurde von dir verletzt.` : `${S.entityLabel(e)} wurde verletzt.`)
    })
    bot.on('entityDead', (e) => {
      if (!e.position || e.position.distanceTo(bot.entity.position) > 16) return
      this.pushEvent(`☠ ${S.entityLabel(e)} ist gestorben.`)
    })
    bot.on('playerCollect', (collector, collected) => {
      if (collector !== bot.entity) return
      let text = 'etwas'
      try {
        const it = collected.getDroppedItem()
        if (it) text = `${it.name} x${it.count}`
      } catch {}
      this.pushEvent(`📦 Aufgehoben: ${text}`)
    })
    bot.on('death', () => {
      this.pushEvent('💀 Du bist gestorben! Du startest wieder am Spawnpunkt, deine Sachen liegen am Todesort.')
      this.window = null
    })
    bot.on('wake', () => this.pushEvent('🛏 Du bist aufgewacht.'))
    bot.on('kicked', (reason) => this.pushEvent('🚪 Vom Server geworfen: ' + reasonText(reason)))
    bot.on('end', (reason) => {
      this.connected = false
      this.pushEvent('🔌 Verbindung zum Server beendet: ' + reasonText(reason))
    })
    bot.on('error', (err) => this.pushEvent('⚠ Fehler: ' + err.message))
  }

  onMessage (msg, position) {
    msg = String(msg || '').replace(/[§&][0-9a-fk-or]/gi, '').trim()
    if (!msg) return
    if (position === 'game_info') {
      this.pushEvent('ℹ ' + msg)
      return
    }
    if (this.capture && !msg.startsWith('<')) {
      this.capture.push(msg)
      return
    }
    if (TICK_MESSAGES.test(msg)) return
    if (this.bot && msg.startsWith(`<${this.bot.username}>`)) return
    this.chatLog.push(msg)
    if (this.chatLog.length > 20) this.chatLog.shift()
  }

  async runCommand (command, waitMs = 1200) {
    this.capture = []
    this.bot.chat(command)
    await sleep(waitMs)
    const replies = this.capture
    this.capture = null
    return replies
  }

  // ---------- Rundenmodus (Zeit anhalten) ----------

  async setupTurnMode () {
    const replies = await this.runCommand('/tick query', 1500)
    const text = replies.join(' ')
    if (!/The game is|tick rate/i.test(text)) {
      this.turnAvailable = false
      this.mode = 'realtime'
      this.turnProblem = replies.length
        ? 'Ich darf /tick nicht benutzen (kein Operator). In der Server-Konsole "op ' + this.bot.username + '" eintippen und neu verbinden.'
        : 'Der Server hat auf /tick nicht geantwortet (braucht Minecraft 1.20.3+ und Operator-Rechte).'
      return '▶ Rundenmodus geht nicht: ' + this.turnProblem + ' Ich spiele in Echtzeit.'
    }
    this.turnAvailable = true
    this.turnProblem = null
    // Damit Felix nicht bei jedem Zug "[Claude: The game is frozen]" im Chat sieht.
    await this.runCommand('/gamerule logAdminCommands false', 600)
    if (this.mode === 'turn') this.setFrozen(true)
    return this.mode === 'turn'
      ? '⏸ Rundenmodus an: Die Welt ist angehalten, während du nachdenkst.'
      : '▶ Echtzeit-Modus.'
  }

  setFrozen (frozen) {
    if (!this.turnAvailable || !this.connected) return
    this.bot.chat(frozen ? '/tick freeze' : '/tick unfreeze')
  }

  // Die Welt läuft nur, während eine Aktion passiert.
  async withWorld (fn) {
    const turn = this.mode === 'turn' && this.turnAvailable
    if (turn) this.setFrozen(false)
    try {
      return await fn()
    } finally {
      if (turn) this.setFrozen(true)
    }
  }

  modeText () {
    if (this.mode === 'turn' && this.turnAvailable) return '⏸ Rundenmodus: Die Welt ist angehalten, solange du nachdenkst. Sie läuft nur während deiner Aktionen.'
    return '▶ Echtzeit: Die Welt läuft die ganze Zeit weiter!' + (this.turnProblem ? ` (Rundenmodus geht nicht: ${this.turnProblem})` : '')
  }

  async setMode (mode) {
    this.ensure()
    if (mode === 'turn') {
      if (!this.turnAvailable) throw new UserError('Rundenmodus geht nicht: ' + (this.turnProblem || 'unbekannt'))
      this.mode = 'turn'
      this.setFrozen(true)
      return '⏸ Rundenmodus an. Die Welt steht still, bis du etwas tust.'
    }
    this.mode = 'realtime'
    this.setFrozen(false)
    return '▶ Echtzeit an. Die Welt läuft jetzt ohne Pause weiter.'
  }

  // ---------- Wahrnehmung ----------

  async observe ({ screenshot = true, mapRadius = 6 } = {}) {
    const bot = this.ensure()
    const entities = S.listEntities(bot, this.prevDist)
    this.prevDist = new Map(entities.map(x => [x.id, x.dist]))
    this.lastEntities = entities
    const parts = [
      S.status(bot, this.modeText()),
      S.describeCrosshair(bot, S.crosshair(bot)),
      S.describeEntities(entities)
    ]
    const seen = S.visibleBlocks(bot)
    if (seen) parts.push(seen)
    parts.push(S.map(bot, entities, mapRadius))
    if (this.window) parts.push(this.describeWindow())
    if (this.events.length) parts.push('⚡ Was passiert ist:\n' + this.events.map(e => '  ' + e).join('\n'))
    if (this.chatLog.length) parts.push('💬 Chat (antworte mit "chat"):\n' + this.chatLog.map(m => '  ' + m).join('\n'))
    this.events = []
    this.chatLog = []

    let image = null
    if (screenshot && this.eyes) {
      const c = S.compassFromYaw(bot.entity.yaw)
      const hud = `${S.compassName(c)} ${Math.round(c)}° · Neigung ${Math.round(bot.entity.pitch * S.RAD)}° · ❤${Math.round(bot.health)} 🍗${bot.food}`
      try {
        image = await this.eyes.screenshot(entities, hud)
      } catch (err) {
        parts.push('(Screenshot ging nicht: ' + err.message.split('\n')[0] + ')')
      }
    } else if (screenshot && this.eyesProblem) {
      parts.push('(Keine Augen: ' + this.eyesProblem.split('\n')[0] + ')')
    }
    return { text: parts.join('\n\n'), image }
  }

  findListed (n) {
    const x = this.lastEntities.find(e => e.n === n)
    if (!x) throw new UserError(`Es gibt kein Wesen Nummer ${n} in der letzten Beobachtung.`)
    const e = this.bot.entities[x.id]
    if (!e) throw new UserError(`${x.label} (Nummer ${n}) ist nicht mehr da.`)
    return e
  }

  // ---------- Kopf und Füße ----------

  async turn ({ right = 0, up = 0, compass, pitch }) {
    const bot = this.ensure()
    let yaw = bot.entity.yaw
    let p = bot.entity.pitch
    if (compass !== undefined) yaw = S.yawFromCompass(compass)
    if (pitch !== undefined) p = pitch / S.RAD
    yaw -= right / S.RAD
    p += up / S.RAD
    p = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p))
    await bot.look(yaw, p, true)
    const c = S.compassFromYaw(bot.entity.yaw)
    return `Umgeschaut: Blick nach ${S.compassName(c)} (${Math.round(c)}°), Neigung ${Math.round(bot.entity.pitch * S.RAD)}°.`
  }

  async lookAt ({ target, x, y, z }) {
    const bot = this.ensure()
    let point
    let what
    if (target !== undefined) {
      const e = this.findListed(target)
      point = e.position.offset(0, (e.height || 0.5) * 0.7, 0)
      what = `${S.entityLabel(e)} (Nummer ${target})`
    } else if (x !== undefined && y !== undefined && z !== undefined) {
      const isBlock = Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)
      point = isBlock ? new Vec3(x + 0.5, y + 0.5, z + 0.5) : new Vec3(x, y, z)
      what = isBlock ? `Block ${S.blockPos(new Vec3(x, y, z))}` : `Punkt ${S.fmtPos(point)}`
    } else {
      throw new UserError('Sag mir target (Nummer eines Wesens) oder x, y, z.')
    }
    await bot.lookAt(point, true)
    return `Du schaust jetzt auf ${what}.`
  }

  async move ({ keys, ticks }) {
    const bot = this.ensure()
    const bad = keys.filter(k => !MOVE_KEYS.includes(k))
    if (bad.length) throw new UserError(`Unbekannte Taste(n): ${bad.join(', ')}. Erlaubt: ${MOVE_KEYS.join(', ')}`)
    ticks = Math.max(1, Math.min(100, Math.round(ticks)))
    const start = bot.entity.position.clone()
    await this.withWorld(async () => {
      for (const k of keys) bot.setControlState(k, true)
      await bot.waitForTicks(ticks)
      bot.clearControlStates()
      await bot.waitForTicks(2)
      // Nach einem Sprung erst landen lassen, damit die Position stimmt.
      for (let i = 0; i < 15 && !bot.entity.onGround && !bot.entity.isInWater; i++) await bot.waitForTicks(1)
    })
    const d = bot.entity.position.minus(start)
    const flat = Math.sqrt(d.x * d.x + d.z * d.z)
    let text = `Tasten ${keys.join('+')} für ${ticks} Ticks (${(ticks / 20).toFixed(2)} s) gedrückt.`
    if (flat >= 0.1) {
      const dir = S.compassName(S.compassFromYaw(Math.atan2(-d.x, -d.z)))
      text += ` Bewegt: ${S.fmt(flat)} Blöcke Richtung ${dir}.`
    } else {
      text += ' Kaum bewegt.'
    }
    if (Math.abs(d.y) >= 0.5) text += ` Höhe: ${d.y > 0 ? '+' : ''}${S.fmt(d.y)}.`
    const walking = keys.some(k => ['forward', 'back', 'left', 'right'].includes(k))
    const speed = keys.includes('sneak') ? 0.065 : keys.includes('sprint') ? 0.28 : 0.215
    if (walking && flat < speed * ticks * 0.3 && ticks >= 5) text += ' ⚠ Da war wohl etwas im Weg (Wand? Dann springen oder umdrehen).'
    return text
  }

  async wait ({ ticks }) {
    const bot = this.ensure()
    ticks = Math.max(1, Math.min(600, Math.round(ticks)))
    await this.withWorld(() => bot.waitForTicks(ticks))
    return `${ticks} Ticks (${(ticks / 20).toFixed(1)} s) gewartet.`
  }

  // ---------- Hände ----------

  async attack () {
    const bot = this.ensure()
    const ch = S.crosshair(bot)
    if (ch.kind === 'entity' && ch.inReach) {
      const e = ch.entity
      this.lastAttack = { id: e.id, time: Date.now() }
      await this.withWorld(async () => {
        bot.attack(e)
        await bot.waitForTicks(5)
      })
      return `Zugeschlagen auf ${S.entityLabel(e)}!`
    }
    await this.withWorld(async () => {
      bot.swingArm('right')
      await bot.waitForTicks(3)
    })
    if (ch.kind === 'entity') return `Daneben: ${S.entityLabel(ch.entity)} ist ${S.fmt(ch.dist)} Blöcke weg, du erreichst nur 3 Blöcke.`
    if (ch.kind === 'block') return 'Ins Leere geschlagen: Im Fadenkreuz ist ein Block, kein Wesen. (Zum Abbauen: "mine".)'
    return 'Ins Leere geschlagen: Im Fadenkreuz ist nichts.'
  }

  async mine () {
    const bot = this.ensure()
    const ch = S.crosshair(bot)
    if (ch.kind !== 'block') throw new UserError('Im Fadenkreuz ist kein Block. Dreh dich zuerst zu einem Block.')
    if (!ch.inReach) throw new UserError(`Der Block ist ${S.fmt(ch.dist)} Blöcke weg – zu weit (max. 4.5). Geh näher ran.`)
    const block = ch.block
    if (!block.diggable) throw new UserError(`${block.name} kann man nicht abbauen.`)
    const ms = bot.digTime(block)
    if (ms > 30000) throw new UserError(`${block.name} abzubauen würde ${Math.round(ms / 1000)} Sekunden dauern. Nimm ein besseres Werkzeug.`)
    let warn = ''
    if (block.harvestTools && !(bot.heldItem && block.harvestTools[bot.heldItem.type])) {
      const tools = Object.keys(block.harvestTools).map(id => bot.registry.items[id]?.name).filter(Boolean)
      warn = ` ⚠ Damit bekommst du nichts! Du brauchst z. B. ${tools.slice(0, 2).join(' oder ')}.`
    }
    const name = block.name
    await this.withWorld(async () => {
      await withTimeout(bot.dig(block, true, ch.faceVec), ms + 5000, 'Abbauen hat zu lange gedauert.')
      await bot.waitForTicks(3)
    })
    return `Abgebaut: ${name} (${(ms / 1000).toFixed(1)} s).${warn} Heruntergefallene Items musst du einsammeln (drüberlaufen).`
  }

  async placeLooking () {
    const bot = this.ensure()
    const ch = S.crosshair(bot)
    if (!bot.heldItem) throw new UserError('Du hast nichts in der Hand. Nimm zuerst einen Block ("equip").')
    if (ch.kind !== 'block') throw new UserError('Im Fadenkreuz ist kein Block, an den du bauen könntest.')
    if (!ch.inReach) throw new UserError(`Der Block ist ${S.fmt(ch.dist)} Blöcke weg – zu weit (max. 4.5).`)
    const target = ch.block.position.plus(ch.faceVec)
    if (this.intersectsBody(target)) throw new UserError('Da stehst du selbst. Geh einen Schritt zur Seite oder spring (Säule bauen: springen und nach unten schauen).')
    const held = bot.heldItem.name
    await this.withWorld(() => this.placeAgainst(ch.block, ch.faceVec, { forceLook: 'ignore' }))
    const placed = bot.blockAt(target)
    return `${held} gesetzt bei ${S.blockPos(target)}${placed && placed.name !== held ? ` (dort ist jetzt: ${placed.name})` : ''}.`
  }

  async placeAgainst (reference, faceVec, options = {}) {
    const bot = this.bot
    const opts = { swingArm: 'right', ...options }
    if (typeof bot._placeBlockWithOptions === 'function') {
      await withTimeout(bot._placeBlockWithOptions(reference, faceVec, opts), 6000, 'Setzen hat nicht geklappt (keine Antwort vom Server).')
    } else {
      await withTimeout(bot.placeBlock(reference, faceVec), 6000, 'Setzen hat nicht geklappt (keine Antwort vom Server).')
    }
  }

  // Der klassische Säulen-Trick: nach unten schauen, springen und im Sprung einen Block unter sich setzen.
  async jumpPlace () {
    const bot = this.ensure()
    if (!bot.heldItem || !bot.registry.blocksByName[bot.heldItem.name]) throw new UserError('Nimm zuerst einen Block in die Hand ("equip").')
    if (!bot.entity.onGround) throw new UserError('Du musst dafür auf dem Boden stehen.')
    const start = bot.entity.position.clone()
    const feet = start.floored()
    const below = bot.blockAt(feet.offset(0, -1, 0))
    if (!below || below.boundingBox !== 'block') throw new UserError('Unter dir ist kein fester Block.')
    const head = bot.blockAt(feet.offset(0, 2, 0))
    if (head && head.boundingBox === 'block') throw new UserError(`Über dir ist ${head.name} – da kannst du nicht hochspringen.`)
    const held = bot.heldItem.name
    const { yaw } = bot.entity
    await bot.look(yaw, -Math.PI / 2, true)
    await this.withWorld(async () => {
      bot.setControlState('jump', true)
      try {
        for (let i = 0; i < 12 && bot.entity.position.y < start.y + 1.05; i++) await bot.waitForTicks(1)
      } finally {
        bot.setControlState('jump', false)
      }
      if (bot.entity.position.y < start.y + 1) throw new UserError('Nicht hoch genug gesprungen.')
      await this.placeAgainst(below, new Vec3(0, 1, 0), { forceLook: 'ignore' })
      await bot.waitForTicks(6)
    })
    return `Hochgesprungen und ${held} unter dich gesetzt. Du stehst jetzt 1 Block höher.`
  }

  intersectsBody (pos) {
    const p = this.bot.entity.position
    const w = 0.3
    return pos.x < p.x + w && pos.x + 1 > p.x - w &&
      pos.z < p.z + w && pos.z + 1 > p.z - w &&
      pos.y < p.y + 1.8 && pos.y + 1 > p.y
  }

  // Bauen nach Claudes eigenem Plan: Claude sagt für jeden Block, was wohin kommt.
  // Der Bot zielt nur präzise auf die richtige Seite, wie eine ruhige Hand an der Maus.
  // Alles muss in Armreichweite sein; weiter weg muss Claude selbst hinlaufen.
  async build ({ blocks }) {
    const bot = this.ensure()
    if (!blocks.length) throw new UserError('Keine Blöcke angegeben.')
    const results = { placed: 0, removed: 0, skipped: 0, failed: [] }
    const { yaw, pitch } = bot.entity
    await this.withWorld(async () => {
      for (const spec of blocks) {
        const pos = new Vec3(Math.floor(spec.x), Math.floor(spec.y), Math.floor(spec.z))
        const name = itemName(spec.block)
        try {
          const outcome = await this.buildOne(pos, name, spec)
          results[outcome]++
        } catch (err) {
          results.failed.push(`${S.blockPos(pos)} ${name}: ${err.message}`)
        }
      }
      await bot.look(yaw, pitch, true) // wieder dahin schauen, wo du vorher hingeschaut hast
      await bot.waitForTicks(2)
    })
    const lines = [`Bauen: ${results.placed} gesetzt, ${results.removed} entfernt, ${results.skipped} waren schon richtig, ${results.failed.length} nicht geklappt.`]
    if (results.failed.length) {
      lines.push('Nicht geklappt:')
      lines.push(...results.failed.slice(0, 12).map(f => '  ' + f))
      if (results.failed.length > 12) lines.push(`  … und ${results.failed.length - 12} weitere`)
    }
    return lines.join('\n')
  }

  async buildOne (pos, name, spec) {
    const bot = this.bot
    const current = bot.blockAt(pos)
    if (!current) throw new UserError('dieser Teil der Welt ist nicht geladen')
    const dist = S.eyePos(bot).distanceTo(pos.offset(0.5, 0.5, 0.5))
    if (dist > S.REACH_BLOCK + 0.3) throw new UserError(`zu weit weg (${S.fmt(dist)} Blöcke, max. 4.5) – geh näher hin`)

    if (name === 'air') {
      if (current.boundingBox === 'empty' && REPLACEABLE.has(current.name)) return 'skipped'
      if (!current.diggable) throw new UserError(`${current.name} kann man nicht abbauen`)
      const ms = bot.digTime(current)
      if (ms > 15000) throw new UserError(`${current.name} abzubauen dauert zu lange (${Math.round(ms / 1000)} s)`)
      await withTimeout(bot.dig(current, true, 'raycast'), ms + 5000, 'Abbauen hat zu lange gedauert')
      return 'removed'
    }

    if (current.name === name) return 'skipped'
    if (!REPLACEABLE.has(current.name)) throw new UserError(`da ist schon ${current.name} (erst mit "air" wegmachen)`)
    if (!bot.registry.itemsByName[name]) throw new UserError('unbekannter Block')
    if (this.intersectsBody(pos)) throw new UserError('da stehst du selbst')

    // Einen festen Nachbarblock suchen, an den man den neuen Block dranbauen kann.
    const eye = S.eyePos(bot)
    const neighbors = FACE_OFFSETS
      .map(off => ({ ref: bot.blockAt(pos.minus(off)), face: off }))
      .filter(n => n.ref && n.ref.boundingBox === 'block' && !REPLACEABLE.has(n.ref.name))
    if (!neighbors.length) throw new UserError('kein Nachbarblock zum Dranbauen (Blöcke können nicht in der Luft schweben)')
    const wantTop = spec.half === 'top'
    neighbors.sort((a, b) => {
      const score = (n) => {
        let s = n.ref.position.offset(0.5, 0.5, 0.5).plus(n.face.scaled(0.5)).distanceTo(eye)
        if (wantTop && n.face.y === 1) s += 10 // von unten gesetzt wäre es die untere Hälfte
        if (!wantTop && n.face.y === -1) s += 5
        return s
      }
      return score(a) - score(b)
    })
    const { ref, face } = neighbors[0]

    await this.equipItem(name, 'hand')
    // Erst hinschauen (bzw. in die gewünschte Richtung drehen), dann einen Tick warten: Der Server
    // liest die Blickrichtung für Treppen, Türen & Co. aus dem letzten Blick-Paket.
    if (spec.facing) {
      const compass = FACING_COMPASS[spec.facing]
      if (compass === undefined) throw new UserError('facing muss north, east, south oder west sein')
      await bot.look(S.yawFromCompass(compass), 0, true)
    } else {
      await bot.lookAt(ref.position.offset(0.5, 0.5, 0.5).plus(face.scaled(0.5)), true)
    }
    await bot.waitForTicks(1)
    await this.placeAgainst(ref, face, { forceLook: 'ignore', half: spec.half })
    return 'placed'
  }

  async equipItem (name, where = 'hand') {
    const bot = this.bot
    const def = bot.registry.itemsByName[name]
    if (!def) throw new UserError(`Unbekanntes Item "${name}".`)
    if (where === 'hand' && bot.heldItem?.name === name) return
    const item = bot.inventory.items().find(i => i.name === name) ||
      (bot.inventory.slots[45]?.name === name ? bot.inventory.slots[45] : null)
    if (!item) {
      if (bot.game.gameMode === 'creative' && where === 'hand') {
        const Item = require('prismarine-item')(bot.registry)
        await bot.creative.setInventorySlot(36 + bot.quickBarSlot, new Item(def.id, Math.min(64, def.stackSize || 64)))
        return
      }
      throw new UserError(`Du hast kein ${name} im Inventar.`)
    }
    await bot.equip(item, where)
  }

  async equip ({ item, where = 'hand' }) {
    this.ensure()
    const name = itemName(item)
    await this.equipItem(name, where)
    return `${name} ausgerüstet (${where}).`
  }

  async selectSlot ({ slot }) {
    const bot = this.ensure()
    bot.setQuickBarSlot(slot)
    return `Hotbar-Slot ${slot} gewählt: ${S.itemText(bot.heldItem)} in der Hand.`
  }

  async use ({ ticks }) {
    const bot = this.ensure()
    const ch = S.crosshair(bot)
    const held = bot.heldItem

    if (ch.kind === 'block' && ch.inReach) {
      const block = ch.block
      if (/_bed$/.test(block.name)) {
        await this.withWorld(async () => {
          await withTimeout(bot.sleep(block), 5000, 'Schlafen hat nicht geklappt.')
          await withTimeout(new Promise(resolve => bot.once('wake', resolve)), 20000, 'Noch nicht aufgewacht.')
        })
        return '🛏 Geschlafen – die Nacht ist vorbei.'
      }
      if (CONTAINERS.test(block.name)) {
        await this.closeWindow()
        this.window = await this.withWorld(() => withTimeout(bot.openContainer(block), 5000, 'Die Kiste ging nicht auf.'))
        this.window.kind = 'container'
        this.window.blockName = block.name
        return `${block.name} geöffnet. Benutze "container" zum Reinlegen/Rausnehmen.`
      }
      if (FURNACES.test(block.name)) {
        await this.closeWindow()
        this.window = await this.withWorld(() => withTimeout(bot.openFurnace(block), 5000, 'Der Ofen ging nicht auf.'))
        this.window.kind = 'furnace'
        this.window.blockName = block.name
        return `${block.name} geöffnet. Benutze "container" mit slot input/fuel/output.`
      }
      if (block.name === 'crafting_table') {
        return 'Das ist eine Werkbank. Solange du nah dran bist (max. 4.5 Blöcke), kannst du mit "craft" auch große Rezepte herstellen.'
      }
      if (SWITCHES.test(block.name)) {
        await this.withWorld(async () => {
          await bot.activateBlock(block, ch.faceVec)
          await bot.waitForTicks(3)
        })
        const now = bot.blockAt(block.position)
        const props = now?.getProperties ? now.getProperties() : {}
        const state = props.open !== undefined ? (props.open ? 'offen' : 'zu') : props.powered !== undefined ? (props.powered ? 'an' : 'aus') : ''
        return `${block.name} benutzt${state ? ` – jetzt ${state}` : ''}.`
      }
    }

    if (ch.kind === 'entity' && ch.inReach) {
      const e = ch.entity
      await this.withWorld(async () => {
        if (/boat|minecart|horse|donkey|mule|pig|strider|camel/.test(e.name || '') && !(held && /wheat|carrot|apple|sugar|hay|fungus/.test(held.name))) bot.mount(e)
        else bot.activateEntity(e)
        await bot.waitForTicks(5)
      })
      return `${S.entityLabel(e)} mit Rechtsklick benutzt.`
    }

    if (held && bot.registry.foodsByName?.[held.name]) {
      if (bot.food >= 20 && !/golden_apple|chorus|potion|milk/.test(held.name)) throw new UserError('Du bist satt und kannst gerade nichts essen.')
      await this.withWorld(() => withTimeout(bot.consume(), 6000, 'Essen hat nicht geklappt.'))
      return `${held.name} gegessen. Hunger jetzt ${bot.food}/20.`
    }

    if (ch.kind === 'block' && ch.inReach && held) {
      await this.withWorld(async () => {
        await bot.activateBlock(ch.block, ch.faceVec)
        await bot.waitForTicks(3)
      })
      return `Rechtsklick mit ${held.name} auf ${ch.block.name}. (Zum Blöcke-Setzen ist "place" besser.)`
    }

    const hold = Math.max(1, Math.min(100, Math.round(ticks || (held && /bow|crossbow|trident/.test(held.name) ? 22 : 5))))
    await this.withWorld(async () => {
      bot.activateItem()
      await bot.waitForTicks(hold)
      bot.deactivateItem()
      await bot.waitForTicks(2)
    })
    return `Rechtsklick${held ? ` mit ${held.name}` : ''} ${hold} Ticks gehalten und losgelassen.`
  }

  describeWindow () {
    const w = this.window
    if (!w) return ''
    if (w.kind === 'furnace') {
      const it = (x) => S.itemText(x)
      return `🔥 Offener ${w.blockName}: Eingang ${it(w.inputItem())}, Brennstoff ${it(w.fuelItem())}, Ergebnis ${it(w.outputItem())}, Fortschritt ${Math.round((w.progress || 0) * 100)}%`
    }
    const items = w.containerItems()
    return `📦 Offene ${w.blockName}: ` + (items.length ? items.map(i => `${i.name} x${i.count}`).join(', ') : 'leer')
  }

  async closeWindow () {
    if (!this.window) return
    try { this.window.close() } catch {}
    this.window = null
  }

  async container ({ action, item, count, slot }) {
    const bot = this.ensure()
    const w = this.window
    if (action === 'close') {
      await this.closeWindow()
      return 'Geschlossen.'
    }
    if (!w) throw new UserError('Nichts geöffnet. Schau eine Kiste/einen Ofen an und benutze "use".')
    const name = item ? itemName(item) : null
    const def = name ? bot.registry.itemsByName[name] : null
    if (name && !def) throw new UserError(`Unbekanntes Item "${name}".`)
    if (w.kind === 'furnace') {
      if (action === 'take') {
        const s = slot || 'output'
        if (s === 'output') await w.takeOutput()
        else if (s === 'input') await w.takeInput()
        else await w.takeFuel()
        return `Aus dem Ofen genommen (${s}).`
      }
      if (!def) throw new UserError('Sag mir, welches Item.')
      const n = count || bot.inventory.count(def.id, null)
      if (slot === 'fuel') await w.putFuel(def.id, null, n)
      else await w.putInput(def.id, null, n)
      return `${n}× ${name} in den Ofen (${slot === 'fuel' ? 'Brennstoff' : 'Eingang'}) gelegt.`
    }
    if (!def) throw new UserError('Sag mir, welches Item.')
    if (action === 'put') {
      const n = count || bot.inventory.count(def.id, null)
      await w.deposit(def.id, null, n)
      return `${n}× ${name} hineingelegt.`
    }
    const have = w.containerItems().filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
    const n = count || have
    await w.withdraw(def.id, null, n)
    return `${n}× ${name} herausgenommen.`
  }

  async craft ({ item, count = 1 }) {
    const bot = this.ensure()
    const name = itemName(item)
    const def = bot.registry.itemsByName[name]
    if (!def) throw new UserError(`Unbekanntes Item "${name}".`)
    const tableId = bot.registry.blocksByName.crafting_table.id
    const table = bot.findBlock({ matching: tableId, maxDistance: S.REACH_BLOCK })
    const recipes = bot.recipesFor(def.id, null, 1, table)
    if (!recipes.length) {
      const all = bot.recipesAll(def.id, null, true)
      if (!all.length) throw new UserError(`Für ${name} gibt es kein Rezept an der Werkbank (vielleicht im Ofen?).`)
      // Das Rezept zeigen, für das dir am wenigsten fehlt (z. B. die Holzart, die du hast).
      const missing = (r) => r.delta.filter(d => d.count < 0)
        .reduce((sum, d) => sum + Math.max(0, -d.count - bot.inventory.count(d.id, null)), 0)
      const plainOak = (r) => r.delta.some(d => /^oak_/.test(bot.registry.items[d.id]?.name || '')) ? 0 : 1
      const r = all.slice().sort((a, b) => missing(a) - missing(b) || plainOak(a) - plainOak(b))[0]
      const need = r.delta.filter(d => d.count < 0).map(d => {
        const have = bot.inventory.count(d.id, null)
        return `${-d.count}× ${bot.registry.items[d.id]?.name} (du hast ${have})`
      })
      const variants = all.length > 1 ? ` Es gibt ${all.length} Varianten, z. B. mit anderen Holzarten.` : ''
      const tableHint = r.requiresTable && !table ? ' Außerdem brauchst du eine Werkbank in Reichweite (max. 4.5 Blöcke).' : ''
      throw new UserError(`Dafür fehlt dir etwas. Rezept für ${name}: ${need.join(', ')}.${variants}${tableHint}`)
    }
    const recipe = recipes[0]
    let times = Math.max(1, Math.round(count))
    while (times > 1 && !bot.recipesFor(def.id, null, times * recipe.result.count, table).length) times--
    await this.withWorld(() => withTimeout(bot.craft(recipe, times, table), 10000, 'Herstellen hat zu lange gedauert.'))
    return `Hergestellt: ${times * recipe.result.count}× ${name}.${times < count ? ` (Für mehr hat das Material nicht gereicht.)` : ''}`
  }

  inventory () {
    const bot = this.ensure()
    const lines = []
    const hotbar = []
    for (let i = 0; i < 9; i++) {
      const it = bot.inventory.slots[36 + i]
      hotbar.push(`${i}${i === bot.quickBarSlot ? '*' : ''}: ${it ? S.itemText(it) : '–'}`)
    }
    lines.push('🎒 Hotbar (* = in der Hand): ' + hotbar.join(' | '))
    const totals = new Map()
    for (const it of bot.inventory.items()) totals.set(it.name, (totals.get(it.name) || 0) + it.count)
    lines.push('Alles zusammen: ' + (totals.size ? [...totals].map(([n, c]) => `${n} ×${c}`).join(', ') : 'leer'))
    const armor = ['Kopf', 'Brust', 'Beine', 'Füße'].map((label, i) => {
      const it = bot.inventory.slots[5 + i]
      return `${label}: ${it ? it.name : '–'}`
    })
    lines.push('Rüstung: ' + armor.join(', ') + ` · Nebenhand: ${S.itemText(bot.inventory.slots[45])}`)
    return lines.join('\n')
  }

  async drop ({ item, count }) {
    const bot = this.ensure()
    const name = itemName(item)
    const def = bot.registry.itemsByName[name]
    if (!def) throw new UserError(`Unbekanntes Item "${name}".`)
    const have = bot.inventory.count(def.id, null)
    if (!have) throw new UserError(`Du hast kein ${name}.`)
    const n = Math.min(have, count || have)
    await this.withWorld(async () => {
      await bot.toss(def.id, null, n)
      await bot.waitForTicks(2)
    })
    return `${n}× ${name} in Blickrichtung geworfen.`
  }

  async chat ({ message }) {
    const bot = this.ensure()
    const text = String(message).replace(/\s+/g, ' ').trim()
    if (!text) throw new UserError('Leere Nachricht.')
    for (let i = 0; i < text.length; i += 250) bot.chat(text.slice(i, i + 250))
    await sleep(text.startsWith('/') ? 1000 : 300) // Befehle brauchen einen Moment, bis der Server antwortet
    return `Gesagt: "${text}"`
  }

  async disconnect () {
    const bot = this.bot
    if (!bot) return 'Ich war gar nicht verbunden.'
    if (this.connected && this.turnAvailable) {
      bot.chat('/tick unfreeze') // Welt nicht angehalten zurücklassen
      await sleep(400)
    }
    if (this.eyes) await this.eyes.stop()
    this.eyes = null
    try { bot.quit() } catch {}
    this.bot = null
    this.connected = false
    this.window = null
    return '👋 Tschüss! Die Welt läuft wieder normal.'
  }
}

module.exports = { Body, UserError }
