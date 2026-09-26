// Einstellungen des Baumeisters (in der Zentrale änderbar, gespeichert in bau/einstellungen.json).

const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, 'einstellungen.json')

const MODELLE = [
  { id: 'haiku', name: 'Haiku 4.5', info: 'am schnellsten und sparsamsten, baut einfacher' },
  { id: 'sonnet', name: 'Sonnet 5', info: 'empfohlen: gut und sparsam' },
  { id: 'opus', name: 'Opus', info: 'am gründlichsten, verbraucht etwa doppelt so viel' }
]
const EFFORTS = [
  { id: 'low', name: 'wenig', info: 'schnell, denkt kurz nach' },
  { id: 'medium', name: 'mittel', info: 'empfohlen' },
  { id: 'high', name: 'viel', info: 'gründlicher, dauert länger und verbraucht mehr' }
]
const CHAT_MODI = [
  { id: 'alle', name: 'Alle Nachrichten', info: 'Claude antwortet auf alles im Chat' },
  { id: 'claude', name: 'Nur mit „Claude“', info: 'nur wenn „Claude“ in der Nachricht vorkommt' },
  { id: 'aus', name: 'Aus', info: 'nur „bau …“-Befehle' }
]

const DEFAULTS = {
  bauModell: process.env.BAU_MODELL || 'sonnet',
  bauEffort: process.env.BAU_EFFORT || 'medium',
  maxVorschauen: 3,
  chat: process.env.BAU_CHAT || 'alle',
  chatModell: 'sonnet',
  chatEffort: 'low'
}

function load () {
  let saved = {}
  try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch {}
  return { ...DEFAULTS, ...saved }
}

// Nur bekannte Werte übernehmen.
function save (changes) {
  const current = load()
  const ok = {
    bauModell: (v) => MODELLE.some(m => m.id === v),
    chatModell: (v) => MODELLE.some(m => m.id === v),
    bauEffort: (v) => EFFORTS.some(e => e.id === v),
    chatEffort: (v) => EFFORTS.some(e => e.id === v),
    chat: (v) => CHAT_MODI.some(c => c.id === v),
    maxVorschauen: (v) => Number.isInteger(v) && v >= 1 && v <= 5
  }
  for (const [k, v] of Object.entries(changes || {})) {
    if (ok[k] && ok[k](v)) current[k] = v
  }
  fs.writeFileSync(FILE, JSON.stringify(current, null, 2))
  return current
}

module.exports = { load, save, MODELLE, EFFORTS, CHAT_MODI }
