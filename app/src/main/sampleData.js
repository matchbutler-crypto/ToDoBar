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
      text: "AW26 Lookbook — Bildauswahl finalisieren",
      cat: "CESA", prio: "Hoch", bucket: "Heute", done: false, carried: 2, repeat: "Einmalig", day: today,
      note: "Auswahl mit Studio abgestimmt, 34 Frames im Ordner. Entscheidung heute, Layout wartet.",
      subs: [{ text: "Zweitauswahl markieren", done: true }, { text: "Retusche-Briefing schreiben", done: false }]
    },
    { text: "Porto: Stoffmuster 380 gsm nachfassen", cat: "CESA", prio: "Hoch", bucket: "Heute", done: false, carried: 0, repeat: "Einmalig", day: today, note: "", subs: [] },
    { text: "Rechnungen August ablegen", cat: "Admin", prio: "Niedrig", bucket: "Heute", done: true, carried: 0, repeat: "Wöchentlich", day: today, doneDay: today, note: "", subs: [] },
    {
      text: "Produkttexte Hoodie schreiben",
      cat: "Deep Work", prio: "Mittel", bucket: "Heute", done: false, carried: 1, repeat: "Einmalig", day: today,
      note: "Material, Herkunft, Passform. Keine Adjektive ohne Zahl.",
      subs: [{ text: "Rohfassung", done: false }, { text: "Gegenlesen lassen", done: false }]
    },
    { text: "Zahnarzt anrufen", cat: "Privat", prio: "Mittel", bucket: "Heute", done: false, carried: 0, repeat: "Einmalig", day: today, note: "", subs: [] },
    { text: "Hangtag-Druck freigeben", cat: "CESA", prio: "Hoch", bucket: "Woche", done: false, carried: 0, repeat: "Einmalig", day: null, note: "", subs: [] },
    { text: "Saisonplanung SS27 skizzieren", cat: "Deep Work", prio: "Mittel", bucket: "Woche", done: false, carried: 0, repeat: "Einmalig", day: null, note: "", subs: [] },
    { text: "Newsletter #15 vorbereiten", cat: "CESA", prio: "Mittel", bucket: "Woche", done: false, carried: 0, repeat: "Wöchentlich", day: null, note: "", subs: [] },
    { text: "Lager sortieren", cat: "Admin", prio: "Niedrig", bucket: "Woche", done: false, carried: 0, repeat: "Einmalig", day: null, note: "", subs: [] },
    { text: "Casting-Shortlist durchgehen", cat: "CESA", prio: "Mittel", bucket: "Heute", done: true, carried: 0, repeat: "Einmalig", day: back(1), doneDay: back(1), note: "", subs: [] },
    { text: "Steuerberater Unterlagen", cat: "Admin", prio: "Hoch", bucket: "Heute", done: true, carried: 0, repeat: "Einmalig", day: back(2), doneDay: back(2), note: "", subs: [] },
    { text: "Newsletter #14 gegenlesen", cat: "CESA", prio: "Mittel", bucket: "Heute", done: true, carried: 0, repeat: "Einmalig", day: back(3), doneDay: back(3), note: "", subs: [] }
  ];

  return Object.assign({}, state, {
    nextId: tasks.length + 1,
    tasks: tasks.map((t, i) => Object.assign({ id: i + 1, doneDay: null, spawnedFrom: null }, t))
  });
}

module.exports = { seed: seed };
