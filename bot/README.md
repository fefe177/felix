# Pausiert: Claude spielt selbst

Hier liegt das erste Projekt, in dem Claude als Spieler „Claude“ durch die Welt läuft, schaut, kämpft und
Block für Block baut (MCP-Server `bot/index.js`). Es ist pausiert, weil jeder kleine Schritt ein eigener
Claude-Aufruf ist und das viel Nutzungslimit kostet.

Wieder einschalten: in `.mcp.json` diesen Eintrag ergänzen und Claude Code neu starten.

```json
{
  "mcpServers": {
    "minecraft": { "command": "node", "args": ["bot/index.js"] }
  }
}
```
