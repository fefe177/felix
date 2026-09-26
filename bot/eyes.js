// Augen: eine 3D-Ansicht der Welt (prismarine-viewer) im Browser, aus der Screenshots gemacht werden.
// Die gleiche Ansicht kann man selbst unter http://localhost:<port> anschauen.

const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const express = require('express')
const { Server: SocketServer } = require('socket.io')
const { WorldView } = require('prismarine-viewer/viewer/lib/worldView')

const WIDTH = 768
const HEIGHT = 432
const FOV = 75 // wie die Kamera von prismarine-viewer (vertikal, Grad)
const CAMERA_HEIGHT = 1.6

function sleep (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

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
  throw new Error('Kein Browser für die Augen gefunden. Installiere Chrome oder Edge, oder führe "npx playwright install chromium" aus.\n' + errors.join('\n'))
}

// Rechnet eine Weltposition in Bildkoordinaten um (gleiche Kamera wie im Viewer).
function project (bot, point) {
  const cam = bot.entity.position.offset(0, CAMERA_HEIGHT, 0)
  const dx = point.x - cam.x
  const dy = point.y - cam.y
  const dz = point.z - cam.z
  const yaw = bot.entity.yaw
  const pitch = bot.entity.pitch
  const x1 = dx * Math.cos(yaw) - dz * Math.sin(yaw)
  const z1 = dx * Math.sin(yaw) + dz * Math.cos(yaw)
  const y2 = dy * Math.cos(pitch) + z1 * Math.sin(pitch)
  const z2 = -dy * Math.sin(pitch) + z1 * Math.cos(pitch)
  if (z2 >= -0.1) return null
  const f = 1 / Math.tan((FOV / 2) * Math.PI / 180)
  const aspect = WIDTH / HEIGHT
  const nx = (x1 / -z2) * f / aspect
  const ny = (y2 / -z2) * f
  if (Math.abs(nx) > 1.05 || Math.abs(ny) > 1.05) return null
  return { x: (nx + 1) / 2 * WIDTH, y: (1 - ny) / 2 * HEIGHT }
}

class Eyes {
  constructor (bot) {
    this.bot = bot
    this.port = null
    this.httpServer = null
    this.io = null
    this.browser = null
    this.page = null
    this.lastShotPos = null
    this.refreshers = new Set()
  }

  async start (preferredPort = Number(process.env.MC_VIEWER_PORT) || 3007) {
    await this.startViewer(preferredPort)
    this.browser = await launchBrowser()
    this.page = await this.browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
    await this.page.goto(`http://localhost:${this.port}/`)
    await this.page.waitForSelector('canvas', { timeout: 15000 })
    await this.page.evaluate(({ w, h }) => {
      const style = document.createElement('style')
      style.textContent = `
        #claude-cross { position: fixed; left: ${w / 2 - 10}px; top: ${h / 2 - 10}px; width: 20px; height: 20px; pointer-events: none; z-index: 10; }
        #claude-cross:before, #claude-cross:after { content: ''; position: absolute; background: rgba(255,255,255,.9); box-shadow: 0 0 2px #000; }
        #claude-cross:before { left: 9px; top: 0; width: 2px; height: 20px; }
        #claude-cross:after { left: 0; top: 9px; width: 20px; height: 2px; }
        .claude-label { position: fixed; transform: translate(-50%, -100%); font: bold 13px monospace; color: #fff;
          background: rgba(0,0,0,.6); padding: 1px 4px; border-radius: 3px; white-space: nowrap; pointer-events: none; z-index: 11; }
        .claude-label.hostile { background: rgba(170,0,0,.75); }
        #claude-hud { position: fixed; left: 6px; top: 6px; font: bold 13px monospace; color: #fff; background: rgba(0,0,0,.5);
          padding: 2px 6px; border-radius: 3px; z-index: 11; }`
      document.head.appendChild(style)
      const cross = document.createElement('div')
      cross.id = 'claude-cross'
      document.body.appendChild(cross)
      const hud = document.createElement('div')
      hud.id = 'claude-hud'
      document.body.appendChild(hud)
      const labels = document.createElement('div')
      labels.id = 'claude-labels'
      document.body.appendChild(labels)
    }, { w: WIDTH, h: HEIGHT })
    await sleep(2500) // erste Chunks aufbauen lassen
  }

  startViewer (port) {
    const bot = this.bot
    const app = express()
    const publicDir = path.join(path.dirname(require.resolve('prismarine-viewer/package.json')), 'public')
    app.use('/', express.static(publicDir))
    const httpServer = http.createServer(app)
    const io = new SocketServer(httpServer)
    io.on('connection', (socket) => {
      socket.emit('version', bot.version)
      const worldView = new WorldView(bot.world, 5, bot.entity.position, socket)
      worldView.init(bot.entity.position)
      const sendPosition = () => {
        socket.emit('position', { pos: bot.entity.position, yaw: bot.entity.yaw, pitch: bot.entity.pitch, addMesh: false })
        worldView.updatePosition(bot.entity.position)
      }
      sendPosition()
      bot.on('move', sendPosition)
      this.refreshers.add(sendPosition)
      worldView.listenToBot(bot)
      socket.on('disconnect', () => {
        bot.removeListener('move', sendPosition)
        this.refreshers.delete(sendPosition)
        worldView.removeListenersFromBot(bot)
      })
    })
    return new Promise((resolve, reject) => {
      let tries = 0
      const tryListen = (p) => {
        httpServer.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && tries++ < 10) tryListen(p + 1)
          else reject(err)
        })
        httpServer.listen(p, () => {
          this.port = p
          this.httpServer = httpServer
          this.io = io
          resolve(p)
        })
      }
      tryListen(port)
    })
  }

  // entities: Liste aus senses.listEntities (mit Nummern)
  async screenshot (entities, hud) {
    if (!this.page) return null
    const pos = this.bot.entity.position
    // Nach großen Ortswechseln brauchen neue Chunks etwas Zeit zum Aufbauen.
    const jumped = !this.lastShotPos || this.lastShotPos.distanceTo(pos) > 8
    this.lastShotPos = pos.clone()
    for (const refresh of this.refreshers) refresh() // Kamera auf den neuesten Stand bringen
    await sleep(jumped ? 1500 : 350)
    const labels = []
    for (const x of entities) {
      const top = x.e.position.offset(0, (x.e.height || 0.5) + 0.35, 0)
      const s = project(this.bot, top)
      if (s) labels.push({ x: s.x, y: s.y, text: `${x.n} ${x.label}`, hostile: x.hostile })
    }
    await this.page.evaluate(({ labels, hud }) => {
      const box = document.getElementById('claude-labels')
      box.innerHTML = ''
      for (const l of labels) {
        const d = document.createElement('div')
        d.className = 'claude-label' + (l.hostile ? ' hostile' : '')
        d.style.left = l.x + 'px'
        d.style.top = l.y + 'px'
        d.textContent = l.text
        box.appendChild(d)
      }
      document.getElementById('claude-hud').textContent = hud
    }, { labels, hud })
    return this.page.screenshot({ type: 'jpeg', quality: 70 })
  }

  async stop () {
    try { if (this.browser) await this.browser.close() } catch {}
    try { if (this.io) this.io.close() } catch {}
    try { if (this.httpServer) this.httpServer.close() } catch {}
    this.page = null
    this.browser = null
  }
}

module.exports = { Eyes, project }
