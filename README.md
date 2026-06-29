# felix — nützliche CLI-Tools

Eine wachsende Sammlung kleiner, funktionierender Kommandozeilen-Tools.
Jedes Tool liegt in einem eigenen Ordner unter `apps/`, ist eigenständig
lauffähig und hat (wo sinnvoll) Tests.

## Tools

| Tool | Sprache | Beschreibung |
|------|---------|--------------|
| [`dirstat`](apps/dirstat) | Python | Findet die größten Dateien & Ordner in einem Verzeichnis |
| [`pwgen`](apps/pwgen) | Python | Erzeugt sichere Passwörter & Passphrasen mit Entropie-Anzeige |
| [`jsonpeek`](apps/jsonpeek) | Python | Zeigt JSON hübsch an und fragt Werte per Punkt-Pfad ab |
| [`dupfind`](apps/dupfind) | Python | Findet doppelte Dateien anhand des Inhalts (SHA-256) |

## Tests ausführen

```bash
./run_tests.sh
```
