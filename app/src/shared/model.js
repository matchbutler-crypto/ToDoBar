/**
 * Reine Zustandslogik — kein DOM, kein Electron.
 * Main-Prozess nutzt defaultState/rollover/reduce, die Renderer nutzen derive().
 */
(function (root, factory) {
  const Dates = typeof module === "object" && module.exports ? require("./dates.js") : root.Dates;
  const api = factory(Dates);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Model = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Dates) {
  const PRIOS = ["Hoch", "Mittel", "Niedrig"];
  const RANK = { Hoch: 0, Mittel: 1, Niedrig: 2 };
  const REPEATS = ["Einmalig", "Täglich", "Wöchentlich"];
  const BUCKETS = ["Heute", "Woche"];
  const TABS = ["Planung", "Archiv", "Einstellungen"];
  const DEFAULT_CATS = ["CESA", "Admin", "Privat", "Deep Work"];

  function defaultState() {
    return {
      version: 1,
      nextId: 1,
      lastSeenDay: Dates.todayKey(),
      settings: {
        categories: DEFAULT_CATS.slice(),
        markCarried: true,
        autoRollover: true,
        showProgress: true,
        updateToken: "",
        repoPath: "~/ToDoBar"
      },
      updateStatus: {
        checking: false,
        checkedAt: null,
        currentVersion: null,
        latestVersion: null,
        updateAvailable: false,
        error: null
      },
      tasks: []
    };
  }

  function makeTask(state, fields) {
    const today = Dates.todayKey();
    return Object.assign(
      {
        id: state.nextId,
        text: "",
        cat: state.settings.categories[0] || "",
        prio: "Mittel",
        bucket: "Heute",
        repeat: "Einmalig",
        done: false,
        carried: 0,
        day: today,
        doneDay: null,
        note: "",
        subs: []
      },
      fields
    );
  }

  /**
   * Wie viele Tage läuft die Aufgabe schon mit.
   * Bei aktiviertem Auto-Übertrag steckt das bereits in `carried`; ist er aus,
   * bleibt `day` in der Vergangenheit stehen und die Differenz kommt live dazu.
   * So stimmt die Anzeige in beiden Schalterstellungen.
   */
  function effectiveCarried(t, today) {
    if (t.done || t.bucket !== "Heute" || !t.day) return t.carried || 0;
    const diff = Dates.daysBetween(t.day, today);
    return (t.carried || 0) + (diff > 0 ? diff : 0);
  }

  /**
   * Tageswechsel: offene Aufgaben von gestern wandern auf heute und zählen hoch.
   * Gibt einen neuen State zurück oder null, wenn nichts zu tun war.
   */
  function rollover(state, today) {
    const day = today || Dates.todayKey();
    if (state.lastSeenDay === day) return null;
    if (!state.settings.autoRollover) {
      return Object.assign({}, state, { lastSeenDay: day });
    }
    const tasks = state.tasks.map((t) => {
      if (t.done || t.bucket !== "Heute" || !t.day) return t;
      const diff = Dates.daysBetween(t.day, day);
      if (diff <= 0) return t;
      return Object.assign({}, t, { day: day, carried: (t.carried || 0) + diff });
    });
    return Object.assign({}, state, { tasks: tasks, lastSeenDay: day });
  }

  function nextOccurrence(dayKey, repeat) {
    if (repeat === "Täglich") return Dates.addDays(dayKey, 1);
    if (repeat === "Wöchentlich") return Dates.addDays(dayKey, 7);
    return null;
  }

  /** Aktionen aus den Renderern. Gibt immer einen neuen State zurück. */
  function reduce(state, action) {
    const today = Dates.todayKey();
    const s = Object.assign({}, state, { settings: Object.assign({}, state.settings), tasks: state.tasks.slice() });
    const mapTask = (id, fn) => {
      s.tasks = s.tasks.map((t) => (t.id === id ? fn(t) : t));
    };

    switch (action.type) {
      case "add": {
        const text = String(action.text || "").trim();
        if (!text) return state;
        const bucket = BUCKETS.indexOf(action.bucket) >= 0 ? action.bucket : "Heute";
        s.tasks = s.tasks.concat([
          makeTask(s, {
            text: text,
            cat: s.settings.categories.indexOf(action.cat) >= 0 ? action.cat : s.settings.categories[0] || "",
            prio: RANK[action.prio] !== undefined ? action.prio : "Mittel",
            repeat: REPEATS.indexOf(action.repeat) >= 0 ? action.repeat : "Einmalig",
            bucket: bucket,
            day: bucket === "Heute" ? today : null
          })
        ]);
        s.nextId = s.nextId + 1;
        return s;
      }

      case "toggle": {
        const task = s.tasks.find((t) => t.id === action.id);
        if (!task) return state;
        const done = !task.done;
        mapTask(action.id, (t) =>
          Object.assign({}, t, {
            done: done,
            doneDay: done ? today : null,
            // Beim Abhaken den mitgelaufenen Zähler festschreiben, damit das Archiv stimmt.
            carried: done ? effectiveCarried(t, today) : t.carried
          })
        );
        if (done && task.repeat !== "Einmalig") {
          const next = nextOccurrence(task.day || today, task.repeat);
          s.tasks = s.tasks.concat([
            makeTask(s, {
              text: task.text,
              cat: task.cat,
              prio: task.prio,
              repeat: task.repeat,
              bucket: "Heute",
              day: next,
              note: task.note,
              subs: (task.subs || []).map((v) => ({ text: v.text, done: false })),
              spawnedFrom: task.id
            })
          ]);
          s.nextId = s.nextId + 1;
        }
        if (!done) {
          // Wieder aufgemacht: die noch unangetastete Folgeaufgabe zurücknehmen.
          s.tasks = s.tasks.filter(
            (t) => !(t.spawnedFrom === action.id && !t.done && (t.subs || []).every((v) => !v.done))
          );
        }
        return s;
      }

      case "edit": {
        const task = s.tasks.find((t) => t.id === action.id);
        if (!task) return state;
        const text = String(action.text || "").trim();
        if (!text) return state;
        mapTask(action.id, (t) =>
          Object.assign({}, t, {
            text: text,
            cat: s.settings.categories.indexOf(action.cat) >= 0 ? action.cat : t.cat,
            prio: RANK[action.prio] !== undefined ? action.prio : t.prio,
            repeat: REPEATS.indexOf(action.repeat) >= 0 ? action.repeat : t.repeat,
            note: action.note !== undefined ? String(action.note).trim() : t.note
          })
        );
        return s;
      }

      case "toggleSub":
        mapTask(action.id, (t) =>
          Object.assign({}, t, {
            subs: t.subs.map((v, i) => (i === action.index ? { text: v.text, done: !v.done } : v))
          })
        );
        return s;

      case "toToday":
        mapTask(action.id, (t) => Object.assign({}, t, { bucket: "Heute", day: today }));
        return s;

      case "remove":
        s.tasks = s.tasks.filter((t) => t.id !== action.id);
        return s;

      case "setUpdateToken":
        s.settings.updateToken = String(action.token || "").trim();
        return s;

      case "setRepoPath": {
        const value = String(action.path || "").trim();
        s.settings.repoPath = value || "~/ToDoBar";
        return s;
      }

      case "setUpdateStatus":
        s.updateStatus = Object.assign({}, state.updateStatus, action.status || {});
        return s;

      case "addCategory": {
        const name = String(action.name || "").trim();
        if (!name || s.settings.categories.indexOf(name) >= 0) return state;
        s.settings.categories = s.settings.categories.concat([name]);
        return s;
      }

      case "removeCategory": {
        const left = s.settings.categories.filter((c) => c !== action.name);
        if (left.length === s.settings.categories.length) return state;
        s.settings.categories = left;
        return s;
      }

      case "setSetting": {
        if (!(action.key in s.settings) || typeof s.settings[action.key] !== "boolean") return state;
        s.settings[action.key] = !!action.value;
        return s;
      }

      default:
        return state;
    }
  }

  /** Rohzustand → alles, was die Oberfläche anzeigt. */
  function derive(state, todayArg) {
    const today = todayArg || Dates.todayKey();
    const mark = state.settings.markCarried;

    const decorate = (t) => {
      const carried = effectiveCarried(t, today);
      const doneSubs = (t.subs || []).filter((v) => v.done).length;
      return Object.assign({}, t, {
        carriedDays: carried,
        showCarried: mark && carried > 0 && !t.done,
        carriedLabel: "+" + carried + (carried === 1 ? " Tag" : " Tage"),
        repeats: t.repeat !== "Einmalig",
        hasSubs: (t.subs || []).length > 0,
        subLabel: doneSubs + " / " + (t.subs || []).length,
        isHigh: t.prio === "Hoch" && !t.done,
        canExpand: !!t.note || (t.subs || []).length > 0
      });
    };

    const sorted = (list) =>
      list
        .slice()
        .sort(
          (a, b) =>
            a.done - b.done ||
            RANK[a.prio] - RANK[b.prio] ||
            b.carriedDays - a.carriedDays ||
            a.id - b.id
        );

    const all = state.tasks.map(decorate);

    // "Heute" zeigt alles, was auf heute oder früher fällig ist — plus was heute
    // schon erledigt wurde. Wiederkehrende Aufgaben in der Zukunft bleiben außen vor.
    const today_ = sorted(
      all.filter(
        (t) =>
          t.bucket === "Heute" &&
          ((!t.done && t.day && Dates.daysBetween(t.day, today) >= 0) || (t.done && t.doneDay === today))
      )
    );
    const backlog = sorted(all.filter((t) => t.bucket === "Woche" && !t.done));
    const archived = all.filter((t) => t.done && t.doneDay).sort((a, b) => (a.doneDay < b.doneDay ? 1 : -1));

    const dayKeys = [];
    archived.forEach((t) => {
      if (dayKeys.indexOf(t.doneDay) < 0) dayKeys.push(t.doneDay);
    });

    const doneToday = today_.filter((t) => t.done).length;
    const openToday = today_.filter((t) => !t.done).length;

    return {
      today: today_,
      backlog: backlog,
      archiveGroups: dayKeys.map((key) => ({
        key: key,
        label: Dates.archiveLabel(key, today),
        tasks: archived.filter((t) => t.doneDay === key)
      })),
      todayLabel: Dates.short(today),
      doneToday: doneToday,
      openToday: openToday,
      todayTotal: today_.length,
      progressLabel: doneToday + " / " + today_.length,
      progressPct: today_.length ? Math.round((doneToday / today_.length) * 100) : 0,
      backlogCount: backlog.length,
      carriedCount: all.filter((t) => !t.done && t.carriedDays > 0).length,
      archivedCount: archived.length,
      categoryCounts: state.settings.categories.map((name) => ({
        name: name,
        count: all.filter((t) => t.cat === name && !t.done).length
      })),
      counts: {
        Planung: openToday + backlog.length,
        Archiv: archived.length,
        Einstellungen: ""
      }
    };
  }

  return {
    PRIOS: PRIOS,
    RANK: RANK,
    REPEATS: REPEATS,
    BUCKETS: BUCKETS,
    TABS: TABS,
    DEFAULT_CATS: DEFAULT_CATS,
    defaultState: defaultState,
    effectiveCarried: effectiveCarried,
    rollover: rollover,
    reduce: reduce,
    derive: derive
  };
});
