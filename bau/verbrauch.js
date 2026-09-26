// Verbrauch: merkt sich jeden Claude-Aufruf (Bau oder Chat) mit Kosten-Schätzung, Tokens und Dauer.

const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, 'auftraege')
const FILE = path.join(DIR, 'verbrauch.json')

function readAll () {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return [] }
}

// info = JSON-Ausgabe von "claude -p --output-format json"
function record (entry, info) {
  const u = (info && info.usage) || {}
  const item = {
    zeit: new Date().toISOString(),
    ...entry,
    kosten: Number((info && info.total_cost_usd) || 0),
    tokens: {
      eingabe: (u.input_tokens || 0),
      cacheLesen: (u.cache_read_input_tokens || 0),
      cacheSchreiben: (u.cache_creation_input_tokens || 0),
      ausgabe: (u.output_tokens || 0)
    },
    dauer: Math.round(((info && info.duration_ms) || 0) / 1000),
    schritte: (info && info.num_turns) || 0
  }
  fs.mkdirSync(DIR, { recursive: true })
  const all = readAll()
  all.push(item)
  fs.writeFileSync(FILE, JSON.stringify(all.slice(-2000)))
  return item
}

function summary () {
  const all = readAll()
  const day = (d) => new Date(d).toLocaleDateString('sv') // JJJJ-MM-TT in Ortszeit
  const today = day(Date.now())
  const sum = (list) => list.reduce((a, e) => ({
    kosten: a.kosten + e.kosten,
    tokens: a.tokens + e.tokens.eingabe + e.tokens.cacheLesen + e.tokens.cacheSchreiben + e.tokens.ausgabe,
    anzahl: a.anzahl + 1
  }), { kosten: 0, tokens: 0, anzahl: 0 })
  const heute = all.filter(e => day(e.zeit) === today)
  return {
    gesamt: sum(all),
    heute: sum(heute),
    bauten: sum(all.filter(e => e.art === 'bau')),
    chats: sum(all.filter(e => e.art === 'chat')),
    letzte: all.slice(-40).reverse(),
    bauAuftraege: all.filter(e => e.art === 'bau').slice(-24).reverse()
  }
}

module.exports = { record, summary, readAll }
