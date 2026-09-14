"use strict";

/**
 * Beispieldaten aus dem Design-Prototyp — nur für `npm run demo` beim ersten Start.
 * Der normale Start beginnt mit einer leeren Liste.
 */
const Dates = require("../shared/dates.js");

function seed(state) {
  const today = Dates.todayKey();
  const back = (n) => Dates.addDays(today, -n);

  const tasks = [
    {
      text: "Projekt A — Auswahl finalisieren",
      cat: "CESA", prio: "Hoch", bucket: "Heute", done: false, carried: 2, repeat: "Einmalig", day: today,
      note: "Abstimmung erledigt, Unterlagen abgelegt. Entscheidung heute, nächster Schritt wartet.",
      subs: [{ text: "Zwischenstand markieren", done: true }, { text: "Briefing schreiben", done: false }]
    },
    { text: "Lieferant: Bestellung nachfassen", cat: "CESA", prio: "Hoch", bucket: "Heute", done: false, carried: 0, repeat: "Einmalig", day: today, note: "", subs: [] },
    { text: "Rechnungen ablegen", cat: "Admin", prio: "Niedrig", bucket: "Heute", done: true, carried: 0, repeat: "Wöchentlich", day: today, doneDay: today, note: "", subs: [] },
    {
      text: "Texte schreiben",
      cat: "Deep Work", prio: "Mittel", bucket: "Heute", done: false, carried: 1, repeat: "Einmalig", day: today,
      note: "Kurz und klar halten.",
      subs: [{ text: "Rohfassung", done: false }, { text: "Gegenlesen lassen", done: false }]
    },
    { text: "Zahnarzt anrufen", cat: "Privat", prio: "Mittel", bucket: "Heute", done: false, carried: 0, repeat: "Einmalig", day: today, note: "", subs: [] },
    { text: "Freigabe erteilen", cat: "CESA", prio: "Hoch", bucket: "Woche", done: false, carried: 0, repeat: "Einmalig", day: null, note: "", subs: [] },
    { text: "Planung skizzieren", cat: "Deep Work", prio: "Mittel", bucket: "Woche", done: false, carried: 0, repeat: "Einmalig", day: null, note: "", subs: [] },
    { text: "Newsletter vorbereiten", cat: "CESA", prio: "Mittel", bucket: "Woche", done: false, carried: 0, repeat: "Wöchentlich", day: null, note: "", subs: [] },
    { text: "Lager sortieren", cat: "Admin", prio: "Niedrig", bucket: "Woche", done: false, carried: 0, repeat: "Einmalig", day: null, note: "", subs: [] },
    { text: "Shortlist durchgehen", cat: "CESA", prio: "Mittel", bucket: "Heute", done: true, carried: 0, repeat: "Einmalig", day: back(1), doneDay: back(1), note: "", subs: [] },
    { text: "Steuerberater Unterlagen", cat: "Admin", prio: "Hoch", bucket: "Heute", done: true, carried: 0, repeat: "Einmalig", day: back(2), doneDay: back(2), note: "", subs: [] },
    { text: "Newsletter gegenlesen", cat: "CESA", prio: "Mittel", bucket: "Heute", done: true, carried: 0, repeat: "Einmalig", day: back(3), doneDay: back(3), note: "", subs: [] }
  ];

  return Object.assign({}, state, {
    nextId: tasks.length + 1,
    tasks: tasks.map((t, i) => Object.assign({ id: i + 1, doneDay: null, spawnedFrom: null }, t))
  });
}

module.exports = { seed: seed };
