"use strict";

/**
 * End-to-End durch die echten Renderer: npx electron scripts/test-ui.js
 * Prüft, dass Preload/IPC/CSP zusammenspielen und Klicks im DOM ankommen.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");

const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "todo-uitest-"));
app.setPath("userData", PROFILE);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log("  ✓ " + name);
}

app.whenReady().then(async () => {
  const Store = require("../src/main/store.js");
  const store = new Store({ demo: true });
  const wins = [];

  ipcMain.handle("state:get", () => store.get());
  ipcMain.handle("state:dispatch", (_e, action) => store.dispatch(action));
  ipcMain.on("popover:resize", () => {});
  ipcMain.on("popover:hide", () => {});
  ipcMain.on("window:open", () => {});
  ipcMain.handle("clipboard:write", () => {});
  // Fingiert einen erfolgreichen Update-Check, ohne echtes Netzwerk anzufassen —
  // die main/index.js-Variante mit echtem GitHub-Aufruf ist separat in update.js getestet.
  ipcMain.handle("update:check", async () => {
    store.dispatch({ type: "setUpdateStatus", status: { checking: true, error: null } });
    await wait(20);
    store.dispatch({
      type: "setUpdateStatus",
      status: {
        checking: false,
        checkedAt: Date.now(),
        currentVersion: "1.1.0",
        latestVersion: "1.2.0",
        updateAvailable: true,
        error: null
      }
    });
  });
  // Fingiert das Ein-Klick-Update: schickt echte Fortschritts-Events, ohne
  // wirklich git/npm/electron-builder anzustoßen — die Orchestrierung selbst
  // ist in scripts/test-model.js gegen Fake-Executables geprüft.
  ipcMain.handle("update:install", async () => {
    win.webContents.send("update:install:progress", { stage: "start" });
    await wait(20);
    win.webContents.send("update:install:progress", { stage: "log", text: "→ git pull\nAlready up to date.\n" });
    await wait(20);
    win.webContents.send("update:install:progress", { stage: "relaunching" });
    return { started: true };
  });

  store.subscribe((state) => wins.forEach((w) => w.webContents.send("state:changed", state)));

  const webPreferences = {
    preload: path.join(__dirname, "..", "src", "preload", "index.js"),
    contextIsolation: true,
    nodeIntegration: false
  };

  const popover = new BrowserWindow({ width: 448, height: 800, show: false, webPreferences: webPreferences });
  const win = new BrowserWindow({ width: 1040, height: 660, show: false, webPreferences: webPreferences });
  wins.push(popover, win);

  await popover.loadFile(path.join(__dirname, "..", "src", "renderer", "popover.html"));
  await win.loadFile(path.join(__dirname, "..", "src", "renderer", "window.html"));
  await wait(400);

  // executeJavaScript wertet im globalen Scope aus — jeder Schnipsel bekommt
  // deshalb einen eigenen Funktionsrahmen, sonst kollidieren die Namen.
  const js = (target, body) => target.webContents.executeJavaScript("(() => {" + body + "})()");
  const val = (target, expr) => js(target, "return " + expr + ";");

  /** Element anhand seines Textes finden — so, wie ein Mensch es anklicken würde. */
  const clickByText = (target, selector, text) =>
    js(
      target,
      "const hit = [...document.querySelectorAll(" + JSON.stringify(selector) + ")]" +
        ".find(el => el.textContent.indexOf(" + JSON.stringify(text) + ") === 0);" +
        "if (!hit) throw new Error('nicht gefunden: " + text + "');" +
        "hit.click(); return true;"
    );

  const clickInRow = (target, selector, text, inner) =>
    js(
      target,
      "const row = [...document.querySelectorAll(" + JSON.stringify(selector) + ")]" +
        ".find(el => el.textContent.indexOf(" + JSON.stringify(text) + ") === 0);" +
        "if (!row) throw new Error('Zeile nicht gefunden: " + text + "');" +
        "row.querySelector(" + JSON.stringify(inner) + ").click(); return true;"
    );

  const typeAndEnter = (target, selector, value) =>
    js(
      target,
      "const field = document.querySelector(" + JSON.stringify(selector) + ");" +
        "field.value = " + JSON.stringify(value) + ";" +
        "field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); return true;"
    );

  /** Tippt ohne Enter — löst nur das 'input'-Event aus (für den Composer-Collapse). */
  const typeOnly = (target, selector, value) =>
    js(
      target,
      "const field = document.querySelector(" + JSON.stringify(selector) + ");" +
        "field.value = " + JSON.stringify(value) + ";" +
        "field.dispatchEvent(new Event('input')); return true;"
    );

  try {
    console.log("Popover");

    await check("Skripte laufen trotz Content-Security-Policy", async () => {
      assert.strictEqual(await val(popover, "typeof Model.derive"), "function");
      assert.strictEqual(await val(popover, "typeof window.todo.dispatch"), "function");
    });

    await check("Beispieldaten sind gerendert", async () => {
      assert.strictEqual(await val(popover, "document.querySelectorAll('.task-popover').length"), 5);
      assert.strictEqual(await val(popover, "document.getElementById('openCount').textContent"), "4 offen");
    });

    await check("Kategorie/Priorität sind erst nach Texteingabe sichtbar", async () => {
      assert.strictEqual(await val(popover, "document.getElementById('composerOptions').hidden"), true);
      await typeOnly(popover, "#draft", "Vorschau");
      await wait(80);
      assert.strictEqual(await val(popover, "document.getElementById('composerOptions').hidden"), false);
      await typeOnly(popover, "#draft", "");
      await wait(80);
      assert.strictEqual(await val(popover, "document.getElementById('composerOptions').hidden"), true);
      await typeOnly(popover, "#draft", "Testaufgabe");
      await wait(80);
    });

    await check("Kategorie und Priorität lassen sich wählen", async () => {
      await clickByText(popover, ".chip", "Privat");
      await clickByText(popover, "#prios .seg", "Hoch");
      await wait(120);
      assert.strictEqual(await val(popover, "document.querySelector('.chip.is-on').textContent"), "Privat");
      assert.strictEqual(await val(popover, "document.querySelector('#prios .seg.is-on').textContent"), "Hoch");
      assert.strictEqual(await val(popover, "document.getElementById('draft').value"), "Testaufgabe", "Auswahl klickt, ohne den Entwurf zu leeren");
    });

    await check("Eintrag über die Eingabetaste landet im Store", async () => {
      await typeAndEnter(popover, "#draft", "Testaufgabe");
      await wait(200);
      const added = store.get().tasks.find((t) => t.text === "Testaufgabe");
      assert.ok(added, "Aufgabe im Store");
      assert.strictEqual(added.cat, "Privat");
      assert.strictEqual(added.prio, "Hoch");
      assert.strictEqual(await val(popover, "document.getElementById('draft').value"), "");
      assert.strictEqual(await val(popover, "document.getElementById('composerOptions').hidden"), true, "klappt nach dem Absenden wieder zu");
      assert.strictEqual(await val(popover, "document.getElementById('openCount').textContent"), "5 offen");
    });

    await check("Abhaken wirkt und schlägt bis ins Fenster durch", async () => {
      const id = store.get().tasks.find((t) => t.text === "Testaufgabe").id;
      await clickInRow(popover, ".task-popover", "Testaufgabe", ".check");
      await wait(200);
      assert.strictEqual(store.get().tasks.find((t) => t.id === id).done, true);
      assert.strictEqual(await val(win, "document.querySelector('.tab.is-on .count').textContent"), "8");
    });

    await check("Aufklappen zeigt Notiz und Unteraufgaben", async () => {
      await clickByText(popover, ".can-expand", "Projekt A");
      await wait(150);
      assert.strictEqual(await val(popover, "document.querySelectorAll('.task-popover .details .sub').length"), 2);
      assert.ok((await val(popover, "document.querySelector('.details .note').textContent")).indexOf("Unterlagen abgelegt") > 0);
    });

    await check("Löschen entfernt die Aufgabe aus Popover und Store", async () => {
      const before = store.get().tasks.length;
      await clickInRow(popover, ".task-popover", "Zahnarzt anrufen", ".delete-btn");
      await wait(200);
      assert.strictEqual(store.get().tasks.length, before - 1);
      assert.ok(!store.get().tasks.some((t) => t.text === "Zahnarzt anrufen"));
    });

    console.log("Fenster");

    await check("Reiter schalten die Ansichten um", async () => {
      await clickByText(win, ".tab", "Archiv");
      await wait(150);
      assert.strictEqual(await val(win, "document.getElementById('view-Archiv').hidden"), false);
      assert.strictEqual(await val(win, "document.getElementById('view-Planung').hidden"), true);
      assert.ok((await val(win, "document.querySelectorAll('.archive .group').length")) >= 4);
    });

    await check("Einstellungen: Kategorie anlegen und Schalter kippen", async () => {
      await clickByText(win, ".tab", "Einstellungen");
      await wait(150);
      await typeAndEnter(win, ".cat-new input", "Studio");
      await wait(200);
      assert.ok(store.get().settings.categories.indexOf("Studio") >= 0);
      assert.strictEqual(
        await val(popover, "[...document.querySelectorAll('.chip')].some(c => c.textContent === 'Studio')"),
        true,
        "neue Kategorie erscheint sofort im Popover"
      );

      await js(win, "document.querySelectorAll('.switch')[2].click(); return true;");
      await wait(200);
      assert.strictEqual(store.get().settings.showProgress, false);
      assert.strictEqual(await val(popover, "document.getElementById('progress').hidden"), true);
    });

    await check("Wochenfeld: Optionen erst nach Texteingabe sichtbar", async () => {
      await clickByText(win, ".tab", "Planung");
      await wait(150);
      assert.strictEqual(await val(win, "document.getElementById('backlogOptions').hidden"), true);
      await typeOnly(win, "#backlogDraft", "Vorschau");
      await wait(80);
      assert.strictEqual(await val(win, "document.getElementById('backlogOptions').hidden"), false);
      await typeOnly(win, "#backlogDraft", "");
      await wait(80);
      assert.strictEqual(await val(win, "document.getElementById('backlogOptions').hidden"), true);
    });

    await check("Wochenliste: Kategorie/Priorität wählen, hinzufügen, nach heute holen", async () => {
      await typeOnly(win, "#backlogDraft", "Wocheneintrag");
      await wait(80);
      await clickByText(win, "#backlogChips .chip", "Admin");
      await clickByText(win, "#backlogPrios .seg", "Hoch");
      await wait(100);
      await typeAndEnter(win, "#backlogDraft", "Wocheneintrag");
      await wait(200);
      const task = store.get().tasks.find((t) => t.text === "Wocheneintrag");
      assert.ok(task, "Aufgabe im Store");
      assert.strictEqual(task.bucket, "Woche");
      assert.strictEqual(task.cat, "Admin");
      assert.strictEqual(task.prio, "Hoch");
      assert.strictEqual(await val(win, "document.getElementById('backlogOptions').hidden"), true, "klappt nach dem Absenden wieder zu");

      await clickInRow(win, ".task-backlog", "Wocheneintrag", ".to-today");
      await wait(200);
      assert.strictEqual(store.get().tasks.find((t) => t.id === task.id).bucket, "Heute");
    });

    await check("Wochenliste: Aufgabe löschen", async () => {
      await typeAndEnter(win, "#backlogDraft", "Löschmich");
      await wait(200);
      const before = store.get().tasks.length;
      await clickInRow(win, ".task-backlog", "Löschmich", ".delete-btn");
      await wait(200);
      assert.strictEqual(store.get().tasks.length, before - 1);
    });

    await check("Archiv: erledigte Aufgabe wieder öffnen", async () => {
      await clickByText(win, ".tab", "Archiv");
      await wait(150);
      const before = store.get().tasks.filter((t) => t.done).length;
      await js(win, "document.querySelector('.archive-dot').click(); return true;");
      await wait(200);
      assert.strictEqual(store.get().tasks.filter((t) => t.done).length, before - 1);
    });

    await check("Archiv: Eintrag endgültig löschen", async () => {
      await wait(100);
      const before = store.get().tasks.length;
      await js(win, "document.querySelector('.archive .delete-btn').click(); return true;");
      await wait(200);
      assert.strictEqual(store.get().tasks.length, before - 1);
    });

    await check("Einstellungen: Update-Karte prüft und zeigt Ergebnis", async () => {
      await clickByText(win, ".tab", "Einstellungen");
      await wait(150);
      assert.ok((await val(win, "document.getElementById('updateCard').textContent")).indexOf("Version") >= 0);
      await js(
        win,
        "[...document.querySelectorAll('#updateCard button')].find(b => b.textContent.indexOf('Nach Updates') === 0).click(); return true;"
      );
      await wait(150);
      assert.strictEqual(store.get().updateStatus.updateAvailable, true);
      assert.ok((await val(win, "document.getElementById('updateCard').textContent")).indexOf("Update verfügbar") >= 0);
    });

    await check("Einstellungen: Zugriffstoken und Projektordner werden gespeichert", async () => {
      await typeAndEnter(win, ".update-field input[type=password]", "ghp_test123");
      await wait(150);
      assert.strictEqual(store.get().settings.updateToken, "ghp_test123");
      await typeAndEnter(win, ".update-field input[type=text]", "/tmp/MeinToDoBar");
      await wait(150);
      assert.strictEqual(store.get().settings.repoPath, "/tmp/MeinToDoBar");
    });

    await check("Einstellungen: Update installieren zeigt Live-Log im Hintergrund", async () => {
      await js(
        win,
        "[...document.querySelectorAll('#updateCard button')].find(b => b.textContent === 'Update installieren').click(); return true;"
      );
      await wait(30);
      assert.strictEqual(
        await val(win, "[...document.querySelectorAll('#updateCard button')].find(b => b.textContent.indexOf('Installiere') === 0)?.disabled"),
        true,
        "Knopf sperrt sich sofort, kein Doppelklick möglich"
      );
      await wait(100);
      assert.ok(
        (await val(win, "document.getElementById('updateCard').textContent")).indexOf("git pull") >= 0,
        "Log-Ausgabe kommt live an"
      );
    });

    console.log("Speichern");

    await check("Zustand liegt auf der Platte", async () => {
      store.flush();
      const saved = JSON.parse(fs.readFileSync(path.join(PROFILE, "todo.json"), "utf8"));
      assert.ok(saved.tasks.some((t) => t.text === "Testaufgabe"));
      assert.strictEqual(saved.settings.showProgress, false);
    });

    console.log("\n" + passed + " Prüfungen bestanden.");
  } catch (err) {
    console.error("\nFEHLGESCHLAGEN nach " + passed + " Prüfungen:\n" + (err && err.stack ? err.stack : err));
    process.exitCode = 1;
  }

  fs.rmSync(PROFILE, { recursive: true, force: true });
  app.quit();
});

app.on("window-all-closed", () => app.quit());
