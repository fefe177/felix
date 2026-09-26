// Gemeinsame Teile für die 3D-Ansicht (prismarine-viewer) und den unsichtbaren Browser,
// der davon Bilder macht. Benutzt von den Bot-Augen (bot/eyes.js) und der Bau-Vorschau (bau/render.js).

const fs = require('fs')
const os = require('os')
const path = require('path')
const express = require('express')

const PUBLIC_DIR = path.join(path.dirname(require.resolve('prismarine-viewer/package.json')), 'public')

// prismarine-viewer überspringt jeden Block, dessen Name "air" enthält – also auch "st-air-s" (Treppen).
// Wir liefern den Worker mit einer richtigen Luft-Prüfung aus.
let patchedWorker = null
function workerSource () {
  if (!patchedWorker) {
    const src = fs.readFileSync(path.join(PUBLIC_DIR, 'worker.js'), 'utf8')
    patchedWorker = src.replace(/(\w+)\.name\.includes\("air"\)/g, '/(^|_)air$/.test($1.name)')
  }
  return patchedWorker
}

function viewerApp () {
  const app = express()
  app.get('/worker.js', (req, res) => res.type('application/javascript').send(workerSource()))
  app.use('/', express.static(PUBLIC_DIR))
  return app
}

function browserCandidates () {
  const list = []
  if (process.env.MC_BROWSER_PATH) list.push({ executablePath: process.env.MC_BROWSER_PATH })
  list.push({})
  list.push({ channel: 'chrome' }, { channel: 'msedge' })
  const home = os.homedir()
  const dirs = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(home, '.cache', 'ms-playwright'),
    path.join(home, 'Library', 'Caches', 'ms-playwright'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright')
  ].filter(Boolean)
  const exes = [
    'chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium'
  ]
  for (const dir of dirs) {
    let entries = []
    try { entries = fs.readdirSync(dir) } catch { continue }
    for (const entry of entries.filter(e => /^chromium-\d+$/.test(e)).sort().reverse()) {
      for (const exe of exes) {
        const p = path.join(dir, entry, exe)
        if (fs.existsSync(p)) list.push({ executablePath: p })
      }
    }
  }
  return list
}

async function launchBrowser () {
  const { chromium } = require('playwright-core')
  const args = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio']
  const errors = []
  for (const candidate of browserCandidates()) {
    try {
      return await chromium.launch({ headless: true, args, ...candidate })
    } catch (err) {
      errors.push(String(err.message).split('\n')[0])
    }
  }
  throw new Error('Kein Browser für die 3D-Bilder gefunden. Installiere Chrome oder Edge, oder führe "npm run augen" aus.\n' + errors.join('\n'))
}

module.exports = { viewerApp, launchBrowser, PUBLIC_DIR }
