"use strict";

const path = require("path");
const {
  app,
  BrowserWindow,
  clipboard,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  shell
} = require("electron");

const Store = require("./store.js");
const Model = require("../shared/model.js");
const Dates = require("../shared/dates.js");
const Update = require("./update.js");
const SelfUpdate = require("./selfUpdate.js");

const IS_MAC = process.platform === "darwin";
const DEMO = process.argv.includes("--demo");

/** Muss zum body-padding in popover.css passen: der transparente Rand für den Schatten. */
const PANEL_WIDTH = 400;
const PANEL_MARGIN_X = 24;
const PANEL_MARGIN_TOP = 8;
const POPOVER_WIDTH = PANEL_WIDTH + PANEL_MARGIN_X * 2;
const POPOVER_MAX_HEIGHT = 760;
const SHORTCUT = "Alt+Space";

let store = null;
let tray = null;
let popover = null;
let mainWindow = null;
let dayTimer = null;
let installing = false;

/* ------------------------------------------------------------------ Tray */

/** Ausgefüllter Kreis als Template-Image — macOS färbt ihn passend zur Menübar. */
function trayIcon() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "..", "assets", "trayTemplate.png"));
  icon.setTemplateImage(true);
  return icon;
}

function updateTray() {
  if (!tray) return;
  const view = Model.derive(store.get());
  if (IS_MAC) tray.setTitle(view.openToday ? " " + view.openToday : "");
  tray.setToolTip(view.openToday === 1 ? "1 offene Aufgabe" : view.openToday + " offene Aufgaben");
}

/* --------------------------------------------------------------- Popover */

function createPopover() {
  popover = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: 520,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popover.loadFile(path.join(__dirname, "..", "renderer", "popover.html"));
  popover.on("blur", () => hidePopover());
  popover.on("closed", () => {
    popover = null;
  });
  return popover;
}

function positionPopover() {
  if (!popover) return;
  const bounds = popover.getBounds();
  const trayBounds = tray ? tray.getBounds() : null;
  const point = trayBounds && trayBounds.width ? { x: trayBounds.x, y: trayBounds.y } : screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(point).workArea;

  let x = trayBounds && trayBounds.width
    ? Math.round(trayBounds.x + trayBounds.width / 2 - bounds.width / 2)
    : Math.round(area.x + area.width - bounds.width - 8);
  x = Math.max(area.x + 4, Math.min(x, area.x + area.width - bounds.width - 4));

  // Das Panel beginnt PANEL_MARGIN_TOP unterhalb der Fensterkante — der Rand
  // trägt nur den Schatten und darf den Abstand zur Menübar nicht vergrößern.
  const y = Math.max(area.y + 4 - PANEL_MARGIN_TOP, 0);

  popover.setBounds({ x: x, y: y, width: bounds.width, height: bounds.height });
}

function showPopover() {
  if (!popover) createPopover();
  positionPopover();
  popover.setAlwaysOnTop(true, "screen-saver");
  popover.show();
  popover.focus();

  // Beim allerersten Öffnen kann der Renderer noch laden — dann erst danach melden.
  const announce = () => popover.webContents.send("popover:shown");
  if (popover.webContents.isLoading()) popover.webContents.once("did-finish-load", announce);
  else announce();
}

function hidePopover() {
  if (popover && popover.isVisible()) popover.hide();
}

function togglePopover() {
  if (popover && popover.isVisible()) hidePopover();
  else showPopover();
}

/* ---------------------------------------------------------------- Fenster */

function createMainWindow(tab) {
  if (mainWindow) {
    if (tab) mainWindow.webContents.send("ui:tab", tab);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1040,
    height: 660,
    minWidth: 780,
    minHeight: 560,
    backgroundColor: "#F7F3EC",
    show: false,
    titleBarStyle: IS_MAC ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 20 },
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "window.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (tab) mainWindow.webContents.send("ui:tab", tab);
  });

  // Menübar-App: Dock-Symbol nur, solange das Fenster offen ist.
  if (IS_MAC) {
    mainWindow.on("show", () => app.dock.show());
    mainWindow.on("closed", () => app.dock.hide());
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return mainWindow;
}

/* ------------------------------------------------------------------- Menü */

function buildMenu() {
  const name = app.getName();
  const template = [
    {
      label: name,
      submenu: [
        { role: "about", label: "Über " + name },
        { type: "separator" },
        { label: "Einstellungen…", accelerator: "Cmd+,", click: () => createMainWindow("Einstellungen") },
        { type: "separator" },
        { role: "hide", label: name + " ausblenden" },
        { role: "hideOthers", label: "Andere ausblenden" },
        { type: "separator" },
        { role: "quit", label: name + " beenden" }
      ]
    },
    {
      label: "Datei",
      submenu: [
        { label: "Neue Aufgabe", accelerator: "Cmd+N", click: () => showPopover() },
        { label: "Fenster öffnen", accelerator: "Cmd+0", click: () => createMainWindow("Planung") },
        { type: "separator" },
        { role: "close", label: "Fenster schließen" }
      ]
    },
    {
      label: "Bearbeiten",
      submenu: [
        { role: "undo", label: "Widerrufen" },
        { role: "redo", label: "Wiederholen" },
        { type: "separator" },
        { role: "cut", label: "Ausschneiden" },
        { role: "copy", label: "Kopieren" },
        { role: "paste", label: "Einsetzen" },
        { role: "selectAll", label: "Alles auswählen" }
      ]
    },
    {
      label: "Ansicht",
      submenu: [
        { label: "Planung", accelerator: "Cmd+1", click: () => createMainWindow("Planung") },
        { label: "Archiv", accelerator: "Cmd+2", click: () => createMainWindow("Archiv") },
        { label: "Einstellungen", accelerator: "Cmd+3", click: () => createMainWindow("Einstellungen") },
        { type: "separator" },
        { role: "reload", label: "Neu laden" },
        { role: "toggleDevTools", label: "Entwicklerwerkzeuge" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* -------------------------------------------------------------------- IPC */

function broadcast() {
  const payload = store.get();
  [popover, mainWindow].forEach((win) => {
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", payload);
  });
  updateTray();
}

function registerIpc() {
  ipcMain.handle("state:get", () => store.get());
  ipcMain.handle("state:dispatch", (_e, action) => store.dispatch(action));
  ipcMain.on("popover:hide", () => hidePopover());
  ipcMain.on("popover:resize", (_e, height) => {
    if (!popover) return;
    const h = Math.max(180, Math.min(Math.ceil(height), POPOVER_MAX_HEIGHT));
    const b = popover.getBounds();
    if (b.height === h) return;
    popover.setBounds({ x: b.x, y: b.y, width: POPOVER_WIDTH, height: h });
  });
  ipcMain.on("window:open", (_e, tab) => {
    hidePopover();
    createMainWindow(tab || "Planung");
  });

  ipcMain.handle("update:check", async () => {
    const token = (store.get().settings.updateToken || "").trim() || null;
    store.dispatch({ type: "setUpdateStatus", status: { checking: true, error: null } });
    try {
      const result = await Update.checkForUpdate(app.getVersion(), token);
      store.dispatch({
        type: "setUpdateStatus",
        status: {
          checking: false,
          checkedAt: Date.now(),
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          updateAvailable: result.updateAvailable,
          error: null
        }
      });
    } catch (err) {
      store.dispatch({
        type: "setUpdateStatus",
        status: { checking: false, checkedAt: Date.now(), currentVersion: app.getVersion(), error: err.message }
      });
    }
    return store.get().updateStatus;
  });

  ipcMain.handle("clipboard:write", (_e, text) => {
    clipboard.writeText(String(text || ""));
  });

  ipcMain.handle("update:install", async () => {
    if (installing) return { started: false };
    installing = true;

    const repoPath = store.get().settings.repoPath || "~/ToDoBar";
    const send = (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("update:install:progress", payload);
    };
    const onLog = (text) => send({ stage: "log", text: text });

    send({ stage: "start" });
    try {
      const built = await SelfUpdate.pullAndBuild(repoPath, onLog, app.getName());
      send({ stage: "relaunching" });
      SelfUpdate.scheduleReplaceAndRelaunch(built, app.getName());
      // Kurze Verzögerung, damit die letzte IPC-Nachricht noch ankommt, bevor wir beenden.
      setTimeout(() => app.quit(), 300);
    } catch (err) {
      installing = false;
      send({ stage: "error", message: err.message });
    }
    return { started: true };
  });
}

/* ------------------------------------------------------------ Tageswechsel */

/** Einmal pro Minute schauen, ob ein neuer Tag begonnen hat. */
function watchDayChange() {
  let lastDay = Dates.todayKey();
  dayTimer = setInterval(() => {
    const now = Dates.todayKey();
    if (now === lastDay) return;
    lastDay = now;
    if (store.checkRollover()) return; // broadcast läuft über den Store-Listener
    broadcast();
  }, 60 * 1000);
}

/* ------------------------------------------------------------------ Start */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showPopover());

  app.whenReady().then(() => {
    if (IS_MAC) app.dock.hide();

    store = new Store({ demo: DEMO });
    store.subscribe(() => broadcast());

    tray = new Tray(trayIcon());
    tray.on("click", () => togglePopover());
    tray.on("right-click", () => createMainWindow("Planung"));

    registerIpc();
    buildMenu();
    createPopover();
    updateTray();
    watchDayChange();

    if (!globalShortcut.register(SHORTCUT, togglePopover)) {
      console.warn("[todo] Kurzbefehl " + SHORTCUT + " ist belegt — Popover nur über das Menübar-Symbol.");
    }

    app.on("activate", () => createMainWindow("Planung"));
  });

  // Menübar-App: Das Schließen des Fensters beendet die App nicht. Allein durch
  // das Abonnieren dieses Events entfällt das Standard-Beenden.
  app.on("window-all-closed", () => {});

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (dayTimer) clearInterval(dayTimer);
    if (store) store.flush();
  });
}
