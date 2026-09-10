"use strict";

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const Model = require("../shared/model.js");
const Dates = require("../shared/dates.js");
const sample = require("./sampleData.js");

const FILE = "todo.json";

class Store {
  constructor(opts) {
    this.file = path.join(app.getPath("userData"), FILE);
    this.listeners = new Set();
    this.writeTimer = null;
    this.state = this.load(opts && opts.demo);
  }

  load(demo) {
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") console.error("[store] konnte " + this.file + " nicht lesen:", err.message);
    }

    let state;
    if (raw && Array.isArray(raw.tasks)) {
      state = Object.assign(Model.defaultState(), raw, {
        settings: Object.assign(Model.defaultState().settings, raw.settings || {})
      });
    } else {
      state = Model.defaultState();
      if (demo) state = sample.seed(state);
    }

    const rolled = Model.rollover(state, Dates.todayKey());
    if (rolled) {
      state = rolled;
      this.persist(state);
    }
    return state;
  }

  get() {
    return this.state;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => {
      try {
        fn(this.state);
      } catch (err) {
        console.error("[store] Listener-Fehler:", err);
      }
    });
  }

  dispatch(action) {
    const next = Model.reduce(this.state, action);
    if (next === this.state) return this.state;
    this.state = next;
    this.schedulePersist();
    this.emit();
    return this.state;
  }

  /** Tageswechsel prüfen; true, wenn tatsächlich übertragen wurde. */
  checkRollover() {
    const rolled = Model.rollover(this.state, Dates.todayKey());
    if (!rolled) return false;
    this.state = rolled;
    this.schedulePersist();
    this.emit();
    return true;
  }

  schedulePersist() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.persist(this.state);
    }, 250);
  }

  flush() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.persist(this.state);
  }

  /** Erst in eine Temp-Datei, dann umbenennen — ein Absturz mittendrin darf die Liste nicht zerlegen. */
  persist(state) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error("[store] Speichern fehlgeschlagen:", err.message);
    }
  }
}

module.exports = Store;
