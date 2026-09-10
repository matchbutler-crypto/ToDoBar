/* Fenster: Planung, Archiv, Einstellungen. */
(function () {
  "use strict";

  const h = UI.h;
  const $ = (id) => document.getElementById(id);

  const els = {
    tabs: $("tabs"),
    tabTitle: $("tabTitle"),
    toolbarMeta: $("toolbarMeta"),
    todayMeta: $("todayMeta"),
    weekMeta: $("weekMeta"),
    progress: $("progress"),
    progressBar: $("progress").querySelector("i"),
    todayList: $("todayList"),
    backlogList: $("backlogList"),
    backlogDraft: $("backlogDraft"),
    backlogOptions: $("backlogOptions"),
    backlogChips: $("backlogChips"),
    backlogPrios: $("backlogPrios"),
    backlogRepeats: $("backlogRepeats"),
    archive: $("view-Archiv"),
    catCard: $("catCard"),
    switchCard: $("switchCard"),
    updateCard: $("updateCard")
  };

  const ui = {
    tab: "Planung",
    expanded: null,
    backlog: { cat: null, prio: "Mittel", repeat: "Einmalig" }
  };
  let state = null;

  const dispatch = (action) => window.todo.dispatch(action);

  const actions = {
    toggle: (id) => dispatch({ type: "toggle", id: id }),
    toggleSub: (id, index) => dispatch({ type: "toggleSub", id: id, index: index }),
    toToday: (id) => dispatch({ type: "toToday", id: id }),
    remove: (id) => dispatch({ type: "remove", id: id }),
    expand: (id) => {
      ui.expanded = ui.expanded === id ? null : id;
      render();
    }
  };

  const SWITCHES = [
    ["markCarried", "Übertrag markieren", "Offene Aufgaben zeigen, wie viele Tage sie schon mitlaufen."],
    ["autoRollover", "Automatisch übertragen", "Nicht erledigte Aufgaben wandern nachts auf den nächsten Tag."],
    ["showProgress", "Tagesfortschritt", "Balken und Zähler über der Tagesliste."]
  ];

  /** Ein-Zeiler fürs Terminal: zieht den neuesten Stand, baut die App neu und startet sie neu. */
  const UPDATE_COMMAND =
    "cd ~/ToDoBar && git pull && cd app && npm install && npx electron-builder --mac --dir && " +
    'APP=$(find dist -maxdepth 2 -name "Todo.app" | head -1) && cp -R "$APP" /Applications/ && ' +
    "killall Todo 2>/dev/null; sleep 1; open -a Todo";

  function renderTabs(view) {
    UI.clear(els.tabs);
    Model.TABS.forEach((name) => {
      els.tabs.appendChild(
        h("button", { class: "tab" + (name === ui.tab ? " is-on" : ""), onClick: () => setTab(name) }, [
          h("span", { text: name }),
          h("span", { class: "count", text: String(view.counts[name]) })
        ])
      );
    });
  }

  /** Kategorie/Priorität/Wiederholung fürs Wochenfeld — erst sichtbar, sobald getippt wird. */
  function renderBacklogComposer() {
    const cats = state.settings.categories;
    if (cats.indexOf(ui.backlog.cat) < 0) ui.backlog.cat = cats[0] || null;

    UI.chipButtons(els.backlogChips, cats, ui.backlog.cat, (name) => {
      ui.backlog.cat = name;
      render();
    });
    UI.segButtons(els.backlogPrios, Model.PRIOS, ui.backlog.prio, (v) => {
      ui.backlog.prio = v;
      render();
    });
    UI.segButtons(els.backlogRepeats, Model.REPEATS, ui.backlog.repeat, (v) => {
      ui.backlog.repeat = v;
      render();
    });
  }

  function renderPlan(view) {
    els.todayMeta.textContent = view.todayLabel + " · " + view.progressLabel;
    els.weekMeta.textContent = view.backlogCount === 1 ? "1 Aufgabe" : view.backlogCount + " Aufgaben";
    els.progress.hidden = !state.settings.showProgress;
    els.progressBar.style.width = view.progressPct + "%";

    UI.clear(els.todayList);
    if (!view.today.length) {
      els.todayList.appendChild(h("div", { class: "empty", text: "Nichts für heute. Über das Menübar-Symbol eintragen." }));
    } else {
      view.today.forEach((t) =>
        els.todayList.appendChild(UI.taskRow(t, { variant: "plan", expandedId: ui.expanded, actions: actions }))
      );
    }

    UI.clear(els.backlogList);
    if (!view.backlog.length) {
      els.backlogList.appendChild(h("div", { class: "empty", text: "Keine Aufgaben für diese Woche." }));
    } else {
      view.backlog.forEach((t) =>
        els.backlogList.appendChild(UI.taskRow(t, { variant: "backlog", expandedId: null, actions: actions }))
      );
    }

    renderBacklogComposer();
  }

  function renderArchive(view) {
    UI.clear(els.archive);
    if (!view.archiveGroups.length) {
      els.archive.appendChild(h("div", { class: "empty", text: "Noch nichts erledigt." }));
      return;
    }
    view.archiveGroups.forEach((group) => {
      els.archive.appendChild(
        h("div", { class: "group" }, [
          h("span", { class: "section-label", text: group.label }),
          h(
            "div",
            { class: "card" },
            group.tasks.map((t) =>
              h("div", { class: "row" }, [
                h("button", {
                  class: "archive-dot",
                  title: "Wieder öffnen",
                  "aria-label": "Wieder öffnen: " + t.text,
                  onClick: () => actions.toggle(t.id)
                }),
                h("span", { class: "archive-text", text: t.text }),
                h("span", { class: "archive-cat", text: t.cat }),
                h("button", {
                  class: "delete-btn",
                  title: "Endgültig löschen",
                  "aria-label": "Löschen: " + t.text,
                  onClick: () => actions.remove(t.id),
                  text: "×"
                })
              ])
            )
          )
        ])
      );
    });
  }

  function renderSettings(view) {
    UI.clear(els.catCard);
    view.categoryCounts.forEach((cat) => {
      els.catCard.appendChild(
        h("div", { class: "row" }, [
          h("span", { class: "cat-name", text: cat.name }),
          h("span", { class: "cat-right" }, [
            h("span", { class: "cat-count", text: String(cat.count) }),
            h("button", {
              class: "cat-remove",
              text: "Entfernen",
              onClick: () => dispatch({ type: "removeCategory", name: cat.name })
            })
          ])
        ])
      );
    });
    const catInput = h("input", {
      type: "text",
      placeholder: "Neue Kategorie · Enter",
      autocomplete: "off",
      spellcheck: "false",
      onKeydown: (e) => {
        if (e.key !== "Enter") return;
        const value = e.target.value.trim();
        if (!value) return;
        e.target.value = "";
        dispatch({ type: "addCategory", name: value });
      }
    });
    els.catCard.appendChild(h("div", { class: "cat-new" }, [catInput]));

    UI.clear(els.switchCard);
    SWITCHES.forEach(([key, name, hint]) => {
      const on = !!state.settings[key];
      els.switchCard.appendChild(
        h("div", { class: "row switch-row" }, [
          h("span", { class: "switch-label" }, [h("span", { text: name }), h("span", { class: "hint", text: hint })]),
          h(
            "button",
            {
              class: "switch" + (on ? " is-on" : ""),
              role: "switch",
              "aria-checked": on ? "true" : "false",
              "aria-label": name,
              onClick: () => dispatch({ type: "setSetting", key: key, value: !on })
            },
            [h("i", {})]
          )
        ])
      );
    });

    renderUpdateCard();
  }

  /** Prüft nur die Versionsnummer im Repo und zeigt sie an — kein Auto-Install. */
  function renderUpdateCard() {
    const status = state.updateStatus || {};
    UI.clear(els.updateCard);

    els.updateCard.appendChild(
      h("div", { class: "row" }, [
        h("span", { class: "cat-name", text: "Version " + (state.appVersion || "?") }),
        h("span", { class: "cat-right" }, [
          h("button", {
            class: "cat-remove",
            text: status.checking ? "Prüfe …" : "Nach Updates suchen",
            disabled: status.checking ? "" : null,
            onClick: () => {
              if (!status.checking) window.todo.checkForUpdate();
            }
          })
        ])
      ])
    );

    let statusText = "Noch nicht geprüft.";
    if (status.checking) statusText = "Prüfe auf GitHub …";
    else if (status.error) statusText = "Fehler: " + status.error;
    else if (status.checkedAt) {
      const time = new Date(status.checkedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      statusText = status.updateAvailable
        ? "Update verfügbar: Version " + status.latestVersion + " (geprüft um " + time + ")"
        : "Du hast die aktuelle Version. (geprüft um " + time + ")";
    }

    const statusChildren = [h("span", { class: "hint", text: statusText })];
    if (status.updateAvailable && !status.checking) {
      statusChildren.push(
        h("button", {
          class: "cat-remove",
          text: "Befehl kopieren",
          onClick: () => window.todo.copyToClipboard(UPDATE_COMMAND)
        })
      );
    }
    els.updateCard.appendChild(h("div", { class: "row update-status" }, statusChildren));

    const tokenInput = h("input", {
      type: "password",
      placeholder: "GitHub-Zugriffstoken (nur bei privatem Repo nötig)",
      value: state.settings.updateToken || "",
      onKeydown: (e) => {
        if (e.key !== "Enter") return;
        dispatch({ type: "setUpdateToken", token: e.target.value });
        e.target.blur();
      }
    });
    els.updateCard.appendChild(
      h("div", { class: "row update-token" }, [
        tokenInput,
        h("span", {
          class: "hint",
          text: "Bleibt nur lokal auf diesem Mac, in derselben Datei wie deine Aufgaben. Enter zum Speichern."
        })
      ])
    );
  }

  function setTab(name) {
    ui.tab = name;
    render();
  }

  function render() {
    if (!state) return;
    const view = Model.derive(state);

    renderTabs(view);
    els.tabTitle.textContent = ui.tab;
    els.toolbarMeta.textContent =
      ui.tab === "Planung"
        ? view.carriedCount + " übertragen"
        : ui.tab === "Archiv"
          ? view.archivedCount + " erledigt"
          : state.settings.categories.length + " Kategorien";

    Model.TABS.forEach((name) => {
      $("view-" + name).hidden = name !== ui.tab;
    });

    if (ui.tab === "Planung") renderPlan(view);
    else if (ui.tab === "Archiv") renderArchive(view);
    else renderSettings(view);
  }

  els.backlogDraft.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const text = e.target.value.trim();
    if (!text) return;
    e.target.value = "";
    els.backlogOptions.hidden = true;
    dispatch({
      type: "add",
      text: text,
      bucket: "Woche",
      cat: ui.backlog.cat,
      prio: ui.backlog.prio,
      repeat: ui.backlog.repeat
    });
  });
  els.backlogDraft.addEventListener("input", () => {
    els.backlogOptions.hidden = !els.backlogDraft.value.trim();
  });

  window.todo.onState((next) => {
    state = next;
    render();
  });
  window.todo.onTab((tab) => {
    if (Model.TABS.indexOf(tab) >= 0) setTab(tab);
  });

  window.todo.getState().then((next) => {
    state = next;
    render();
  });
})();
