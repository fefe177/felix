// Brücke zwischen Minecraft-Server und Claude: liest den Chat aus der Server-Konsole,
// startet bei "bau …" einen Bauauftrag und baut das Ergebnis mit Server-Befehlen auf.

const fs = require('fs')
const path = require('path')
const M = require('./modell')
const P = require('./platzieren')
const { runClaude, cancel, ROOT } = require('./auftrag')

const CHAT = /\]: (?:\[Not Secure\] )?<([A-Za-z0-9_]{1,16})> (.*)$/
const BAU = /^\s*(?:@?claude[,:]?\s+)?!?(?:bau|baue|bauen|bau\s*mir|baue\s*mir)\b/i
const WEG = /^\s*!(?:weg|rückgängig|rueckgaengig|undo|abreißen|abreissen)\s*$/i
const STOPP = /^\s*!(?:stopp|stop|abbrechen)\s*$/i
const HILFE = /^\s*!(?:hilfe|help)\s*$/i
// Ausgaben unserer eigenen Befehle – die sollen die Konsole nicht zumüllen.
const NOISE = /\]: (Changed the block at|Successfully filled|No blocks were filled|Could not set the block|.+ has the following entity data)/
const PROBLEM = /\]: (Unknown block type|Incorrect argument|That position is not loaded|Cannot place blocks outside|Unknown or incomplete command|Expected )/

const HISTORY_FILE = path.join(ROOT, 'bau', 'auftraege', 'verlauf.json')

function stamp () {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function sleep (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

class Bruecke {
  constructor (send) {
    this.send = send
    this.waiting = []
    this.job = null
    this.placingUntil = 0
    this.problems = 0
    fs.mkdirSync(path.join(ROOT, 'bau', 'bauten'), { recursive: true })
    fs.mkdirSync(path.join(ROOT, 'bau', 'auftraege'), { recursive: true })
    try { this.history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) } catch { this.history = [] }
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
      this.say('Schreib zum Beispiel „bau ein Haus mit Garten“ oder „baue eine Burg“. Ändern: „bau das Dach rot“. Entfernen: „!weg“. Abbrechen: „!stopp“.')
      return
    }
    if (STOPP.test(message)) {
      if (!this.job) return this.say('Ich plane gerade nichts.')
      this.job.cancelled = true
      cancel()
      return this.say('Okay, ich höre auf.')
    }
    if (WEG.test(message)) return this.removeLast()
    if (BAU.test(message)) return this.startJob(player, message.trim())
  }

  async startJob (player, message) {
    if (this.job) return this.say(`Ich plane gerade noch „${this.job.message}“ – warte kurz oder schreib „!stopp“.`)
    const job = this.job = { id: stamp(), player, message }
    try {
      let place
      try {
        place = await this.playerPlace(player)
      } catch (err) {
        return this.say(`Ich kann ${player} gerade nicht finden (${err.message}).`, 'red')
      }
      const jobDir = path.join(ROOT, 'bau', 'auftraege', job.id)
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
        'Halte dich an die Bauregeln in CLAUDE.md. Ablauf: Bauplan schreiben → vorschau → verbessern → fertig.'
      ].join('\n')
      fs.writeFileSync(path.join(jobDir, 'auftrag.txt'), prompt)
      this.say(`🔨 Ich plane: „${message}“ – das dauert 1–3 Minuten.`)

      // Fortschritt aus dem Auftrags-Ordner in den Chat holen
      const statusFile = path.join(jobDir, 'status.log')
      let shown = 0
      const relay = () => {
        let lines = []
        try { lines = fs.readFileSync(statusFile, 'utf8').split('\n').filter(Boolean) } catch {}
        for (const l of lines.slice(shown)) this.say(l, 'gray')
        shown = lines.length
      }
      const poll = setInterval(relay, 1500)
      const res = await runClaude({ jobDir, prompt })
      clearInterval(poll)
      relay()
      if (job.cancelled) return

      const resultFile = path.join(jobDir, 'ergebnis.json')
      if (!fs.existsSync(resultFile)) {
        const why = res.timedOut ? 'Es hat zu lange gedauert.'
          : res.error || (res.info && res.info.is_error ? String(res.info.result || res.info.subtype || '').slice(0, 150) : '') ||
            (res.stderr ? res.stderr.split('\n').pop().slice(0, 150) : 'Kein fertiger Bauplan.')
        return this.say('❌ Das hat nicht geklappt: ' + why, 'red')
      }
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
      if (result.modus === 'nichts') return this.say(result.nachricht)

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
}

module.exports = { Bruecke, CHAT, BAU }
