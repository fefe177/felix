// Electron main process for LocalPilot (CommonJS).
//
// Responsibilities:
//   * create the BrowserWindow (loads the Vite dev server in dev, the built
//     files in production);
//   * optionally start the Python backend (`localpilot serve`) as a child
//     process, wait until /api/health answers, and stop it cleanly on quit;
//   * expose the backend base URL to the renderer via preload.
//
// Configuration via environment variables:
//   LOCALPILOT_BACKEND_URL       base URL of the backend (default 127.0.0.1:8765)
//   LOCALPILOT_EXTERNAL_BACKEND  "1" => do not start the backend (use a running one)
//   LOCALPILOT_BACKEND_CMD       full command to start the backend (overrides default)
//   LOCALPILOT_PYTHON            python executable for the default command
//   ELECTRON_DEV                 "1" => load the Vite dev server

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { app, BrowserWindow, dialog } = require("electron");

const BACKEND_URL = process.env.LOCALPILOT_BACKEND_URL || "http://127.0.0.1:8765";
// Dev mode is opt-in via ELECTRON_DEV=1 (set by `npm run dev`). Otherwise -
// including `npm start` against a fresh `vite build` and the packaged app - we
// load the built files from dist/.
const IS_DEV = process.env.ELECTRON_DEV === "1";

/** @type {import("node:child_process").ChildProcess | null} */
let backendProcess = null;
let backendStopped = false;

/** Resolve the command and arguments used to launch the backend. */
function backendCommand() {
  if (process.env.LOCALPILOT_BACKEND_CMD) {
    const parts = process.env.LOCALPILOT_BACKEND_CMD.split(" ").filter(Boolean);
    return { command: parts[0], args: parts.slice(1) };
  }
  // Prefer the backend bundled into the packaged app (PyInstaller), if present.
  if (app.isPackaged && process.resourcesPath) {
    const exeName = process.platform === "win32" ? "localpilot-backend.exe" : "localpilot-backend";
    const bundled = path.join(process.resourcesPath, "backend", exeName);
    if (fs.existsSync(bundled)) {
      return { command: bundled, args: ["serve"] };
    }
  }
  // Otherwise fall back to a separately-installed Python package.
  const python = process.env.LOCALPILOT_PYTHON || "python";
  return { command: python, args: ["-m", "localpilot.main", "serve"] };
}

/** Start the backend child process unless an external backend is configured. */
function startBackend() {
  if (process.env.LOCALPILOT_EXTERNAL_BACKEND === "1") {
    return;
  }
  const { command, args } = backendCommand();
  backendProcess = spawn(command, args, {
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  backendProcess.stdout?.on("data", (chunk) => process.stdout.write(`[backend] ${chunk}`));
  backendProcess.stderr?.on("data", (chunk) => process.stderr.write(`[backend] ${chunk}`));
  backendProcess.on("error", (error) => {
    dialog.showErrorBox(
      "Backend konnte nicht gestartet werden",
      `Befehl: ${command} ${args.join(" ")}\n\n${error.message}\n\n` +
        "Setze LOCALPILOT_PYTHON oder LOCALPILOT_BACKEND_CMD, oder starte das " +
        "Backend manuell mit 'localpilot serve' und setze LOCALPILOT_EXTERNAL_BACKEND=1.",
    );
  });
  backendProcess.on("exit", (code) => {
    if (!backendStopped && code !== 0 && code !== null) {
      process.stderr.write(`[backend] beendet mit Code ${code}\n`);
    }
  });
}

/** Stop the backend child process (idempotent). */
function stopBackend() {
  if (backendProcess && !backendStopped) {
    backendStopped = true;
    backendProcess.kill("SIGTERM");
    backendProcess = null;
  }
}

/** Poll /api/health until it answers or the timeout elapses. */
async function waitForHealth(timeoutMs = 30000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/health`);
      if (response.ok) {
        return true;
      }
    } catch {
      // Backend not up yet; retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** Create the main application window. */
function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#0f1115",
    title: "LocalPilot",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (IS_DEV) {
    window.loadURL("http://localhost:5173");
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  startBackend();
  const healthy = await waitForHealth();
  if (!healthy) {
    dialog.showErrorBox(
      "Backend nicht erreichbar",
      `Das Backend unter ${BACKEND_URL} hat nicht rechtzeitig geantwortet. ` +
        "Die Oberflaeche wird trotzdem geladen und zeigt den Verbindungsstatus an.",
    );
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", stopBackend);
