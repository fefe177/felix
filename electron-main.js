/* =====================================================================
   BLOX TOWER DEFENSE 3D – Desktop-App (Electron)
   Startet das Spiel als eigenes Fenster, komplett ohne Browser.
   ===================================================================== */

const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    title: "Blox Tower Defense 3D",
    backgroundColor: "#1a2233",
    icon: path.join(__dirname, "icon.png"),
  });

  Menu.setApplicationMenu(null); // keine Menüleiste – sieht aus wie ein Spiel
  win.loadFile("index.html");

  // F11 = Vollbild umschalten
  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F11" && input.type === "keyDown") {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
