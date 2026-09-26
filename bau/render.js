// 3D-Vorschau eines Bauplans: baut ihn in einer Welt im Speicher nach und fotografiert ihn
// mit prismarine-viewer aus mehreren Richtungen. Ergebnis: ein Bild mit 4 Ansichten.

const http = require('http')
const { Server: SocketServer } = require('socket.io')
const { Vec3 } = require('vec3')
const { WorldView } = require('prismarine-viewer/viewer/lib/worldView')
const { viewerApp, launchBrowser } = require('../lib/viewer')
const M = require('./modell')

const World = require('prismarine-world')(M.VERSION)
const Chunk = require('prismarine-chunk')(M.VERSION)

const Y_OFFSET = 64 // der Viewer zeichnet keine negativen y-Werte – also alles nach oben schieben
const SHOT_W = 640
const SHOT_H = 400
const CAMERA_HEIGHT = 1.6

function sleep (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

// Zäune, Scheiben & Mauern in der Vorschau mit Nachbarn verbinden (im Spiel macht das der Server).
function connectShapes (blocks) {
  const map = new Map(blocks.map(b => [`${b.x},${b.y},${b.z}`, b]))
  const family = (name) => /_fence$|_fence_gate$/.test(name) ? 'fence'
    : /pane$|^iron_bars$|glass$/.test(name) ? 'pane'
      : /_wall$/.test(name) ? 'wall' : null
  return blocks.map(b => {
    const state = M.fullState(b.block)
    const fam = family(state.name)
    if (!fam || /_fence_gate$|glass$/.test(state.name)) return { ...b, state }
    for (const [dir, d] of Object.entries({ north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] })) {
      if (!(dir in state.props)) continue
      const n = map.get(`${b.x + d[0]},${b.y},${b.z + d[1]}`)
      const nName = n ? M.blockName(n.block) : null
      const connect = !!nName && (M.isFullSolid(nName) || family(nName) === fam || (fam === 'wall' && family(nName) === 'wall'))
      state.props[dir] = fam === 'wall' ? (connect ? 'low' : 'none') : connect
    }
    return { ...b, state }
  })
}

// Betten zeichnet der Viewer nicht – in der Vorschau als Teppich in Bettfarbe zeigen.
function previewStandIn (state) {
  if (/_bed$/.test(state.name)) {
    const carpet = state.name.replace(/_bed$/, '_carpet')
    return M.registry.blocksByName[carpet] ? { name: carpet, props: {} } : { name: 'red_carpet', props: {} }
  }
  return state
}

async function buildWorld (blocks) {
  const world = new World(() => new Chunk())
  const bb = M.bounds(blocks)
  const margin = 4
  const grass = M.Block.fromProperties('grass_block', { snowy: false }, 1).stateId
  const dirt = M.Block.fromProperties('dirt', {}, 1).stateId
  const occupied = new Set(blocks.map(b => `${b.x},${b.y},${b.z}`))
  const plains = M.registry.biomesByName.plains.id
  for (let x = bb.minX - margin; x <= bb.maxX + margin; x++) {
    for (let z = bb.minZ - margin; z <= bb.maxZ + margin; z++) {
      // Wiese als Landschaft, damit Gras und Blätter grün aussehen
      for (let y = Y_OFFSET + bb.minY - 4; y <= Y_OFFSET + bb.maxY + 4; y += 4) await world.setBiome(new Vec3(x, y, z), plains)
      if (!occupied.has(`${x},-1,${z}`)) await world.setBlockStateId(new Vec3(x, Y_OFFSET - 1, z), grass)
      for (let y = Math.min(bb.minY, -1) - 1; y >= Math.min(bb.minY, -1) - 2; y--) {
        if (!occupied.has(`${x},${y},${z}`)) await world.setBlockStateId(new Vec3(x, Y_OFFSET + y, z), dirt)
      }
    }
  }
  for (const b of connectShapes(blocks)) {
    const st = previewStandIn(b.state)
    let id
    try {
      id = M.Block.fromProperties(st.name, st.props, 1).stateId
    } catch {
      id = M.Block.fromProperties(st.name, {}, 1).stateId
    }
    await world.setBlockStateId(new Vec3(b.x, b.y + Y_OFFSET, b.z), id)
  }
  return world
}

// Kamerapositionen rund um den Bau. yaw wie bei mineflayer: 0 = Blick nach Norden.
function cameraViews (bb) {
  const center = new Vec3((bb.minX + bb.maxX + 1) / 2, (bb.minY + bb.maxY + 1) / 2 + Y_OFFSET, (bb.minZ + bb.maxZ + 1) / 2)
  const size = Math.max(bb.maxX - bb.minX + 1, bb.maxZ - bb.minZ + 1, bb.maxY - bb.minY + 1)
  const dist = size * 0.95 + 4
  const views = []
  // Standort der Kamera als Himmelsrichtung vom Bau aus (Süden = vorne, da steht der Spieler)
  const spots = [
    { label: 'vorne links (Südwest)', dx: -1, dz: 1 },
    { label: 'vorne rechts (Südost)', dx: 1, dz: 1 },
    { label: 'hinten (Nordost)', dx: 1, dz: -1 }
  ]
  for (const s of spots) {
    const flat = dist * Math.cos(Math.PI / 7)
    const cam = center.offset(s.dx * flat / Math.SQRT2, dist * Math.sin(Math.PI / 7), s.dz * flat / Math.SQRT2)
    views.push({ label: s.label, cam, target: center })
  }
  const topH = size * 1.1 + 4
  views.push({ label: 'von oben (Norden oben)', cam: center.offset(0, topH, 0.01), target: center, top: true })
  return views
}

function lookAngles (cam, target) {
  const d = target.minus(cam)
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) }
}

class Renderer {
  constructor () {
    this.browser = null
    this.page = null
    this.io = null
    this.httpServer = null
    this.port = null
    this.scene = null
  }

  async start () {
    if (this.page) return
    this.httpServer = http.createServer(viewerApp())
    this.io = new SocketServer(this.httpServer)
    this.io.on('connection', (socket) => {
      const scene = this.scene
      if (!scene) return
      socket.emit('version', M.VERSION)
      const view = new WorldView(scene.world, scene.viewDistance, scene.center, socket)
      view.init(scene.center)
    })
    await new Promise((resolve, reject) => {
      this.httpServer.once('error', reject)
      this.httpServer.listen(0, '127.0.0.1', () => { this.port = this.httpServer.address().port; resolve() })
    })
    this.browser = await launchBrowser()
    this.page = await this.browser.newPage({ viewport: { width: SHOT_W, height: SHOT_H } })
  }

  // Liefert ein JPEG mit vier Ansichten (2×2).
  async render (blocks, title = '') {
    await this.start()
    const bb = M.bounds(blocks)
    const world = await buildWorld(blocks)
    const size = Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ, bb.maxY - bb.minY) + 10
    const center = new Vec3((bb.minX + bb.maxX) / 2, Y_OFFSET, (bb.minZ + bb.maxZ) / 2)
    this.scene = { world, center, viewDistance: Math.min(6, Math.ceil(size / 32) + 1) }
    await this.page.goto(`http://127.0.0.1:${this.port}/`)
    await this.page.waitForSelector('canvas', { timeout: 15000 })
    const views = cameraViews(bb)
    // Warten, bis alle Chunks gezeichnet sind: so lange, bis sich das Bild nicht mehr ändert.
    await this.showView(views[0])
    await this.waitUntilStill(30000)
    const shots = []
    for (const v of views) {
      await this.showView(v)
      await this.waitUntilStill(4000)
      const img = await this.page.screenshot({ type: 'jpeg', quality: 80 })
      shots.push({ label: v.label, data: img.toString('base64') })
    }
    // Zusammensetzen
    const grid = await this.browser.newPage({ viewport: { width: SHOT_W * 2, height: SHOT_H * 2 + 28 } })
    try {
      await grid.setContent(`<html><body style="margin:0;background:#222;font:bold 15px sans-serif;color:#fff">
        <div style="height:28px;line-height:28px;padding:0 8px">${escapeHtml(title)}</div>
        <div style="display:grid;grid-template-columns:${SHOT_W}px ${SHOT_W}px">
        ${shots.map(s => `<div style="position:relative;width:${SHOT_W}px;height:${SHOT_H}px">
          <img src="data:image/jpeg;base64,${s.data}" style="display:block">
          <div style="position:absolute;left:6px;top:6px;background:rgba(0,0,0,.6);padding:2px 6px;border-radius:3px">${escapeHtml(s.label)}</div>
        </div>`).join('')}
        </div></body></html>`)
      return await grid.screenshot({ type: 'jpeg', quality: 80 })
    } finally {
      await grid.close()
    }
  }

  async showView (v) {
    const { yaw, pitch } = lookAngles(v.cam, v.target)
    const pos = v.cam.offset(0, -CAMERA_HEIGHT, 0)
    this.io.emit('position', { pos, yaw: v.top ? 0 : yaw, pitch: v.top ? -Math.PI / 2 + 0.0001 : pitch, addMesh: false })
    await sleep(250)
  }

  async waitUntilStill (maxMs) {
    const end = Date.now() + maxMs
    let last = null
    let same = 0
    while (Date.now() < end) {
      await sleep(400)
      const shot = await this.page.screenshot({ type: 'jpeg', quality: 40 })
      if (last && shot.equals(last)) {
        if (++same >= 2) return
      } else {
        same = 0
      }
      last = shot
    }
  }

  async stop () {
    try { if (this.browser) await this.browser.close() } catch {}
    try { if (this.io) this.io.close() } catch {}
    try { if (this.httpServer) this.httpServer.close() } catch {}
    this.page = null
    this.browser = null
  }
}

function escapeHtml (s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

module.exports = { Renderer }
