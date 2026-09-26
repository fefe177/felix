// Brücke zwischen Minecraft-Server und Claude: liest den Chat aus der Server-Konsole,
// antwortet im Chat, startet bei "bau …" einen Bauauftrag und baut das Ergebnis mit Server-Befehlen auf.

const fs = require('fs')
const path = require('path')
const M = require('./modell')
const P = require('./platzieren')
const settings = require('./einstellungen')
const verbrauch = require('./verbrauch')
const { runClaude, runChat, cancel, ROOT } = require('./auftrag')

const CHAT = /\]: (?:\[Not Secure\] )?<([A-Za-z0-9_]{1,16})> (.*)$/
const BAU = /^\s*(?:@?claude[,:]?\s+)?!?(?:bau|baue|bauen|bau\s*mir|baue\s*mir)\b/i
const WEG = /^\s*!(?:weg|rückgängig|rueckgaengig|undo|abreißen|abreissen)\s*$/i
const STOPP = /^\s*!(?:stopp|stop|abbrechen)\s*$/i
const HILFE = /^\s*!(?:hilfe|help)\s*$/i
const ANGESPROCHEN = /\bclaude\b/i
// Minecraft erlaubt nur 256 Zeichen pro Nachricht. Endet eine Nachricht mit "..." (oder "+"),
// wartet Claude auf die Fortsetzung und setzt alles zusammen.
const WEITER = /(\.\.\.|…|\+)\s*$/
const WEITER_ANFANG = /^\s*(\.\.\.|…)\s*/
const WEITER_WARTEN_MS = 3 * 60 * 1000
const CHAT_PAUSE_MS = 2000 // kurz warten, falls gleich noch eine Nachricht kommt
// Ausgaben unserer eigenen Befehle – die sollen die Konsole nicht zumüllen.
const NOISE = /\]: (Changed the block at|Successfully filled|No blocks were filled|Could not set the block|.+ has the following entity data)/
const PROBLEM = /\]: (Unknown block type|Incorrect argument|That position is not loaded|Cannot place blocks outside|Unknown or incomplete command|Expected )/

const DIR = path.join(ROOT, 'bau', 'auftraege')
const HISTORY_FILE = path.join(DIR, 'verlauf.json')
const CHAT_FILE = path.join(DIR, 'chat.json')
const CHAT_SESSION_MAX = 30 // danach beginnt ein frisches Gespräch (spart Verbrauch)

function stamp () {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function sleep (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function readJson (file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

// Lange Antworten in chatgerechte Stücke teilen.
function chunks (text, max = 220) {
  const out = []
  for (const line of String(text).split('\n').map(l => l.trim()).filter(Boolean)) {
    let rest = line
    while (rest.length > max) {
      const cut = rest.lastIndexOf(' ', max) > 40 ? rest.lastIndexOf(' ', max) : max
      out.push(rest.slice(0, cut))
      rest = rest.slice(cut).trim()
    }
    if (rest) out.push(rest)
  }
  return out.slice(0, 6)
}

class Bruecke {
  constructor (send) {
    this.send = send
    this.waiting = []
    this.job = null
    this.placingUntil = 0
    this.problems = 0
    this.chatQueue = []
    this.chatting = false
    this.chatTimer = null
    this.pending = new Map() // Spieler → angefangene lange Nachricht
    fs.mkdirSync(path.join(ROOT, 'bau', 'bauten'), { recursive: true })
    fs.mkdirSync(DIR, { recursive: true })
    this.history = readJson(HISTORY_FILE, [])
    this.chatState = readJson(CHAT_FILE, { sessionId: null, count: 0, verlauf: [] })
  }

  // Jede Zeile der Server-Konsole kommt hier vorbei. Rückgabe true = nicht anzeigen.
  onLine (line) {
    for (const w of this.waiting) {
      const m = w.ok.exec(line) || (w.fail && w.fail.exec(line))
      if (m) {
        this.waiting.splice(this.waiting.indexOf(w), 1)
        clearTimeout(w.timer)
        if (w.ok.test(line)) w.resolve(m)
        else w.reject(new Error(m[0]))
        return true
      }
    }
    const chat = CHAT.exec(line)
    if (chat) {
      this.onChat(chat[1], chat[2]).catch(err => this.say('❌ ' + err.message, 'red'))
      return false
    }
    if (Date.now() < this.placingUntil) {
      if (PROBLEM.test(line)) { this.problems++; return true }
      if (NOISE.test(line)) return true
    }
    return NOISE.test(line)
  }

  say (text, color = 'white') {
    const msg = [{ text: '[Claude] ', color: 'aqua', bold: true }, { text: String(text), color }]
    this.send(`tellraw @a ${JSON.stringify(msg)}`)
  }

  query (command, ok, fail, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const w = { ok, fail, resolve, reject }
      w.timer = setTimeout(() => {
        this.waiting.splice(this.waiting.indexOf(w), 1)
        reject(new Error('Der Server hat nicht geantwortet'))
      }, timeoutMs)
      this.waiting.push(w)
      this.send(command)
    })
  }

  async entityData (player, key) {
    const m = await this.query(`data get entity ${player} ${key}`,
      new RegExp(`\\]: ${player} has the following entity data: (.*)$`),
      /\]: (No entity was found|No player was found)/)
    return m[1]
  }

  async playerPlace (player) {
    const pos = (await this.entityData(player, 'Pos')).match(/-?\d+(?:\.\d+)?(?:E-?\d+)?/gi).map(Number)
    const rot = (await this.entityData(player, 'Rotation')).match(/-?\d+(?:\.\d+)?(?:E-?\d+)?/gi).map(Number)
    const dim = (await this.entityData(player, 'Dimension')).replace(/"/g, '').trim()
    return {
      block: { x: Math.floor(pos[0]), y: Math.floor(pos[1] + 0.001), z: Math.floor(pos[2]) },
      facing: P.facingFromYaw(rot[0]),
      dim: /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(dim) ? dim : 'minecraft:overworld'
    }
  }

  async onChat (player, message) {
    if (HILFE.test(message)) {
      this.say('Schreib einfach mit mir! Bauen: „bau ein Haus mit Garten“. Ändern: „bau das Dach rot“. Entfernen: „!weg“. Abbrechen: „!stopp“. Lange Nachricht: mit „...“ enden und weiterschreiben.')
      return
    }
    if (STOPP.test(message)) return this.stop()
    if (WEG.test(message)) return this.removeLast()

    // Lange Nachrichten aus mehreren Teilen zusammensetzen
    const part = message.replace(WEITER, '').replace(WEITER_ANFANG, '').trim()
    let pending = this.pending.get(player)
    if (WEITER.test(message)) {
      if (!pending) {
        pending = { parts: [] }
        this.pending.set(player, pending)
        this.say('✍ Schreib weiter – ich warte, bis eine Nachricht ohne „...“ am Ende kommt.', 'gray')
      }
      if (part) pending.parts.push(part)
      clearTimeout(pending.timer)
      // Kommt nichts mehr, nehmen wir, was da ist.
      pending.timer = setTimeout(() => {
        this.pending.delete(player)
        this.handleMessage(player, pending.parts.join(' ')).catch(err => this.say('❌ ' + err.message, 'red'))
      }, WEITER_WARTEN_MS)
      return
    }
    if (pending) {
      clearTimeout(pending.timer)
      this.pending.delete(player)
      if (part) pending.parts.push(part)
      return this.handleMessage(player, pending.parts.join(' '))
    }
    return this.handleMessage(player, message.trim())
  }

  async handleMessage (player, message) {
    if (!message) return
    if (BAU.test(message)) return this.startJob(player, message)
    const mode = settings.load().chat
    if (mode === 'aus' || (mode === 'claude' && !ANGESPROCHEN.test(message))) return
    this.chatQueue.push({ player, message })
    this.addChatLog(player, message)
    // Kurz warten – schnell hintereinander geschriebene Nachrichten beantwortet Claude zusammen.
    clearTimeout(this.chatTimer)
    this.chatTimer = setTimeout(() => {
      if (!this.chatting) this.flushChat().catch(err => this.say('❌ ' + err.message, 'red'))
    }, CHAT_PAUSE_MS)
  }

  // ---------- Chat ----------

  addChatLog (von, text) {
    this.chatState.verlauf.push({ zeit: new Date().toISOString(), von, text })
    this.chatState.verlauf = this.chatState.verlauf.slice(-60)
    fs.writeFileSync(CHAT_FILE, JSON.stringify(this.chatState))
  }

  async flushChat () {
    this.chatting = true
    try {
      while (this.chatQueue.length) {
        const batch = this.chatQueue.splice(0)
        const player = batch[batch.length - 1].player
        const last = this.history[this.history.length - 1]
        const prompt = [
          'Chat im Minecraft-Spiel (antworte kurz, passend für den Minecraft-Chat):',
          ...batch.map(m => `<${m.player}> ${m.message}`),
          '',
          `Zustand: ${this.job ? `Du planst gerade „${this.job.message}“.` : 'Du planst gerade nichts.'} ` +
            `Letzter Bau: ${last ? `„${last.name}“` : 'noch keiner'}.`
        ].join('\n')
        const s = settings.load()
        if (this.chatState.count >= CHAT_SESSION_MAX) { this.chatState.sessionId = null; this.chatState.count = 0 }
        let res = await runChat({ prompt, sessionId: this.chatState.sessionId, model: s.chatModell, effort: s.chatEffort, logFile: path.join(DIR, 'chat-letzte-ausgabe.txt') })
        if (!res.ok && this.chatState.sessionId) {
          // Altes Gespräch nicht mehr da? Dann ein neues beginnen.
          this.chatState.sessionId = null
          this.chatState.count = 0
          res = await runChat({ prompt, model: s.chatModell, effort: s.chatEffort, logFile: path.join(DIR, 'chat-letzte-ausgabe.txt') })
        }
        verbrauch.record({ art: 'chat', text: batch.map(m => m.message).join(' / '), modell: s.chatModell, effort: s.chatEffort, ok: res.ok }, res.info)
        if (!res.ok || !res.info) {
          this.say('❌ Ich konnte gerade nicht antworten: ' + (res.error || (res.timedOut ? 'zu langsam' : (res.stderr || 'unbekannter Fehler').split('\n').pop().slice(0, 120))), 'red')
          continue
        }
        this.chatState.sessionId = res.info.session_id || this.chatState.sessionId
        this.chatState.count++
        let reply = String(res.info.result || '').trim()
        // "BAU: …" in der Antwort startet einen Bauauftrag
        const bau = /^\s*BAU:\s*(.+)$/im.exec(reply)
        reply = reply.replace(/^\s*BAU:.*$/gim, '').trim()
        if (reply) {
          for (const part of chunks(reply)) this.say(part)
          this.addChatLog('Claude', reply)
        }
        if (bau) this.startJob(player, bau[1].trim()).catch(err => this.say('❌ ' + err.message, 'red'))
      }
    } finally {
      this.chatting = false
    }
  }

  // ---------- Bauen ----------

  stop () {
    if (!this.job) return this.say('Ich plane gerade nichts.')
    this.job.cancelled = true
    cancel()
    return this.say('Okay, ich höre auf.')
  }

  async startJob (player, message) {
    if (this.job) return this.say(`Ich plane gerade noch „${this.job.message}“ – warte kurz oder schreib „!stopp“.`)
    const s = settings.load()
    const job = this.job = { id: stamp(), player, message, start: Date.now(), modell: s.bauModell, status: 'Ich schaue, wo du stehst…' }
    try {
      let place
      try {
        place = await this.playerPlace(player)
      } catch (err) {
        return this.say(`Ich kann ${player} gerade nicht finden (${err.message}).`, 'red')
      }
      const jobDir = path.join(DIR, job.id)
      fs.mkdirSync(jobDir, { recursive: true })
      const last = this.history[this.history.length - 1]
      const prompt = [
        `Bauauftrag von ${player} im Minecraft-Chat:`,
        `„${message}“`,
        '',
        last
          ? `Letzter Bau: „${last.name}“, Bauplan-Datei ${last.datei}. Wenn sich der Auftrag auf diesen Bau bezieht (ändern, erweitern, verschönern, „mach …“), dann bearbeite genau diese Datei und gib sie mit modus "ändern" ab.`
          : 'Es gibt noch keinen früheren Bau.',
        `Für einen neuen Bau schreib den Bauplan nach bau/bauten/${job.id}-<kurzer-name>.js und gib ihn mit modus "neu" ab.`,
        `Halte dich an die Bauregeln in CLAUDE.md. Ablauf: Bauplan schreiben → vorschau → verbessern → fertig. Höchstens ${s.maxVorschauen} Vorschauen.`
      ].join('\n')
      fs.writeFileSync(path.join(jobDir, 'auftrag.txt'), prompt)
      this.say(`🔨 Ich plane: „${message}“ – das dauert 1–3 Minuten.`)
      job.status = 'Claude plant…'

      // Fortschritt aus dem Auftrags-Ordner in den Chat holen
      const statusFile = path.join(jobDir, 'status.log')
      let shown = 0
      const relay = () => {
        let lines = []
        try { lines = fs.readFileSync(statusFile, 'utf8').split('\n').filter(Boolean) } catch {}
        for (const l of lines.slice(shown)) { this.say(l, 'gray'); job.status = l }
        shown = lines.length
      }
      const poll = setInterval(relay, 1500)
      const res = await runClaude({ jobDir, prompt, model: s.bauModell, effort: s.bauEffort })
      clearInterval(poll)
      relay()

      const resultFile = path.join(jobDir, 'ergebnis.json')
      const result = fs.existsSync(resultFile) ? readJson(resultFile, null) : null
      const previews = fs.readdirSync(jobDir).filter(f => /^vorschau-\d+\.jpg$/.test(f)).sort((a, b) => parseInt(a.slice(9)) - parseInt(b.slice(9)))
      verbrauch.record({
        art: 'bau',
        id: job.id,
        text: message,
        name: result ? result.name : null,
        bild: previews.length ? `auftraege/${job.id}/${previews[previews.length - 1]}` : null,
        modell: s.bauModell,
        effort: s.bauEffort,
        ok: !!result && !job.cancelled
      }, res.info)
      if (job.cancelled) return

      if (!result) {
        const why = res.timedOut ? 'Es hat zu lange gedauert.'
          : res.error || (res.info && res.info.is_error ? String(res.info.result || res.info.subtype || '').slice(0, 150) : '') ||
            (res.stderr ? res.stderr.split('\n').pop().slice(0, 150) : 'Kein fertiger Bauplan.')
        return this.say('❌ Das hat nicht geklappt: ' + why, 'red')
      }
      if (result.modus === 'nichts') {
        this.addChatLog('Claude', result.nachricht)
        return this.say(result.nachricht)
      }

      job.status = 'Wird gebaut…'
      const { blocks } = M.runPlan(fs.readFileSync(path.join(ROOT, result.datei), 'utf8'))
      let anchor, facing, dim
      if (result.modus === 'ändern' && last) {
        ({ anchor, facing, dim } = last)
        await this.execute(P.removeCommands(last.blocks.map(([x, y, z, block]) => ({ x, y, z, block })), last.dim))
        this.history.pop()
      } else {
        ({ anchor, facing } = P.toWorld(blocks, place.block, place.facing))
        dim = place.dim
      }
      const worldBlocks = P.placeAt(blocks, anchor, facing)
      const problems = await this.execute(P.buildCommands(worldBlocks, anchor.y, dim))
      this.history.push({ id: job.id, name: result.name, datei: result.datei, anchor, facing, dim, blocks: worldBlocks.map(b => [b.x, b.y, b.z, b.block]) })
      this.saveHistory()
      this.say(`✅ ${result.name} ist fertig (${worldBlocks.length} Blöcke). ${result.nachricht || ''}`, 'green')
      this.addChatLog('Claude', `✅ ${result.name} gebaut. ${result.nachricht || ''}`)
      if (problems) this.say(`⚠ ${problems} Befehle haben nicht geklappt (vielleicht ist dort die Welt nicht geladen).`, 'yellow')
      this.say('Ändern: z. B. „bau das Dach rot“ · Entfernen: „!weg“', 'gray')
    } finally {
      this.job = null
    }
  }

  async execute (commands) {
    this.problems = 0
    this.placingUntil = Date.now() + 5000 + commands.length * 2
    for (let i = 0; i < commands.length; i++) {
      this.send(commands[i])
      if (i % 200 === 199) await sleep(50) // dem Server kurz Luft lassen
    }
    await sleep(1500 + commands.length)
    this.placingUntil = Date.now() + 1000
    return this.problems
  }

  async removeLast () {
    if (this.job) return this.say('Warte, bis ich mit dem Planen fertig bin.')
    const last = this.history.pop()
    if (!last) return this.say('Ich habe noch nichts gebaut, das ich wegmachen könnte.')
    await this.execute(P.removeCommands(last.blocks.map(([x, y, z, block]) => ({ x, y, z, block })), last.dim))
    this.saveHistory()
    this.say(`🧹 „${last.name}“ ist wieder weg.`)
  }

  saveHistory () {
    this.history = this.history.slice(-10)
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history))
  }

  // Für die Zentrale
  status () {
    return {
      job: this.job ? { message: this.job.message, player: this.job.player, status: this.job.status, seit: Math.round((Date.now() - this.job.start) / 1000), modell: this.job.modell } : null,
      chatting: this.chatting,
      bauten: this.history.slice().reverse().map(h => ({ id: h.id, name: h.name, bloecke: h.blocks.length })),
      chat: this.chatState.verlauf.slice(-30)
    }
  }
}

module.exports = { Bruecke, CHAT, BAU }
