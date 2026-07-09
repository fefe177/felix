# Mod-Vorschlag (Deep Research): "TimeWeave" – chirurgisches Undo für Minecraft Java (Singleplayer)

*Recherche-Stand: Juli 2026 · Plattform: Minecraft Java Edition (Fabric / NeoForge)*

## TL;DR

**Empfehlung: Eine Block-History-Mod mit *bereichsgenauem* Rückgängigmachen für Singleplayer** –
im Prinzip "CoreProtect für Einzelspieler", aber mit visueller Auswahl und Zeitregler.
Du markierst einen Bereich (z. B. das Loch, das ein Creeper gerissen hat), stellst einen
Zeitpunkt ein ("vor 3 Minuten") und stellst **nur diesen Bereich** wieder her – ohne den
Rest deiner Welt und deinen sonstigen Fortschritt zu verlieren.

Diese Lücke existiert nachweislich und ist technisch gut umsetzbar. Alles andere, was mir
in der Recherche begegnet ist, ist entweder schon gut bedient oder deutlich schwerer.

---

## Warum genau das? – Die Marktlücke

Ich habe die vier üblichen "da müsste doch mal jemand …"-Bereiche geprüft. Drei davon sind
2026 überraschend voll:

| Bereich | Status 2026 | Fazit |
|---|---|---|
| Quality-of-Life (JEI, Jade, AppleSkin, Sodium …) | Extrem gesättigt | Keine echte Lücke mehr |
| KI-/LLM-NPCs (Villager AI, Player2, Nations & Villagers AI Reborn, LLMCraft) | Boomt gerade, viele Projekte inkl. lokaler Modelle (Ollama) | Bereits überfüllt |
| Barrierefreiheit (Blind Accessibility, Minecraft Access, AudioAccess, ColorBlindness) | Vanilla 26.1.2 hat sogar Screenreader + Farbfilter nativ | Solide abgedeckt |
| Versions-Migration von Modpacks (Transmoder, mrpack-updater, Mod Updater) | Mehrere Web-Tools | Abgedeckt |

**Die Lücke liegt beim "Undo".** Was heute existiert:

- **CoreProtect** – der Goldstandard fürs Zurückrollen, aber ein **Server-Plugin**
  (Bukkit/Spigot/Paper). Läuft **nicht** im Fabric/NeoForge-Singleplayer und nicht in
  normalen Mod-Loadern.
- **Rollback / WorldStateCheckpoints** – machen **Ganz-Welt-Snapshots**. Rollst du zurück,
  verlierst du *alles* seit dem Snapshot, nicht nur den Fehler.
- Windows "Vorherige Versionen" / manuelle Ordner-Backups – ebenfalls alles-oder-nichts und
  umständlich.

Niemand deckt den häufigsten Realfall ab: *"Ich will genau diese eine Ecke von vor fünf
Minuten zurück – und sonst nichts."* Creeper-Loch neben dem fertigen Haus, ein TNT-Unfall,
ein WorldEdit-Befehl, der zu viel gelöscht hat, oder Griefing auf dem kleinen Server mit
Freunden. Genau dieser chirurgische Eingriff fehlt im Mod-Ökosystem (im Gegensatz zum
Plugin-Ökosystem).

---

## Das Konzept: "TimeWeave"

**Kernidee:** Ein rollierendes, platzsparendes Protokoll aller Blockänderungen (wer/was/wann),
plus ein Werkzeug, um einen ausgewählten Bereich auf einen früheren Zeitpunkt zurückzuspulen.

### Feature-Set (MVP)
1. **Block-Logging** – Jede Blockänderung wird mit Ursache (Spieler, Creeper, TNT, Feuer,
   Mob, Kolben, WorldEdit …), Position und Zeitstempel in eine lokale Datenbank geschrieben.
2. **Auswahl-Zauberstab** – Zwei Ecken anklicken → Quader markieren (wie WorldEdit-Selection).
3. **Zeitregler-GUI** – "Zeige diesen Bereich vor: 1 min / 5 min / 30 min / eigener Zeitpunkt".
   Live-Vorschau als Geister-Blöcke, *bevor* etwas passiert.
4. **Selektives Undo/Redo** – Nur der markierte Bereich wird wiederhergestellt; volle
   Redo-Funktion, falls man sich vertut.
5. **Ursachen-Filter** – "Nur Creeper-Schäden rückgängig machen", "nur Änderungen von
   Spieler X" (relevant fürs Anti-Griefing auf Freundes-Servern).

### Nice-to-have (später)
- **Inspektor-Modus** – Block anklicken → "Vor 12 min von Steve platziert / vorher Stein".
- **Auto-Snapshot vor riskanten Aktionen** (z. B. vor `//set` in WorldEdit).
- **Server-seitig lauffähig** (dediziert), damit Admins es wie CoreProtect nutzen können,
  aber im modernen Fabric/NeoForge-Stack statt Bukkit.

---

## Technische Machbarkeit

**Realistisch und gut abgegrenzt.** Die Bausteine existieren alle in der Mod-API:

- **Erfassung:** Block-Events (`Block#onBlockAdded`, Explosionen, Fluid- und Feuer-Ticks) über
  Fabric-Mixins bzw. NeoForge-Events abgreifen. CoreProtect beweist auf Plugin-Seite, dass
  das Datenmodell trägt – hier wird es auf den Mod-Loader portiert.
- **Speicherung:** Eingebettetes SQLite oder ein simples append-only Binärlog pro Region,
  mit Ringpuffer (z. B. "letzte 6 Stunden" oder "letzte 200 MB"), damit die Weltgröße nicht
  explodiert. Delta-Encoding hält es klein.
- **Wiederherstellung:** Änderungen im Zielquader in umgekehrter Zeitreihenfolge abspielen –
  identisch zur bekannten CoreProtect-Rollback-Logik, nur auf die Selektion begrenzt.
- **Aufwand:** Ein erfahrener Modder kann den MVP (Logging + Bereichs-Undo) in überschaubarer
  Zeit bauen; das Schwierige ist Performance (asynchrones Schreiben, kein TPS-Einbruch) und
  saubere Ursachenzuordnung bei Kettenreaktionen (Explosion löst Fall-/Fließ-Events aus).

**Risiken:** Redstone-/Fluid-Kaskaden korrekt attribuieren; Kompatibilität mit anderen Mods,
die Blöcke setzen; Datenbankgröße bei Highspeed-Farmen (Lösung: bestimmte Ursachen wie
Kolben-Ticks optional nicht loggen).

---

## Warum das nützlich *und* neu ist

- **Nützlich:** Trifft einen alltäglichen Schmerzpunkt, den heute nur Server-Admins mit
  Plugins lösen können. Solo-Spieler und kleine Fabric/NeoForge-Freundes-Server stehen bisher
  im Regen.
- **Neu:** Kein bestehender Fabric/NeoForge-Mod bietet *bereichsselektives* Undo mit Zeitachse
  – nur Ganz-Welt-Snapshots oder Server-only-Plugins.
- **Abgegrenzt:** Klar definierter Scope, keine uferlose "eierlegende Wollmilchsau".

---

## Alternativen (falls dir "TimeWeave" nicht zusagt)

Gereiht nach Verhältnis von *Lücke × Nutzen* zu *Aufwand*:

1. **Adaptiver Modpack-Guide** – Eine Mod, die die *tatsächlich installierten* Mods scannt und
   automatisch eine Einstiegs-/Progressions-Übersicht generiert. Problem "500 Mods, wo fange
   ich an?" ist real; Questbücher lösen es nur, wenn der Pack-Autor sie manuell schreibt. Der
   automatische, mod-agnostische Ansatz fehlt. **Höherer Aufwand** (Rezeptbaum-Analyse, Heuristik).
2. **Runtime-Konflikt-Diagnose** – Erklärt *im Spiel*, warum Worldgen/Rezepte kollidieren
   ("Mod A und Mod B registrieren beide Erz X in denselben Chunk"). Nischig, aber sehr
   dankbar für Modpack-Bastler.
3. **Spielzeit-/Wohlfühl-Layer** – Sanfte Sitzungserinnerungen, Pausen-Vorschläge, freiwillige
   Limits. Klein, aber im Java-Ökosystem kaum vorhanden.

Meine klare Nr. 1 bleibt **TimeWeave**: beste Balance aus echter Lücke, breitem Nutzen und
realistischem Umfang.

---

## Quellen

- [Requests / Ideas For Mods – Minecraft Forum](https://www.minecraftforum.net/forums/mapping-and-modding-java-edition/minecraft-mods/requests-ideas-for-mods)
- [What mods haven't been made?? – Planet Minecraft](https://www.planetminecraft.com/forums/minecraft/modding/what-mods-haven-been-made-210328/)
- [25 Best Quality Of Life Mods (2025/2026) – Sparked Host](https://blog.sparkedhost.com/minecraft/25-best-quality-of-life-mods-for-minecraft-in-2025devide2026)
- [15 Best Minecraft Quality of Life Mods – CurseForge Blog](https://blog.curseforge.com/best-minecraft-quality-of-life-mods/)
- [Minecraft Accessibility 2026 – Minecraft.How](https://minecraft.how/blog/post/minecraft-accessibility-features-2026)
- [Blind Accessibility – CurseForge](https://www.curseforge.com/minecraft/mc-mods/blind-accessibility)
- [AudioAccess – GitHub](https://github.com/GreenBeanGravy/AudioAccess)
- [Best Minecraft AI Mods 2026 – Oasis](https://oasisaiminecraft.com/blog/the-ultimate-guide-to-the-best-minecraft-ai-mods-2026/)
- [Nations & Villagers – AI Reborn – Modrinth](https://modrinth.com/mod/nations-villagers-ai-reborn)
- [Player2 AI NPC – CurseForge](https://www.curseforge.com/minecraft/mc-mods/player2npc)
- [mrpack-updater – GitHub](https://github.com/KrisTC/mrpack-updater)
- [Transmoder – Minecraft mods updater](https://transmoder.org/)
- [Rollback – Modrinth](https://modrinth.com/mod/rollback)
- [How to undo griefing? – Planet Minecraft](https://www.planetminecraft.com/forums/pmc/discussion/how-undo-griefing-281284/)
- [Recommended Progression Through Modded Minecraft – Feed The Beast](https://forum.feed-the-beast.com/threads/recommended-progression-through-modded-minecraft.57434/)
