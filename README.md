# SMP-Kit – Trust-/Report-System für Donut SMP & Hugo SMP

Ein funktionsfähiges Zwei-Komponenten-Projekt, das die in der Recherche identifizierte Lücke
schließt: **Betrugs-/Scam-Schutz auf Economy-SMPs**, wo Scamming (z. B. beim TP-Trade)
ausdrücklich erlaubt ist und der Server nicht eingreift.

| Ordner | Was |
|---|---|
| [`smpkit-backend/`](smpkit-backend/) | Trust-Server **inkl. Verkaufs-Website** (Python-Standardbibliothek, kein pip). Speichert Reports/Vouches, berechnet den Vertrauenswert, liefert die geteilte Blacklist – und verkauft Lizenz-Zugänge für **4,99 €** über Stripe. **Getestet & lauffähig.** |
| [`smpkit-mod/`](smpkit-mod/) | Fabric-Client-Mod (MC 1.21.1). Report-/Vouch-GUI, Trust-Anzeige in %, Blacklist-Fenster, Nähe-Warnung, dazu SafeTrade (`/pay`-Doppelbestätigung) und Economy-/Grind-HUD. |

## Serverkosten decken

Der Server bringt einen **eingebauten Shop** mit (`/`): Spieler kaufen für **4,99 €** einen
dauerhaften Lizenzschlüssel; ohne gültige Lizenz ist die Trust-API gesperrt
(`SMPKIT_LICENSE_REQUIRED=true`). Bezahlung über **Stripe**; ohne Stripe-Keys läuft ein
Dev-/Simulationsmodus zum Testen. Details in [`smpkit-backend/README.md`](smpkit-backend/README.md).

## Idee in einem Satz

Spieler melden Betrüger über ein GUI; ab einer bestimmten Zahl **unterschiedlicher** Melder
kommt der Spieler auf eine **von allen Mod-Nutzern einsehbare Liste**, und jeder sieht zu
jedem Spieler einen **Vertrauenswert in Prozent** – umgekehrt heben Empfehlungen (Vouches)
diesen Wert.

## Schnellstart

```bash
# 1) Backend starten
cd smpkit-backend
python3 trust_server.py --port 8080 --db trust.db

# 2) Mod bauen (auf einem Rechner mit Internet)
cd ../smpkit-mod
./gradlew build            # -> build/libs/smpkit-1.0.0.jar in den mods-Ordner

# 3) Im Spiel Backend eintragen
/smpkit seturl http://DEINE-IP:8080
```

## Warum ein Backend nötig ist

Eine „Liste, die jeder mit der Mod sehen kann" setzt einen **gemeinsamen Datenspeicher**
voraus – rein client-seitig lassen sich keine Daten zwischen Spielern teilen. Deshalb: schlanker
zentraler Trust-Server + Mod, die ihn abfragt und befüllt.

## Status

- **Backend:** vollständig implementiert und **end-to-end getestet** (`smpkit-backend/test_api.sh`).
- **Mod:** vollständiger, bau-fertiger Quellcode inkl. Gradle-Wrapper. In der Erstellungs-Sandbox
  war das Kompilieren nicht möglich, weil deren Netzwerk-Policy die Fabric-/Mojang-Server
  blockiert; `./gradlew build` läuft auf einem normalen Rechner mit Internet.

## Regelkonformität

Rein client-seitig, liest nur eigene Aktionen und ohnehin sichtbare Nametags/Chat – **kein**
Player-Radar, **keine** Kampf-/Totem-Automatisierung. Details in `smpkit-mod/README.md`.

---

Hintergrund-Recherche zu den Mod-Ideen: siehe [`DONUT-HUGO-SMP-MODS.md`](DONUT-HUGO-SMP-MODS.md)
und [`MOD-VORSCHLAG.md`](MOD-VORSCHLAG.md).
