/* Menübar-Popover: schneller Eintrag plus Tagesliste. */
(function () {
  "use strict";

  const h = UI.h;
  const $ = (id) => document.getElementById(id);

  const els = {
    panel: document.querySelector(".panel"),
    draft: $("draft"),
    composerOptions: $("composerOptions"),
    chips: $("chips"),
    prios: $("prios"),
    buckets: $("buckets"),
    repeats: $("repeats"),
    add: $("add"),
    progressLabel: $("progressLabel"),
    progress: $("progress"),
    progressBar: $("progress").querySelector("i"),
    list: $("list"),
    openCount: $("openCount"),
    openWindow: $("openWindow")
  };

  // Nur Oberfläche — die Aufgaben selbst liegen im Main-Prozess.
  const ui = { cat: null, prio: "Mittel", bucket: "Heute", repeat: "Einmalig", expanded: null };
  let state = null;

  const actions = {
    toggle: (id) => window.todo.dispatch({ type: "toggle", id: id }),
    toggleSub: (id, index) => window.todo.dispatch({ type: "toggleSub", id: id, index: index }),
    remove: (id) => window.todo.dispatch({ type: "remove", id: id }),
    expand: (id) => {
      ui.expanded = ui.expanded === id ? null : id;
      render();
    }
  };

  /** Kategorie/Priorität/Wiederholung erst zeigen, sobald etwas eingetippt ist. */
  function updateComposerVisibility() {
    els.composerOptions.hidden = !els.draft.value.trim();
  }

  function submit() {
    const text = els.draft.value.trim();
    if (!text) return;
    window.todo.dispatch({
      type: "add",
      text: text,
      cat: ui.cat,
      prio: ui.prio,
      bucket: ui.bucket,
      repeat: ui.repeat
    });
    els.draft.value = "";
    updateComposerVisibility();
    els.draft.focus();
    reportHeight();
  }

  function render() {
    if (!state) return;
    const cats = state.settings.categories;
    if (cats.indexOf(ui.cat) < 0) ui.cat = cats[0] || null;
    const view = Model.derive(state);

    UI.chipButtons(els.chips, cats, ui.cat, (name) => {
      ui.cat = name;
      render();
    });
    UI.segButtons(els.prios, Model.PRIOS, ui.prio, (v) => {
      ui.prio = v;
      render();
    });
    UI.segButtons(els.buckets, Model.BUCKETS, ui.bucket, (v) => {
      ui.bucket = v;
      render();
    });
    UI.segButtons(els.repeats, Model.REPEATS, ui.repeat, (v) => {
      ui.repeat = v;
      render();
    });

    els.progressLabel.textContent = view.progressLabel;
    els.progress.hidden = !state.settings.showProgress;
    els.progressBar.style.width = view.progressPct + "%";

    UI.clear(els.list);
    if (!view.today.length) {
      els.list.appendChild(h("div", { class: "empty", text: "Nichts für heute. Oben eintragen." }));
    } else {
      view.today.forEach((t) =>
        els.list.appendChild(UI.taskRow(t, { variant: "popover", expandedId: ui.expanded, actions: actions }))
      );
    }

    els.openCount.textContent = view.openToday + " offen";
    reportHeight();
  }

  /** Das Fenster wächst mit dem Inhalt; 8px oben und 56px unten sind der Schattenrand. */
  function reportHeight() {
    requestAnimationFrame(() => {
      window.todo.resizePopover(Math.ceil(els.panel.getBoundingClientRect().height) + 8 + 56);
    });
  }

  els.draft.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  els.draft.addEventListener("input", () => {
    updateComposerVisibility();
    reportHeight();
  });
  els.add.addEventListener("click", submit);
  els.openWindow.addEventListener("click", () => window.todo.openWindow("Planung"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.todo.hidePopover();
  });

  window.todo.onState((next) => {
    state = next;
    render();
  });
  window.todo.onShown(() => {
    els.draft.focus();
    els.draft.select();
    reportHeight();
  });

  window.todo.getState().then((next) => {
    state = next;
    render();
    els.draft.focus();
  });
})();
