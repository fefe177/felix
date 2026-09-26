#!/usr/bin/env node
// Startet einen eigenen kleinen Minecraft-Server (Java Edition) auf diesem PC.
// Beim ersten Mal wird der offizielle Server von Mojang heruntergeladen.
//
//   npm run server                 normal starten
//   npm run server -- --op Name    Spieler "Name" zum Operator machen (darf Befehle benutzen)

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const readline = require('readline')
const { spawn, spawnSync } = require('child_process')

const VERSION = process.env.MC_VERSION || '1.21.4'
const DIR = path.join(__dirname, 'welt')
const JAR = path.join(DIR, `minecraft_server.${VERSION}.jar`)
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const BOT_NAME = process.env.MC_USERNAME || 'Claude'

const args = process.argv.slice(2)
const argValue = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function ask (question) {
  if (!process.stdin.isTTY) return Promise.resolve('')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()) }))
}

function fail (message) {
  console.error('\n❌ ' + message + '\n')
  process.exit(1)
}

// UUID, die ein Server im Offline-Modus einem Spielernamen gibt.
function offlineUuid (name) {
  const md5 = crypto.createHash('md5').update('OfflinePlayer:' + name).digest()
  md5[6] = (md5[6] & 0x0f) | 0x30
  md5[8] = (md5[8] & 0x3f) | 0x80
  const h = md5.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function javaMajor (javaCmd) {
  const res = spawnSync(javaCmd, ['-version'], { encoding: 'utf8' })
  if (res.error) return null
  const m = /version "(\d+)(?:\.(\d+))?/.exec(`${res.stderr}${res.stdout}`)
  if (!m) return null
  const major = Number(m[1])
  return major === 1 ? Number(m[2]) : major
}

function findJava (needed) {
  const candidates = []
  if (process.env.JAVA) candidates.push(process.env.JAVA)
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))
  candidates.push('java')
  const found = []
  for (const cmd of candidates) {
    const major = javaMajor(cmd)
    if (major === null) continue
    if (major >= needed) return cmd
    found.push(`${cmd} (Java ${major})`)
  }
  fail(`Ich brauche Java ${needed} oder neuer${found.length ? `, gefunden habe ich nur: ${found.join(', ')}` : ', aber ich finde gar kein Java'}.\n` +
    '   So bekommst du es:\n' +
    `   • Windows:  winget install EclipseAdoptium.Temurin.${needed}.JRE\n` +
    `   • macOS:    brew install --cask temurin@${needed}\n` +
    '   • oder von https://adoptium.net herunterladen und installieren.\n' +
    '   Danach dieses Fenster schließen, ein neues öffnen und nochmal "npm run server" eingeben.')
}

async function getJson (url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

async function versionInfo () {
  const cache = path.join(DIR, `version-${VERSION}.json`)
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'))
  const manifest = await getJson(MANIFEST)
  const entry = manifest.versions.find(v => v.id === VERSION)
  if (!entry) fail(`Die Minecraft-Version ${VERSION} gibt es nicht.`)
  const info = await getJson(entry.url)
  fs.writeFileSync(cache, JSON.stringify(info))
  return info
}

async function downloadServer (info) {
  if (fs.existsSync(JAR)) return
  const server = info.downloads?.server
  if (!server) fail(`Für ${VERSION} gibt es keinen Server zum Herunterladen.`)
  console.log(`⬇  Lade den offiziellen Minecraft-Server ${VERSION} herunter (${Math.round(server.size / 1e6)} MB)…`)
  const res = await fetch(server.url)
  if (!res.ok) fail(`Download fehlgeschlagen (HTTP ${res.status}).`)
  const data = Buffer.from(await res.arrayBuffer())
  const sha1 = crypto.createHash('sha1').update(data).digest('hex')
  if (sha1 !== server.sha1) fail('Die heruntergeladene Datei ist kaputt (Prüfsumme stimmt nicht). Nochmal versuchen.')
  fs.writeFileSync(JAR, data)
  console.log('✅ Fertig heruntergeladen.')
}

async function acceptEula () {
  const file = path.join(DIR, 'eula.txt')
  if (fs.existsSync(file) && /eula\s*=\s*true/i.test(fs.readFileSync(file, 'utf8'))) return
  let ok = args.includes('--eula')
  if (!ok) {
    console.log('\n📜 Für den Minecraft-Server musst du den Nutzungsbedingungen (EULA) von Mojang zustimmen:')
    console.log('   https://aka.ms/MinecraftEULA  (bist du noch nicht volljährig, frag deine Eltern)')
    const answer = await ask('   Stimmst du zu? (ja/nein) ')
    ok = /^(j|ja|y|yes)$/i.test(answer)
  }
  if (!ok) fail('Ohne Zustimmung zur EULA startet der Server nicht. (Nicht interaktiv? Dann "npm run server -- --eula".)')
  fs.writeFileSync(file, `# https://aka.ms/MinecraftEULA\n# zugestimmt am ${new Date().toISOString()}\neula=true\n`)
}

function writeProperties () {
  const file = path.join(DIR, 'server.properties')
  if (fs.existsSync(file)) return
  fs.writeFileSync(file, [
    '# Von server/start.js angelegt. Du kannst hier alles ändern.',
    'motd=Claude spielt Minecraft',
    '# Nur auf diesem PC erreichbar. Für andere PCs im Heimnetz: server-ip= leer lassen.',
    'server-ip=127.0.0.1',
    'server-port=25565',
    '# Offline-Modus, damit Claude ohne eigenes Minecraft-Konto mitspielen kann.',
    'online-mode=false',
    'enforce-secure-profile=false',
    'gamemode=survival',
    'difficulty=normal',
    'spawn-protection=0',
    'allow-flight=true',
    'max-players=5',
    'view-distance=10',
    'simulation-distance=8',
    'level-name=world',
    ''
  ].join('\n'))
}

async function writeOps () {
  const file = path.join(DIR, 'ops.json')
  let ops = []
  const firstTime = !fs.existsSync(file)
  if (!firstTime) {
    try { ops = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { ops = [] }
  }
  const names = [BOT_NAME]
  const extra = argValue('--op')
  if (extra) names.push(extra)
  else if (firstTime) {
    const answer = await ask('\n🙂 Wie heißt du in Minecraft? (dann darfst du auch Befehle benutzen – Enter = überspringen) ')
    if (/^[A-Za-z0-9_]{3,16}$/.test(answer)) names.push(answer)
  }
  for (const name of names) {
    if (ops.some(o => o.name.toLowerCase() === name.toLowerCase())) continue
    ops.push({ uuid: offlineUuid(name), name, level: 4, bypassesPlayerLimit: false })
    console.log(`👑 ${name} ist jetzt Operator.`)
  }
  fs.writeFileSync(file, JSON.stringify(ops, null, 2))
}

function openBrowser (url) {
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true, windowsHide: true }).unref()
    else if (process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
  } catch {}
}

async function main () {
  fs.mkdirSync(DIR, { recursive: true })
  let info
  try {
    info = await versionInfo()
  } catch (err) {
    fail('Ich komme nicht an die Server-Infos von Mojang. Bist du mit dem Internet verbunden?\n   ' + err.message)
  }
  const java = findJava(info.javaVersion?.majorVersion || 21)
  await downloadServer(info)
  await acceptEula()
  writeProperties()
  await writeOps()

  const ram = process.env.MC_RAM || '2G'
  console.log(`\n🚀 Starte Minecraft-Server ${VERSION}…`)
  console.log('   In Minecraft: Mehrspieler → Direktverbindung → localhost')
  console.log('   Hier kannst du Server-Befehle eintippen (z. B. "op Name"). Beenden mit "stop".\n')
  const child = spawn(java, [`-Xms1G`, `-Xmx${ram}`, '-jar', JAR, 'nogui'], { cwd: DIR, stdio: ['pipe', 'pipe', 'inherit'] })
  const send = (command) => { if (child.stdin.writable) child.stdin.write(command + '\n') }

  // Claude der Baumeister hört im Chat mit ("bau …"). Mit --ohne-claude abschalten.
  let bruecke = null
  if (!args.includes('--ohne-claude')) {
    const { Bruecke } = require('../bau/bruecke')
    const { startZentrale } = require('../bau/zentrale')
    bruecke = new Bruecke(send)
    console.log('🧱 Claude der Baumeister hört im Chat mit. Schreib im Spiel z. B. „bau ein Haus“ oder einfach „Hallo Claude“.')
    startZentrale(bruecke).then((port) => {
      if (!port) return
      const url = `http://localhost:${port}`
      console.log(`🖥  Baumeister-Zentrale (Einstellungen, Verbrauch, Bauten, Chat): ${url}\n`)
      if (!args.includes('--ohne-browser')) openBrowser(url)
    })
  }
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let hide = false
    if (bruecke) {
      try { hide = bruecke.onLine(line) } catch (err) { console.error('Baumeister-Fehler:', err.message) }
    }
    if (!hide) console.log(line)
  })
  // Was du hier eintippst, geht weiter an den Server.
  readline.createInterface({ input: process.stdin }).on('line', (line) => send(line))
  // Strg+C geht auch an den Server, der dann ordentlich speichert – wir warten auf ihn.
  process.on('SIGINT', () => send('stop'))
  child.on('exit', (code) => process.exit(code || 0))
}

if (require.main === module) main()

module.exports = { offlineUuid, javaMajor }
