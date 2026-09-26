#!/usr/bin/env node
// MCP-Server für Claude den Baumeister: Vorschau eines Bauplans ansehen und den Bauplan abgeben.
// Wird von bau/auftrag.js für jeden Bauauftrag gestartet (Ordner des Auftrags in BAU_JOB_DIR).
console.log = console.error
console.info = console.error
console.warn = console.error

const fs = require('fs')
const path = require('path')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')
const M = require('./modell')
const { Renderer } = require('./render')

const ROOT = path.resolve(__dirname, '..')
const JOB_DIR = process.env.BAU_JOB_DIR || path.join(ROOT, 'bau', 'auftraege', 'test')
fs.mkdirSync(JOB_DIR, { recursive: true })

const renderer = new Renderer()
let previews = 0

function status (text) {
  try { fs.appendFileSync(path.join(JOB_DIR, 'status.log'), text + '\n') } catch {}
}

// Nur Baupläne im Ordner bau/ sind erlaubt.
function planPath (datei) {
  const full = path.resolve(ROOT, datei)
  if (!full.startsWith(path.join(ROOT, 'bau') + path.sep) || !full.endsWith('.js')) {
    throw new M.BauFehler(`"${datei}" muss eine .js-Datei im Ordner bau/ sein (z. B. bau/bauten/haus.js).`)
  }
  if (!fs.existsSync(full)) throw new M.BauFehler(`Die Datei ${datei} gibt es nicht. Schreib sie zuerst mit dem Write-Werkzeug.`)
  return full
}

function load (datei) {
  const full = planPath(datei)
  const { blocks, log, notes } = M.runPlan(fs.readFileSync(full, 'utf8'))
  return { full, blocks, log, notes }
}

const server = new McpServer({ name: 'baumeister', version: '1.0.0' })

server.registerTool('vorschau', {
  description: 'Zeigt deinen Bauplan: 3D-Bild aus 4 Richtungen (vorne links, vorne rechts, hinten, von oben), jede Schicht als Zeichenraster, Material-Liste und eine automatische Fehlerprüfung. Benutze das nach jedem Schreiben/Ändern des Bauplans.',
  inputSchema: { datei: z.string().describe('Pfad zum Bauplan, z. B. bau/bauten/123-haus.js') }
}, async ({ datei }) => {
  try {
    const { blocks, log, notes } = load(datei)
    previews++
    status(`👀 Claude schaut sich die Vorschau an (${previews}. Runde, ${blocks.length} Blöcke)…`)
    const warnings = [...notes, ...M.check(blocks)]
    const text = [
      M.describe(blocks),
      '',
      warnings.length ? 'Automatische Prüfung – bitte beheben:\n  ⚠ ' + warnings.join('\n  ⚠ ') : 'Automatische Prüfung: keine Probleme gefunden ✅',
      log.length ? '\nconsole.log:\n  ' + log.join('\n  ') : '',
      '\nHinweis: Betten sieht man im Bild nur als Teppich. Schau dir das Bild genau an: Stimmen Dach, Türen, Fenster, Symmetrie? Sieht es schön aus?'
    ].join('\n')
    const content = [{ type: 'text', text }]
    try {
      const img = await renderer.render(blocks, path.basename(datei))
      fs.writeFileSync(path.join(JOB_DIR, `vorschau-${previews}.jpg`), img)
      content.push({ type: 'image', data: img.toString('base64'), mimeType: 'image/jpeg' })
    } catch (err) {
      content.push({ type: 'text', text: '(Kein 3D-Bild möglich: ' + String(err.message).split('\n')[0] + ' – nutze die Schichtbilder.)' })
    }
    return { content }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: '❌ ' + err.message }] }
  }
})

server.registerTool('fertig', {
  description: 'Gibt den fertigen Bauplan ab – danach wird er in Minecraft gebaut. modus: "neu" (neuer Bau vor dem Spieler), "ändern" (ersetzt den letzten Bau an derselben Stelle) oder "nichts" (nichts bauen, nur antworten). nachricht: kurzer Satz an den Spieler im Chat (Deutsch, max. 120 Zeichen).',
  inputSchema: {
    datei: z.string().optional(),
    modus: z.enum(['neu', 'ändern', 'nichts']),
    name: z.string().max(40).optional().describe('kurzer Name des Baus, z. B. "Fachwerkhaus"'),
    nachricht: z.string().max(200)
  }
}, async ({ datei, modus, name, nachricht }) => {
  try {
    let blocks = 0
    if (modus !== 'nichts') {
      if (!datei) throw new M.BauFehler('Gib die Datei des Bauplans an.')
      blocks = load(datei).blocks.length
    }
    const result = { datei: datei ? path.relative(ROOT, planPath(datei)).split(path.sep).join('/') : null, modus, name: name || 'Bau', nachricht, blocks }
    fs.writeFileSync(path.join(JOB_DIR, 'ergebnis.json'), JSON.stringify(result, null, 2))
    status(modus === 'nichts' ? '💬 Claude ist fertig.' : `✔ Bauplan fertig (${blocks} Blöcke) – jetzt wird gebaut!`)
    return { content: [{ type: 'text', text: 'Abgegeben. Du bist fertig – beende jetzt deine Antwort ohne weitere Werkzeuge.' }] }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: '❌ ' + err.message }] }
  }
})

async function shutdown () {
  await renderer.stop()
  process.exit(0)
}
process.stdin.on('close', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

server.connect(new StdioServerTransport()).then(() => console.error('Baumeister-MCP bereit.'))
