// Minimal preload script (CommonJS): exposes only the backend base URL.
//
// contextIsolation is on and nodeIntegration is off, so the renderer cannot
// touch Node APIs directly; it only sees `window.localpilot.backendUrl`.

const { contextBridge } = require("electron");

const backendUrl = process.env.LOCALPILOT_BACKEND_URL || "http://127.0.0.1:8765";

contextBridge.exposeInMainWorld("localpilot", { backendUrl });
