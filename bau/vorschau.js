#!/usr/bin/env node
// Vorschau eines Bauplans auf der Kommandozeile:
//   node bau/vorschau.js bau/beispiele/haus.js [bild.jpg]
const fs = require('fs')
const path = require('path')
const M = require('./modell')
const { Renderer } = require('./render')

async function main () {
  const file = process.argv[2]
  if (!file) { console.error('Benutzung: node bau/vorschau.js <bauplan.js> [bild.jpg]'); process.exit(1) }
  const out = process.argv[3] || file.replace(/\.js$/, '') + '-vorschau.jpg'
  const { blocks, notes } = M.runPlan(fs.readFileSync(file, 'utf8'))
  console.log(M.describe(blocks))
  const warnings = [...notes, ...M.check(blocks)]
  console.log('\nPrüfung: ' + (warnings.length ? '\n  ⚠ ' + warnings.join('\n  ⚠ ') : 'alles in Ordnung ✅'))
  const r = new Renderer()
  try {
    const img = await r.render(blocks, path.basename(file))
    fs.writeFileSync(out, img)
    console.log('\nBild gespeichert: ' + out)
  } finally {
    await r.stop()
  }
}
main().catch(err => { console.error('❌ ' + err.message); process.exit(1) })
