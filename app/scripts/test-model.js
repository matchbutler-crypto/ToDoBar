"use strict";

/** Kurze Prüfungen der Zustandslogik: node scripts/test-model.js */

const assert = require("assert");
const Model = require("../src/shared/model.js");
const Dates = require("../src/shared/dates.js");
const Update = require("../src/main/update.js");

const today = Dates.todayKey();
const yesterday = Dates.addDays(today, -1);
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log("  ✓ " + name);
}

function withTasks(tasks, settings) {
  const base = Model.defaultState();
  return Object.assign({}, base, {
    nextId: tasks.length + 1,
    settings: Object.assign(base.settings, settings || {}),
    tasks: tasks.map((t, i) => Object.assign({ id: i + 1, cat: "CESA", prio: "Mittel", bucket: "Heute", repeat: "Einmalig", done: false, carried: 0, day: today, doneDay: null, note: "", subs: [] }, t))
  });
}

console.log("Datumsformate");

test("kurz und lang in deutscher Schreibweise", () => {
  assert.strictEqual(Dates.short("2026-09-10"), "Do 10. Sep");
  assert.strictEqual(Dates.longLabel("2026-09-07"), "Montag · 07. Sep");
  assert.strictEqual(Dates.archiveLabel(today, today), "Heute · " + Dates.short(today));
});

test("Tagesdifferenz über einen Monatswechsel", () => {
  assert.strictEqual(Dates.daysBetween("2026-08-31", "2026-09-02"), 2);
  assert.strictEqual(Dates.addDays("2026-12-31", 1), "2027-01-01");
});

console.log("Übertrag");

test("offene Aufgaben von gestern wandern auf heute und zählen hoch", () => {
  const state = Object.assign(withTasks([{ text: "A", day: yesterday, carried: 1 }]), { lastSeenDay: yesterday });
  const next = Model.rollover(state, today);
  assert.strictEqual(next.tasks[0].day, today);
  assert.strictEqual(next.tasks[0].carried, 2);
});

test("erledigte Aufgaben bleiben auf ihrem Tag stehen", () => {
  const state = Object.assign(
    withTasks([{ text: "A", day: yesterday, done: true, doneDay: yesterday }]),
    { lastSeenDay: yesterday }
  );
  const next = Model.rollover(state, today);
  assert.strictEqual(next.tasks[0].day, yesterday);
});

test("ohne Auto-Übertrag bleibt der Tag stehen, die Anzeige stimmt trotzdem", () => {
  const state = Object.assign(withTasks([{ text: "A", day: yesterday }], { autoRollover: false }), {
    lastSeenDay: yesterday
  });
  const next = Model.rollover(state, today);
  assert.strictEqual(next.tasks[0].day, yesterday);
  const view = Model.derive(next, today);
  assert.strictEqual(view.today.length, 1, "überfällige Aufgabe bleibt sichtbar");
  assert.strictEqual(view.today[0].carriedLabel, "+1 Tag");
});

test("am selben Tag passiert nichts", () => {
  assert.strictEqual(Model.rollover(withTasks([{ text: "A" }]), today), null);
});

console.log("Aufgaben");

test("hinzufügen respektiert Kategorie, Priorität und Ziel", () => {
  const next = Model.reduce(Model.defaultState(), {
    type: "add", text: "  Neu  ", cat: "Admin", prio: "Hoch", bucket: "Woche", repeat: "Wöchentlich"
  });
  assert.strictEqual(next.tasks.length, 1);
  assert.deepStrictEqual(
    [next.tasks[0].text, next.tasks[0].cat, next.tasks[0].prio, next.tasks[0].bucket, next.tasks[0].day],
    ["Neu", "Admin", "Hoch", "Woche", null]
  );
});

test("leerer Text legt nichts an", () => {
  const base = Model.defaultState();
  assert.strictEqual(Model.reduce(base, { type: "add", text: "   " }), base);
});

test("abhaken schreibt den Erledigt-Tag und friert den Übertrag ein", () => {
  const state = withTasks([{ text: "A", day: yesterday, carried: 1 }], { autoRollover: false });
  const next = Model.reduce(state, { type: "toggle", id: 1 });
  assert.strictEqual(next.tasks[0].done, true);
  assert.strictEqual(next.tasks[0].doneDay, today);
  assert.strictEqual(next.tasks[0].carried, 2, "1 gespeichert + 1 Tag mitgelaufen");
});

test("wiederkehrende Aufgabe erzeugt beim Abhaken die nächste", () => {
  const state = withTasks([{ text: "Newsletter", repeat: "Wöchentlich", subs: [{ text: "x", done: true }] }]);
  const next = Model.reduce(state, { type: "toggle", id: 1 });
  assert.strictEqual(next.tasks.length, 2);
  const spawn = next.tasks[1];
  assert.strictEqual(spawn.day, Dates.addDays(today, 7));
  assert.strictEqual(spawn.done, false);
  assert.strictEqual(spawn.subs[0].done, false, "Unteraufgaben starten wieder offen");
});

test("wieder aufmachen nimmt die unangetastete Folgeaufgabe zurück", () => {
  const state = withTasks([{ text: "Täglich", repeat: "Täglich" }]);
  const done = Model.reduce(state, { type: "toggle", id: 1 });
  assert.strictEqual(done.tasks.length, 2);
  const undone = Model.reduce(done, { type: "toggle", id: 1 });
  assert.strictEqual(undone.tasks.length, 1);
});

test("Folgeaufgabe von morgen taucht nicht schon heute auf", () => {
  const state = withTasks([{ text: "Täglich", repeat: "Täglich" }]);
  const next = Model.reduce(state, { type: "toggle", id: 1 });
  const view = Model.derive(next, today);
  assert.strictEqual(view.today.length, 1);
  assert.strictEqual(view.openToday, 0);
});

test("aus der Woche nach heute holen", () => {
  const state = withTasks([{ text: "A", bucket: "Woche", day: null }]);
  const next = Model.reduce(state, { type: "toToday", id: 1 });
  assert.strictEqual(next.tasks[0].bucket, "Heute");
  assert.strictEqual(next.tasks[0].day, today);
});

test("Aufgabe löschen entfernt genau diesen Eintrag", () => {
  const state = withTasks([{ text: "bleibt" }, { text: "weg" }]);
  const next = Model.reduce(state, { type: "remove", id: 2 });
  assert.deepStrictEqual(next.tasks.map((t) => t.text), ["bleibt"]);
});

console.log("Kategorien und Schalter");

test("Kategorie anlegen und entfernen, Duplikate werden ignoriert", () => {
  let s = Model.reduce(Model.defaultState(), { type: "addCategory", name: "Studio" });
  assert.ok(s.settings.categories.indexOf("Studio") >= 0);
  assert.strictEqual(Model.reduce(s, { type: "addCategory", name: "Studio" }), s);
  s = Model.reduce(s, { type: "removeCategory", name: "Admin" });
  assert.strictEqual(s.settings.categories.indexOf("Admin"), -1);
});

test("Schalter kippen nur bekannte Einstellungen", () => {
  const s = Model.reduce(Model.defaultState(), { type: "setSetting", key: "showProgress", value: false });
  assert.strictEqual(s.settings.showProgress, false);
  const base = Model.defaultState();
  assert.strictEqual(Model.reduce(base, { type: "setSetting", key: "categories", value: true }), base);
});

console.log("Ableitung");

test("Sortierung: offen vor erledigt, dann Priorität, dann Übertrag", () => {
  const state = withTasks([
    { text: "erledigt", done: true, doneDay: today },
    { text: "niedrig", prio: "Niedrig" },
    { text: "hoch", prio: "Hoch" },
    { text: "hoch alt", prio: "Hoch", carried: 3 }
  ]);
  const view = Model.derive(state, today);
  assert.deepStrictEqual(view.today.map((t) => t.text), ["hoch alt", "hoch", "niedrig", "erledigt"]);
  assert.strictEqual(view.progressLabel, "1 / 4");
  assert.strictEqual(view.progressPct, 25);
});

test("Zähler für Seitenleiste, Archiv und Übertrag", () => {
  const state = withTasks([
    { text: "heute offen" },
    { text: "heute alt", day: yesterday },
    { text: "woche", bucket: "Woche", day: null },
    { text: "gestern fertig", done: true, doneDay: yesterday, day: yesterday }
  ], { autoRollover: false });
  const view = Model.derive(state, today);
  assert.strictEqual(view.counts.Planung, 3);
  assert.strictEqual(view.counts.Archiv, 1);
  assert.strictEqual(view.carriedCount, 1);
  assert.strictEqual(view.backlogCount, 1);
  assert.strictEqual(view.archiveGroups.length, 1);
  assert.strictEqual(view.archiveGroups[0].label, Dates.longLabel(yesterday));
});

test("Übertrag ausblenden lässt den Zähler unangetastet", () => {
  const state = withTasks([{ text: "A", carried: 2 }], { markCarried: false });
  const view = Model.derive(state, today);
  assert.strictEqual(view.today[0].showCarried, false);
  assert.strictEqual(view.today[0].carriedDays, 2);
});

console.log("Update-Check");

test("Versionsvergleich erkennt neuer/gleich/älter", () => {
  assert.ok(Update.compareVersions("1.2.0", "1.1.9") > 0);
  assert.strictEqual(Update.compareVersions("1.2.0", "1.2.0"), 0);
  assert.ok(Update.compareVersions("1.1.0", "1.2.0") < 0);
  assert.ok(Update.compareVersions("1.2", "1.2.0") === 0, "fehlende Nachkommastellen zählen als 0");
});

test("Zustand für Einstellungen enthält Token und Update-Status", () => {
  const s = Model.defaultState();
  assert.strictEqual(s.settings.updateToken, "");
  assert.strictEqual(s.updateStatus.updateAvailable, false);
  const withToken = Model.reduce(s, { type: "setUpdateToken", token: "  ghp_abc  " });
  assert.strictEqual(withToken.settings.updateToken, "ghp_abc");
  const withStatus = Model.reduce(s, {
    type: "setUpdateStatus",
    status: { checking: false, updateAvailable: true, latestVersion: "1.2.0" }
  });
  assert.strictEqual(withStatus.updateStatus.updateAvailable, true);
  assert.strictEqual(withStatus.updateStatus.latestVersion, "1.2.0");
});

console.log("\n" + passed + " Prüfungen bestanden.");
