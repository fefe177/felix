# Mod-Ideen für Donut SMP & Hugo SMP (Deep Research)

*Recherche-Stand: Juli 2026 · Zielserver: Donut SMP, Hugo SMP (Economy-/PvP-Survival mit Auktionshaus & Währung)*

## Kontext & wichtigste Rahmenbedingung

Donut SMP und Hugo SMP (Server des deutschen Creators **LetsHugo**, bewusst ähnlich zu
Donut SMP) sind grindlastige Economy-Server: Währung, Auktionshaus, `/pay`, PvP.

**Die entscheidende Regel-Erkenntnis für die Mod-Auswahl:**
- **Verboten (bannbar):** Auto-Totem, Player-Radar/Minimap mit Spielerpositionen, Killaura,
  Reach & Co. – alles, was einen mechanischen Kampf-/Info-Vorteil verschafft.
- **Ausdrücklich *erlaubt*:** **Scamming ist auf Donut SMP nicht gebannt.** Spieler verlieren
  regelmäßig echtes Ingame-Geld und Items an Betrug – und der Server greift bewusst nicht ein.

Jede sinnvolle Mod-Idee muss also **legal** sein (kein Cheat) – und die dankbarste Lücke
liegt genau dort, wo der Server selbst nichts tut: **Betrugs-/Trade-Schutz.**

---

## Empfehlung Nr. 1: "SafeTrade" – Anti-Scam- & Trade-Schutz-Overlay

**Das Problem:** Scamming ist erlaubt, passiert ständig und kostet echtes Vermögen. Klassiker:
- `/pay`-Vertipper (eine Null zu viel → statt 200k plötzlich 2 Mio verschickt),
- "Zahl zuerst"-Betrug und Fake-Mittelsmänner,
- Item-Switch beim Handeln, "verdopple dein Geld"-Maschen.

**Was es heute gibt:** *Scam Reports* markiert **bekannte** Scammer nachträglich mit dem
Nametag "SCAMMER". Das ist reaktiv – es verhindert weder den Vertipper noch den erstmaligen
Betrug und liefert dir kein Beweismaterial.

**Die Lücke:** Ein *proaktives* Schutz-Overlay. Kein Serverzugriff nötig, rein client-seitig,
100 % regelkonform (liest nur deine eigenen Aktionen + öffentliche Nametags/Chat):

1. **`/pay`-Doppelbestätigung** – Bei Beträgen über einem frei einstellbaren Limit erscheint
   ein Bestätigungsdialog mit ausgeschriebener Summe ("Du zahlst **2.000.000** an *Steve* –
   wirklich? [Ja] [Abbrechen]"). Killt den Vertipper-Klassiker sofort.
2. **Trade-Logbuch** – Automatisches, lokales Protokoll aller `/pay`-Ein-/Ausgänge und Trades
   mit Zeitstempel, Betrag, Gegenpartei. Ein Klick = fertige Beweiskette für Report/Discord.
3. **Blacklist-Vorwarnung** – Steht ein Spieler in Reichweite auf einer Community-Scammer-Liste
   (integrierbar mit den bestehenden Scam-Reports-Daten), Warnung **bevor** du handelst –
   nicht erst danach.
4. **Muster-Erkennung** – Markiert typische Scam-Chatphrasen ("pay first", "doppeltes Geld",
   "trust trade") dezent im Chat.

**Warum stark:** Trifft ein vom Server *bewusst ungelöstes* Dauerproblem, ist eindeutig kein
Cheat (kein Kampf-/Radar-Vorteil), und keine bestehende Mod ist präventiv – alle sind reaktiv.

---

## Empfehlung Nr. 2: "LedgerHUD" – persönliches Economy-Dashboard

**Das Problem:** Auf reinen Grind-Servern ist "verdiene ich gerade eigentlich effizient?" die
Kernfrage – aber die Antwort liegt verstreut in Chat, AH und Kontostand.

**Was es heute gibt:** *DonutAuctions* (niedrigster AH-Preis beim Hovern), *DonutExtras*,
und die **externe** Coflnet-Website als Flip-Finder. Spieler wünschen sich das ausdrücklich
**im Spiel** statt im Browser.

**Die Lücke:** Ein vollständiges In-Game-Vermögens-/Einkommens-HUD:
- **Netto-Vermögen** über Zeit (Kontostand + geschätzter Inventar-/Lagerwert nach AH-Preisen),
- **Einkommen pro Stunde**, aufgeschlüsselt nach Aktivität (Grinden, Flippen, Farmen),
- **`/pay`-Bilanz** (rein/raus, Netto pro Handelspartner),
- **Auktions-P&L** (Einkauf vs. Verkauf → tatsächlicher Flip-Gewinn).

Legal, weil es nur *deine eigenen* Daten aggregiert. Nische, aber genau der Grind-Kern.

---

## Empfehlung Nr. 3: "GrindMate" – Aktivitäts- & Effizienz-Tracker

Kleiner, aber unbesetzt: Ein Tracker, der pro **Money-Making-Methode** (Spawner, Mob-Farm,
Flippen, Ressourcen) automatisch Ertrag/Stunde, Drops/Stunde und Break-even einer Investition
misst und vergleichbar macht ("Deine Blaze-Farm bringt 340k/h, dein AH-Flippen 180k/h").
Beantwortet die Grind-Frage schlechthin – regelkonform, weil reine Selbst-Statistik.

---

## Gereihte Bewertung (Lücke × Nutzen ÷ Aufwand)

| # | Idee | Lücke | Nutzen | Legal? | Aufwand |
|---|---|---|---|---|---|
| 1 | **SafeTrade** (Anti-Scam) | Groß – Server löst es bewusst nicht | Sehr hoch | ✅ eindeutig | Mittel |
| 2 | **LedgerHUD** (Economy-Dashboard) | Teils extern (Coflnet), im Spiel offen | Hoch | ✅ nur eigene Daten | Mittel–hoch |
| 3 | **GrindMate** (Effizienz-Tracker) | Unbesetzt | Mittel–hoch | ✅ Selbst-Statistik | Niedrig–mittel |

**Meine klare Nr. 1: SafeTrade.** Beste Kombination aus echter, vom Server ungelöster Lücke,
breitem Nutzen und wasserdichter Regelkonformität.

> **Legalitäts-Hinweis:** Alle drei Ideen lesen ausschließlich deine eigenen Aktionen sowie
> ohnehin sichtbare Nametags/Chat – **kein** Player-Radar, **keine** Automatisierung von Kampf
> oder Totem. Vor Veröffentlichung trotzdem die jeweils aktuellen Regeln von Donut SMP bzw.
> Hugo SMP prüfen und im Zweifel bei der Serverleitung rückfragen.

---

## Quellen

- [Hugo SMP – offizielle Seite](https://hugo-smp.com/)
- [HugoSMP.net (LetsHugos offizieller SMP)](https://minecraft-server.eu/server/index/236C5/HugoSMPnet-LetsHugos-offizieller-SMP-Java-Bedrock?lang=en)
- [Donut SMP – Rules Wiki (verbotene Mods: Auto-Totem, Player-Radar)](https://donutsmp.wiki/rules)
- [Scam Reports – Modrinth (Scamming ist auf Donut SMP nicht gebannt)](https://modrinth.com/mod/scamreports)
- [DonutAuctions – Modrinth](https://modrinth.com/mod/donut_auctions)
- [DonutExtras – CurseForge](https://www.curseforge.com/minecraft/mc-mods/donutextras)
- [Coflnet DonutSMP Flips (externer Flip-Finder)](https://donut.coflnet.com/)
- [Money Making – Donut SMP Wiki](https://dsmp.fandom.com/wiki/Money_Making)
- [Donut SMP Pack – Modrinth (erlaubte QoL/Performance-Mods)](https://modrinth.com/project/YpF1G8h6)
