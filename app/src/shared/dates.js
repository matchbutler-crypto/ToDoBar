/**
 * Deutsche Datumsformate, exakt in der Schreibweise des Designs:
 *   kurz    "Do 10. Sep"
 *   Archiv  "Heute · Do 10. Sep" / "Gestern · Mi 09. Sep" / "Montag · 07. Sep"
 *
 * Wird sowohl im Main-Prozess (require) als auch in den Renderern
 * (<script src>) geladen, deshalb das UMD-Wrapping.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Dates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

  const pad = (n) => (n < 10 ? "0" + n : String(n));

  /** Lokaler Tagesschlüssel, z. B. "2026-09-10". Bewusst nicht toISOString(), das rechnet in UTC. */
  function dayKey(d) {
    const date = d instanceof Date ? d : new Date(d);
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function fromKey(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function todayKey() {
    return dayKey(new Date());
  }

  /** "Do 10. Sep" */
  function short(key) {
    const d = typeof key === "string" ? fromKey(key) : key;
    return WD_SHORT[d.getDay()] + " " + pad(d.getDate()) + ". " + MONTH_SHORT[d.getMonth()];
  }

  /** "Mittwoch · 09. Sep" */
  function longLabel(key) {
    const d = typeof key === "string" ? fromKey(key) : key;
    return WD_LONG[d.getDay()] + " · " + pad(d.getDate()) + ". " + MONTH_SHORT[d.getMonth()];
  }

  /** Ganze Tage zwischen zwei Tagesschlüsseln (lokale Mitternacht, DST-sicher). */
  function daysBetween(fromKeyStr, toKeyStr) {
    const a = fromKey(fromKeyStr);
    const b = fromKey(toKeyStr);
    return Math.round((b - a) / 86400000);
  }

  function addDays(key, n) {
    const d = fromKey(key);
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }

  /** Überschrift einer Archiv-Gruppe: heute relativ, alles davor mit Wochentag. */
  function archiveLabel(key, today) {
    const ref = today || todayKey();
    return daysBetween(key, ref) === 0 ? "Heute · " + short(key) : longLabel(key);
  }

  return { WD_SHORT, WD_LONG, MONTH_SHORT, dayKey, fromKey, todayKey, short, longLabel, daysBetween, addDays, archiveLabel };
});
