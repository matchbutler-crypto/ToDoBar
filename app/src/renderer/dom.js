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

  /**
   * variant: "popover" | "plan" | "backlog"
   * Im Popover hängt der aufgeklappte Block unter der ganzen Zeile, im Fenster
   * innerhalb der Textspalte — genau wie im Design.
   */
  function taskRow(t, opts) {
    const variant = opts.variant;
    const expanded = opts.expandedId === t.id && t.canExpand;
    const big = variant !== "popover";

    const check = h("button", {
      class: "check" + (t.done ? " is-done" : ""),
      "aria-label": t.text,
      "aria-pressed": t.done ? "true" : "false",
      onClick: () => opts.actions.toggle(t.id)
    });

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

    const head = h("div", { class: "task-head" }, [
      check,
      column,
      variant === "backlog"
        ? h("button", { class: "to-today", text: "Heute", onClick: () => opts.actions.toToday(t.id) })
        : t.isHigh
          ? h("span", { class: "flag", title: "Hohe Priorität" })
          : null
    ]);

    return h("div", { class: "task task-" + variant }, [head, variant === "popover" ? details : null]);
  }

  root.UI = { h: h, clear: clear, taskRow: taskRow, metaLine: metaLine };
})(window);
