# Todo — Menübar-App für macOS

Ein simples, klar gestaltetes Todo-Tool für die Menübar: Aufgaben in Sekunden
eintragen, Tag und Woche planen, Unerledigtes wandert automatisch weiter.
macOS-Idiom (Seitenleiste, runde Checkboxen, Segmented Controls), warme
Neutraltöne statt kühlem Systemgrau.

<p>
  <img src="app/shots/popover.png" alt="Menübar-Popover" width="360">
  <img src="app/shots/fenster-planung.png" alt="Fenster: Planung" width="520">
</p>

## Was es kann

- **Menübar-Popover** — Klick auf das Symbol oder **⌥ Leertaste**, tippen, Enter.
  Kategorie/Priorität/Ziel/Wiederholung erscheinen erst, sobald man zu tippen anfängt.
- **Tag- und Wochenplanung** — "Heute" und "Diese Woche" nebeneinander im Fenster,
  ein Klick holt eine Aufgabe aus der Woche in den heutigen Tag.
- **Automatischer Übertrag** — Nicht erledigte Aufgaben wandern nachts auf den
  nächsten Tag, sichtbar markiert ("+2 Tage"), abschaltbar.
- **Eigene Kategorien**, drei Prioritätsstufen, Notizen und Unteraufgaben,
  wiederkehrende Aufgaben (täglich/wöchentlich).
- **Erledigt-Archiv**, nach Tagen gruppiert, mit Tagesfortschritt.
- **Aufgaben löschen** — Löschen-Symbol beim Hover über eine Zeile.
- **Update-Check direkt in der App** — Einstellungen → Software zeigt, ob es
  eine neuere Version gibt, und installiert sie per Klick im Hintergrund.

<p>
  <img src="app/shots/fenster-archiv.png" alt="Fenster: Archiv" width="420">
  <img src="app/shots/fenster-einstellungen.png" alt="Fenster: Einstellungen" width="420">
</p>

Alles läuft lokal — eine JSON-Datei auf der eigenen Platte, kein Server, keine Cloud.

## Herunterladen und starten

Voraussetzung: [Node.js](https://nodejs.org) (mit npm) auf einem Mac.

```bash
git clone https://github.com/matchbutler-crypto/ToDoBar.git
cd ToDoBar/app
npm install
npm run demo    # mit Beispieldaten zum Ausprobieren
# oder: npm start   # leer, vier Standardkategorien
```

`npm start` öffnet kein Fenster — die App lebt in der Menübar. Klick auf das
Symbol öffnet das Popover, Rechtsklick das Fenster.

**Als richtige `.app` installieren** (für den Alltag, mit Autostart bei der
Anmeldung): Schritt-für-Schritt-Anleitung, Architektur, Tests und alle
Design-Entscheidungen stehen in **[`app/README.md`](app/README.md)**.

## Herkunft

Entstanden aus einem UI-Entwurf in [Claude Design](https://claude.ai/design)
(`project/`, `chats/`) und als lauffähige Electron-App umgesetzt. Details zu
Abweichungen vom Entwurf und offenen Punkten ebenfalls in `app/README.md`.
