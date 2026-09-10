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

    await check("Kategorie und Priorität lassen sich wählen", async () => {
      await clickByText(popover, ".chip", "Privat");
      await clickByText(popover, "#prios .seg", "Hoch");
      await wait(120);
      assert.strictEqual(await val(popover, "document.querySelector('.chip.is-on').textContent"), "Privat");
      assert.strictEqual(await val(popover, "document.querySelector('#prios .seg.is-on').textContent"), "Hoch");
    });

    await check("Eintrag über die Eingabetaste landet im Store", async () => {
      await typeAndEnter(popover, "#draft", "Testaufgabe");
      await wait(200);
      const added = store.get().tasks.find((t) => t.text === "Testaufgabe");
      assert.ok(added, "Aufgabe im Store");
      assert.strictEqual(added.cat, "Privat");
      assert.strictEqual(added.prio, "Hoch");
      assert.strictEqual(await val(popover, "document.getElementById('draft').value"), "");
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
      await clickByText(popover, ".can-expand", "AW26");
      await wait(150);
      assert.strictEqual(await val(popover, "document.querySelectorAll('.task-popover .details .sub').length"), 2);
      assert.ok((await val(popover, "document.querySelector('.details .note').textContent")).indexOf("34 Frames") > 0);
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

    await check("Wochenliste: Eintrag hinzufügen und nach heute holen", async () => {
      await clickByText(win, ".tab", "Planung");
      await wait(150);
      await typeAndEnter(win, "#backlogDraft", "Wocheneintrag");
      await wait(200);
      const task = store.get().tasks.find((t) => t.text === "Wocheneintrag");
      assert.strictEqual(task.bucket, "Woche");
      await clickInRow(win, ".task-backlog", "Wocheneintrag", ".to-today");
      await wait(200);
      assert.strictEqual(store.get().tasks.find((t) => t.id === task.id).bucket, "Heute");
    });

    await check("Archiv: erledigte Aufgabe wieder öffnen", async () => {
      await clickByText(win, ".tab", "Archiv");
      await wait(150);
      const before = store.get().tasks.filter((t) => t.done).length;
      await js(win, "document.querySelector('.archive-dot').click(); return true;");
      await wait(200);
      assert.strictEqual(store.get().tasks.filter((t) => t.done).length, before - 1);
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
