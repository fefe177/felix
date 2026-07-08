# 🎬 Makro Recorder

Eine Desktop-App, mit der du **Maus- und Tastatureingaben aufnehmen und
wieder abspielen** kannst – ein klassischer Makro-Recorder für sich
wiederholende Aufgaben.

Die App zeichnet Klicks, Mausbewegungen, Scrollen und Tastendrücke inklusive
Timing auf, speichert sie als JSON-Datei und spielt sie beliebig oft wieder ab.

## Funktionen

- ⌨️ **Tastatur** aufnehmen und abspielen (Tastendruck & Loslassen)
- 🖱️ **Maus** aufnehmen: Klicks, Bewegungen und Scrollen
- ⏱️ Original-**Timing** wird beibehalten
- 🔁 **Wiederholungen** einstellbar (auch endlos)
- ⏸️ **Pause zwischen den Durchläufen** einstellbar
- ⚡ **Geschwindigkeit** von 0,25× bis 4× regelbar
- ⏳ **Countdown** vor der Wiedergabe (Zeit zum Fensterwechsel)
- ⌨️ **Globale Hotkeys** – funktionieren auch in anderen Programmen:
  - **F9** – Aufnahme starten/stoppen
  - **F10** – Wiedergabe starten/stoppen
  - **ESC** – alles sofort stoppen
- 💾 Makros als **JSON speichern und laden**
- 🍎 Cleanes **Apple-Design** (helle Oberfläche, Systemfarben)

## Installation

Voraussetzung: **Python 3.8+**

```bash
pip install -r requirements.txt
```

> `tkinter` gehört zur Python-Standardbibliothek. Unter Linux muss es
> eventuell separat installiert werden:
> `sudo apt install python3-tk`

## Starten

```bash
python run.py
```

oder

```bash
python -m macro_app
```

## Bedienung

1. **Aufnehmen** klicken (oder **F9**) → alle Maus-/Tastatureingaben werden
   mitgeschnitten.
2. Aufnahme mit **F9**, der **ESC-Taste** oder **Stopp** beenden.
3. Ggf. **Wiederholungen**, **Pause**, **Geschwindigkeit** und **Countdown**
   einstellen.
4. **Abspielen** klicken (oder **F10**) → das Makro wird ausgeführt.
5. Wiedergabe jederzeit mit **ESC** oder **F10** abbrechen.
6. Über **Speichern/Laden** Makros als Datei sichern und erneut verwenden.

> Die Hotkeys **F9 / F10 / ESC** wirken systemweit – du kannst also ein
> anderes Programm im Vordergrund haben und trotzdem Aufnahme/Wiedergabe
> starten.

## Wichtige Hinweise zu Berechtigungen

Damit eine App systemweit Eingaben lesen und erzeugen darf, sind je nach
Betriebssystem zusätzliche Rechte nötig:

- **Windows:** funktioniert direkt. Für Makros in Programmen, die als
  Administrator laufen, muss auch die App als Administrator gestartet werden.
- **macOS:** unter *Systemeinstellungen → Datenschutz & Sicherheit* die
  Rechte **Bedienungshilfen** und **Eingabeüberwachung** für das Terminal
  bzw. Python freigeben.
- **Linux:** funktioniert unter **X11** direkt. Unter **Wayland** ist das
  globale Mitschneiden/Steuern eingeschränkt – am zuverlässigsten läuft die
  App in einer X11-Sitzung.

## Projektstruktur

```
macro_app/
├── events.py     # Serialisierung der Ereignisse (JSON-tauglich)
├── recorder.py   # Aufnahme von Maus & Tastatur
├── player.py     # Wiedergabe der Makros
├── storage.py    # Speichern & Laden als JSON
├── render.py     # Rendering der Oberfläche (Apple-Design, via Pillow)
└── gui.py        # Oberfläche (tkinter-Canvas im Apple-Design)
run.py            # Startpunkt
```

## Dateiformat

Makros werden als lesbares JSON gespeichert:

```json
{
  "name": "makro",
  "created": "2026-07-07T12:00:00",
  "event_count": 3,
  "events": [
    { "t": 0.0,  "type": "move",  "x": 100, "y": 200 },
    { "t": 0.5,  "type": "click", "x": 100, "y": 200, "button": "left", "pressed": true },
    { "t": 0.55, "type": "click", "x": 100, "y": 200, "button": "left", "pressed": false }
  ]
}
```
