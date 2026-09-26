#!/usr/bin/env node
// MCP-Server: gibt Claude (in Claude Code) Werkzeuge, um Minecraft selbst zu spielen.
// stdout gehört dem MCP-Protokoll – alle Logs gehen nach stderr.
console.log = console.error
console.info = console.error
console.warn = console.error
console.debug = console.error

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')
const { Body, UserError } = require('./body')

const body = new Body()

const INSTRUCTIONS = `Du steuerst deinen eigenen Minecraft-Körper. Es gibt keinen Autopiloten: Du entscheidest jeden Schritt selbst.
Ablauf: connect → schauen (Bild + Text) → nachdenken → eine kleine Aktion → Ergebnis anschauen → nächste Aktion.
Im Rundenmodus steht die Welt still, während du nachdenkst; sie läuft nur während deiner Aktionen (1 Tick = 1/20 Sekunde).
Richtungen: Kompass 0°=Norden(-z), 90°=Osten(+x), 180°=Süden(+z), 270°=Westen(-x). Schlagweite 3 Blöcke, Bauweite 4.5 Blöcke.`

const server = new McpServer({ name: 'minecraft', version: '1.0.0' }, { instructions: INSTRUCTIONS })

// Jede Aktion antwortet mit ihrem Ergebnis und danach mit dem, was du jetzt siehst.
function tool (name, description, shape, handler, { observe = true } = {}) {
  server.registerTool(name, { description, inputSchema: shape }, async (args) => {
    try {
      return await body.serial(async () => {
        const result = await handler(args || {})
        // Ein Handler liefert Text oder eine fertige Beobachtung { text, image }.
        const content = [{ type: 'text', text: typeof result === 'string' ? result : result.text }]
        if (result?.image) content.push({ type: 'image', data: result.image.toString('base64'), mimeType: 'image/jpeg' })
        if (observe && body.connected) {
          const view = await body.observe({ screenshot: args?.screenshot !== false })
          content.push({ type: 'text', text: view.text })
          if (view.image) content.push({ type: 'image', data: view.image.toString('base64'), mimeType: 'image/jpeg' })
        }
        return { content }
      })
    } catch (err) {
      const message = err instanceof UserError ? err.message : `${err.message || err}`
      return { isError: true, content: [{ type: 'text', text: '❌ ' + message }] }
    }
  })
}

const screenshot = z.boolean().optional().describe('Bild mitschicken (Standard: ja). false spart Zeit, wenn du nur Text brauchst.')

tool('connect',
  'Betritt einen Minecraft-Server als Spieler. Standard: 127.0.0.1:25565, Name "Claude". Danach bekommst du Bild und Beschreibung deiner Umgebung.',
  {
    host: z.string().optional(),
    port: z.number().int().optional(),
    username: z.string().optional(),
    version: z.string().optional().describe('Minecraft-Version, leer = automatisch erkennen'),
    eyes: z.boolean().optional().describe('Screenshots einschalten (Standard: ja)')
  },
  (a) => body.connect(a))

tool('observe',
  'Umschauen ohne etwas zu tun (kostet keine Spielzeit). Zeigt Bild, Status, Fadenkreuz, Wesen, sichtbare Blöcke, Karte, Ereignisse und Chat.',
  { screenshot, map_radius: z.number().int().min(3).max(12).optional().describe('Größe der Karte (Standard 6)') },
  (a) => body.observe({ screenshot: a.screenshot !== false, mapRadius: a.map_radius || 6 }),
  { observe: false })

tool('turn',
  'Kopf drehen wie mit der Maus (kostet keine Spielzeit). right = Grad nach rechts (negativ = links), up = Grad nach oben (negativ = runter). Oder absolut: compass (0=N, 90=O, 180=S, 270=W) und pitch (-90 = ganz runter, 90 = ganz hoch).',
  {
    right: z.number().optional(),
    up: z.number().optional(),
    compass: z.number().min(0).max(360).optional(),
    pitch: z.number().min(-90).max(90).optional(),
    screenshot
  },
  (a) => body.turn(a))

tool('look_at',
  'Genau auf etwas zielen: target = Nummer eines Wesens aus der letzten Beobachtung, oder x/y/z (ganze Zahlen = Mitte dieses Blocks).',
  { target: z.number().int().optional(), x: z.number().optional(), y: z.number().optional(), z: z.number().optional(), screenshot },
  (a) => body.lookAt(a))

tool('move',
  'Tasten gedrückt halten, wie auf der Tastatur. keys: forward, back, left, right, jump, sprint, sneak (kombinierbar, z. B. ["forward","jump"]). ticks: wie lange (20 = 1 Sekunde, ca. 5 Ticks pro Block beim Gehen, 4 beim Sprinten).',
  { keys: z.array(z.string()).min(1), ticks: z.number().int().min(1).max(100), screenshot },
  (a) => body.move(a))

tool('attack',
  'Linksklick: schlägt das Wesen im Fadenkreuz (nur bis 3 Blöcke). Ziel vorher mit turn/look_at ins Fadenkreuz bringen. Ohne Ziel schlägst du in die Luft.',
  { screenshot },
  () => body.attack())

tool('mine',
  'Linksklick gedrückt halten: baut den Block im Fadenkreuz ab (bis 4.5 Blöcke). Das Item fällt auf den Boden, einsammeln durch Drüberlaufen.',
  { screenshot },
  () => body.mine())

tool('place',
  'Rechtsklick mit dem Block in deiner Hand: setzt ihn an die Seite des Blocks im Fadenkreuz.',
  { screenshot },
  () => body.placeLooking())

tool('jump_place',
  'Säule hochbauen: schaut nach unten, springt und setzt im Sprung den Block aus deiner Hand unter dich. Danach stehst du 1 Block höher (gut für hohe Wände und Dächer).',
  { screenshot },
  () => body.jumpPlace())

tool('build',
  'Bauen nach deinem eigenen Plan: Liste von Blöcken mit genauen Koordinaten (max. 64 pro Aufruf). Jeder Block muss in Bauweite (4.5) sein und einen Nachbarblock zum Dranbauen haben – also Schicht für Schicht von unten bauen und selbst mitlaufen. block: "air" = Block dort abbauen. facing (north/east/south/west) = in welche Richtung du beim Setzen schaust (für Treppen, Türen, Öfen). half: "top"/"bottom" für Treppen und Stufen. Im Kreativmodus kommen fehlende Blöcke von selbst in die Hand, im Überlebensmodus musst du sie haben.',
  {
    blocks: z.array(z.object({
      x: z.number().int(),
      y: z.number().int(),
      z: z.number().int(),
      block: z.string(),
      facing: z.enum(['north', 'east', 'south', 'west']).optional(),
      half: z.enum(['top', 'bottom']).optional()
    })).min(1).max(64),
    screenshot
  },
  (a) => body.build(a))

tool('use',
  'Rechtsklick: Tür/Hebel/Knopf benutzen, Kiste/Ofen öffnen, im Bett schlafen, Tier/Boot benutzen – was im Fadenkreuz ist. Sonst das Item in der Hand benutzen (essen, Bogen spannen: ticks = wie lange halten).',
  { ticks: z.number().int().min(1).max(100).optional(), screenshot },
  (a) => body.use(a))

tool('equip',
  'Item aus dem Inventar in die Hand nehmen oder anziehen. where: hand, off-hand, head, torso, legs, feet.',
  { item: z.string(), where: z.enum(['hand', 'off-hand', 'head', 'torso', 'legs', 'feet']).optional(), screenshot },
  (a) => body.equip(a))

tool('select_slot',
  'Hotbar-Slot 0-8 auswählen (wie die Zahlentasten).',
  { slot: z.number().int().min(0).max(8), screenshot },
  (a) => body.selectSlot(a))

tool('inventory',
  'Inventar anschauen (Hotbar, alle Items, Rüstung).',
  {},
  () => body.inventory(),
  { observe: false })

tool('craft',
  'Etwas herstellen wie mit dem Rezeptbuch. Für 3x3-Rezepte muss eine Werkbank in Reichweite (4.5) sein. count = wie oft.',
  { item: z.string(), count: z.number().int().min(1).max(64).optional(), screenshot },
  (a) => body.craft(a))

tool('container',
  'Mit der geöffneten Kiste oder dem Ofen arbeiten. action: put (reinlegen), take (rausnehmen), close. Beim Ofen: slot input/fuel/output.',
  {
    action: z.enum(['put', 'take', 'close']),
    item: z.string().optional(),
    count: z.number().int().min(1).optional(),
    slot: z.enum(['input', 'fuel', 'output']).optional(),
    screenshot
  },
  (a) => body.container(a))

tool('drop',
  'Items in Blickrichtung werfen (z. B. um Felix etwas zu geben).',
  { item: z.string(), count: z.number().int().min(1).optional(), screenshot },
  (a) => body.drop(a))

tool('chat',
  'Etwas in den Minecraft-Chat schreiben (Felix sieht es im Spiel).',
  { message: z.string() },
  (a) => body.chat(a),
  { observe: false })

tool('wait',
  'Nichts tun und die Welt weiterlaufen lassen (20 Ticks = 1 Sekunde, max. 600).',
  { ticks: z.number().int().min(1).max(600), screenshot },
  (a) => body.wait(a))

tool('set_mode',
  'turn = Rundenmodus (Welt steht still, während du nachdenkst). realtime = Welt läuft immer weiter (z. B. wenn Felix mitspielt und nicht warten will).',
  { mode: z.enum(['turn', 'realtime']) },
  (a) => body.setMode(a.mode),
  { observe: false })

tool('disconnect',
  'Minecraft verlassen. Die Welt läuft danach wieder normal.',
  {},
  () => body.disconnect(),
  { observe: false })

let shuttingDown = false
async function shutdown () {
  if (shuttingDown) return
  shuttingDown = true
  try { await Promise.race([body.disconnect(), new Promise(resolve => setTimeout(resolve, 2000))]) } catch {}
  process.exit(0)
}
process.stdin.on('close', shutdown)
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('uncaughtException', (err) => console.error('uncaughtException:', err))
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err))

server.connect(new StdioServerTransport()).then(() => {
  console.error('Minecraft-MCP-Server bereit.')
})
