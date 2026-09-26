// Baumeister-Zentrale: eine kleine Webseite (nur auf diesem PC) für Einstellungen, Verbrauch, Bauten und Chat.

const path = require('path')
const express = require('express')
const settings = require('./einstellungen')
const verbrauch = require('./verbrauch')

const DIR = path.join(__dirname, 'auftraege')

function startZentrale (bruecke, port = Number(process.env.ZENTRALE_PORT) || 3008) {
  const app = express()
  app.use(express.json())
  app.use('/', express.static(path.join(__dirname, 'zentrale')))

  app.get('/api/zustand', (req, res) => {
    res.json({
      einstellungen: settings.load(),
      optionen: { modelle: settings.MODELLE, efforts: settings.EFFORTS, chatModi: settings.CHAT_MODI },
      bruecke: bruecke.status(),
      verbrauch: verbrauch.summary()
    })
  })
  app.post('/api/einstellungen', (req, res) => res.json(settings.save(req.body)))
  app.post('/api/stopp', (req, res) => { bruecke.stop(); res.json({ ok: true }) })
  app.post('/api/weg', async (req, res) => { await bruecke.removeLast(); res.json({ ok: true }) })
  // Vorschau-Bilder der Aufträge
  app.get('/bild/:id/:file', (req, res) => {
    const { id, file } = req.params
    if (!/^[\w-]+$/.test(id) || !/^vorschau-\d+\.jpg$/.test(file)) return res.status(404).end()
    res.sendFile(path.join(DIR, id, file), (err) => { if (err) res.status(404).end() })
  })

  return new Promise((resolve) => {
    let tries = 0
    const listen = (p) => {
      const server = app.listen(p, '127.0.0.1', () => resolve(p))
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && tries++ < 10) listen(p + 1)
        else { console.error('Zentrale konnte nicht starten:', err.message); resolve(null) }
      })
    }
    listen(port)
  })
}

module.exports = { startZentrale }
