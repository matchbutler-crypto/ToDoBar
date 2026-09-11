/* Winziger DOM-Helfer und die Aufgabenzeile, die Popover und Fenster teilen. */
(function (root) {
  /** h("div", {class: "x", onClick: fn}, [kind, "text"]) */
  function h(tag, props, children) {
    const node = document.createElement(tag);
    const p = props || {};
    Object.keys(p).forEach((key) => {
      const value = p[key];
      if (value === null || value === undefined || value === false) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "style") node.setAttribute("style", value);
      else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === "value") node.value = value;
      else node.setAttribute(key, value === true ? "" : value);
    });
    (children || []).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  const clear = (node) => {
    while (node.firstChild) node.removeChild(node.firstChild);
  };

  /** Segmented Control: Buttons aus `names`, `current` hervorgehoben, `onPick(name)` bei Klick. */
  function segButtons(host, names, current, onPick) {
    clear(host);
    names.forEach((name) => {
      host.appendChild(h("button", { class: "seg" + (name === current ? " is-on" : ""), text: name, onClick: () => onPick(name) }));
    });
  }

  /** Kategorie-Chips: dieselbe Logik wie segButtons, andere Optik. */
  function chipButtons(host, names, current, onPick) {
    clear(host);
    names.forEach((name) => {
      host.appendChild(h("button", { class: "chip" + (name === current ? " is-on" : ""), text: name, onClick: () => onPick(name) }));
    });
  }

  /**
   * Die Zeile "Kategorie · Priorität · Wiederholung · Unteraufgaben · Übertrag".
   * Im Popover steht der erste Mittelpunkt als eigenes Element — so ist es gesetzt.
   */
  function metaLine(t, separateDot) {
    const parts = separateDot
      ? [h("span", { text: t.cat }), h("span", { text: "·" }), h("span", { text: t.prio })]
      : [h("span", { text: t.cat }), h("span", { text: "· " + t.prio })];
    if (t.repeats) parts.push(h("span", { text: "· " + t.repeat }));
    if (t.hasSubs) parts.push(h("span", { text: "· " + t.subLabel }));
    if (t.showCarried) parts.push(h("span", { class: "carried", text: "· " + t.carriedLabel }));
    return h("div", { class: "meta" }, parts);
  }

  function subList(t, actions) {
    return (t.subs || []).map((sub, i) =>
      h("div", { class: "sub" }, [
        h("button", {
          class: "check sm" + (sub.done ? " is-done" : ""),
          "aria-label": sub.text,
          "aria-pressed": sub.done ? "true" : "false",
          onClick: () => actions.toggleSub(t.id, i)
        }),
        h("span", { class: "task-text sm" + (sub.done ? " is-done" : ""), text: sub.text })
      ])
    );
  }

  function deleteButton(t, actions) {
    return h("button", {
      class: "delete-btn",
      title: "Aufgabe löschen",
      "aria-label": "Löschen: " + t.text,
      onClick: (e) => {
        e.stopPropagation();
        actions.remove(t.id);
      },
      text: "×"
    });
  }

  function editButton(t, actions) {
    return h("button", {
      class: "edit-btn",
      title: "Aufgabe bearbeiten",
      "aria-label": "Bearbeiten: " + t.text,
      onClick: (e) => {
        e.stopPropagation();
        actions.startEdit(t.id);
      },
      text: "✎"
    });
  }

  /** Ersetzt die Zeile durch ein Formular: Text, Kategorie, Priorität, Wiederholung, Notiz. */
  function editForm(t, opts) {
    const draft = opts.editDraft;
    const actions = opts.actions;

    const textInput = h("input", {
      type: "text",
      class: "edit-text",
      value: draft.text,
      autocomplete: "off",
      spellcheck: "false",
      onKeydown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          actions.saveEdit(t.id);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          actions.cancelEdit();
        }
      },
      onInput: (e) => {
        draft.text = e.target.value;
      }
    });

    const catsHost = h("div", { class: "chips edit-chips" });
    const prioHost = h("div", { class: "segmented" });
    const repeatHost = h("div", { class: "segmented" });
    chipButtons(catsHost, opts.categories, draft.cat, (name) => {
      draft.cat = name;
      actions.refresh();
    });
    segButtons(prioHost, opts.prios, draft.prio, (v) => {
      draft.prio = v;
      actions.refresh();
    });
    segButtons(repeatHost, opts.repeats, draft.repeat, (v) => {
      draft.repeat = v;
      actions.refresh();
    });

    const noteInput = h("textarea", {
      class: "edit-note",
      placeholder: "Notiz (optional)",
      rows: "2",
      value: draft.note || "",
      onKeydown: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          actions.cancelEdit();
        }
      },
      onInput: (e) => {
        draft.note = e.target.value;
      }
    });

    const actionsRow = h("div", { class: "edit-actions" }, [
      h("button", { class: "edit-save", text: "Speichern", onClick: () => actions.saveEdit(t.id) }),
      h("button", { class: "edit-cancel", text: "Abbrechen", onClick: () => actions.cancelEdit() })
    ]);

    return h("div", { class: "edit-form" }, [textInput, catsHost, prioHost, repeatHost, noteInput, actionsRow]);
  }

  /**
   * variant: "popover" | "plan" | "backlog"
   * Im Popover hängt der aufgeklappte Block unter der ganzen Zeile, im Fenster
   * innerhalb der Textspalte — genau wie im Design. Der Löschen-Button sitzt in
   * allen Varianten rechts und blendet erst beim Hover über die Zeile ein.
   */
  function taskRow(t, opts) {
    const variant = opts.variant;
    const editing = opts.editingId === t.id;
    const expanded = opts.expandedId === t.id && t.canExpand;
    const big = variant !== "popover";

    const check = h("button", {
      class: "check" + (t.done ? " is-done" : ""),
      "aria-label": t.text,
      "aria-pressed": t.done ? "true" : "false",
      onClick: () => opts.actions.toggle(t.id)
    });

    if (editing) {
      const column = h("div", { class: "task-col" }, [editForm(t, opts)]);
      const head = h("div", { class: "task-head" }, [check, column]);
      return h("div", { class: "task task-" + variant + " is-editing" }, [head]);
    }

    const text = h("span", {
      class: "task-text" + (big ? " lg" : "") + (t.done ? " is-done" : "") + (t.canExpand ? " can-expand" : ""),
      text: t.text,
      onClick: t.canExpand && variant !== "backlog" ? () => opts.actions.expand(t.id) : null
    });

    const details =
      expanded &&
      h(
        "div",
        { class: "details" },
        [t.note ? h("span", { class: "note", text: t.note }) : null].concat(subList(t, opts.actions))
      );

    const column = h("div", { class: "task-col" }, [
      text,
      metaLine(t, variant === "popover"),
      variant === "plan" ? details : null
    ]);

    const trailing = h("div", { class: "trailing" }, [
      variant === "backlog"
        ? h("button", { class: "to-today", text: "Heute", onClick: () => opts.actions.toToday(t.id) })
        : null,
      variant !== "backlog" && t.isHigh ? h("span", { class: "flag", title: "Hohe Priorität" }) : null,
      editButton(t, opts.actions),
      deleteButton(t, opts.actions)
    ]);

    const head = h("div", { class: "task-head" }, [check, column, trailing]);

    return h("div", { class: "task task-" + variant }, [head, variant === "popover" ? details : null]);
  }

  root.UI = { h: h, clear: clear, segButtons: segButtons, chipButtons: chipButtons, taskRow: taskRow, metaLine: metaLine };
})(window);
