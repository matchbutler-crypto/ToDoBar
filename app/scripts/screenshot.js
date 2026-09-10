"use strict";

/**
 * Entwicklerwerkzeug: rendert beide Oberflächen mit Beispieldaten und legt
 * PNGs ab. Läuft auch headless (xvfb), damit das Layout ohne Mac prüfbar ist.
 *
 *   npx electron scripts/screenshot.js [Zielordner]
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

// Electron reicht seine eigenen Flags mit durch — nur echte Pfade auswerten.
const target = process.argv.slice(2).find((a) => a[0] !== "-" && !a.endsWith("screenshot.js"));
const OUT = path.resolve(target || path.join(__dirname, "..", "shots"));
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "todo-shot-"));
app.setPath("userData", PROFILE);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(win, name) {
  await wait(450);
  const image = await win.webContents.capturePage();
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name + ".png");
  fs.writeFileSync(file, image.toPNG());
  console.log("→ " + file);
}

app.whenReady().then(async () => {
  const Store = require("../src/main/store.js");
  const store = new Store({ demo: true });

  ipcMain.handle("state:get", () => store.get());
  ipcMain.handle("state:dispatch", (_e, action) => store.dispatch(action));
  ipcMain.on("popover:resize", (_e, height) => {
    const win = BrowserWindow.fromWebContents(_e.sender);
    if (!win) return;
    const b = win.getBounds();
    win.setBounds({ x: b.x, y: b.y, width: b.width, height: Math.min(Math.ceil(height), 900) });
  });
  ipcMain.on("popover:hide", () => {});
  ipcMain.on("window:open", () => {});

  const webPreferences = {
    preload: path.join(__dirname, "..", "src", "preload", "index.js"),
    contextIsolation: true,
    nodeIntegration: false
  };

  const popover = new BrowserWindow({
    width: 448,
    height: 700,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: webPreferences
  });
  await popover.loadFile(path.join(__dirname, "..", "src", "renderer", "popover.html"));
  await capture(popover, "popover");

  const win = new BrowserWindow({
    width: 1040,
    height: 660,
    show: true,
    backgroundColor: "#F7F3EC",
    webPreferences: webPreferences
  });
  await win.loadFile(path.join(__dirname, "..", "src", "renderer", "window.html"));
  await capture(win, "fenster-planung");

  for (const tab of ["Archiv", "Einstellungen"]) {
    win.webContents.send("ui:tab", tab);
    await capture(win, "fenster-" + tab.toLowerCase());
  }

  // Aufgeklappte Aufgabe im Fenster prüfen.
  win.webContents.send("ui:tab", "Planung");
  await wait(200);
  await win.webContents.executeJavaScript(
    "document.querySelectorAll('.task-plan .can-expand')[0].click(); true"
  );
  await capture(win, "fenster-planung-aufgeklappt");

  await popover.webContents.executeJavaScript(
    "document.querySelectorAll('.task-popover .can-expand')[0].click(); true"
  );
  await capture(popover, "popover-aufgeklappt");

  fs.rmSync(PROFILE, { recursive: true, force: true });
  app.quit();
});

app.on("window-all-closed", () => app.quit());
