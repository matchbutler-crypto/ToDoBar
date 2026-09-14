"use strict";

/**
 * electron-builder findet ohne kostenpflichtiges Apple-Entwicklerkonto keine
 * "Developer ID Application"-Identität und überspringt die Signierung
 * komplett (siehe Build-Log: "skipped macOS application code signing").
 * Dabei bleibt nur die Linker-eigene Ad-hoc-Signatur der einzelnen
 * Mach-O-Binaries übrig — das App-Bundle selbst ist nicht versiegelt
 * (`codesign --verify` schlägt fehl, Info.plist ist nicht eingebunden).
 * Für eine lokale Kopie prüft Gatekeeper das nicht, wohl aber bei einer
 * über den Browser heruntergeladenen (mit com.apple.quarantine markierten)
 * Kopie — dort meldet macOS dann fälschlich "ist beschädigt" statt des
 * üblichen "unbekannter Entwickler"-Hinweises.
 *
 * Fix: das komplette Bundle nach dem Packen selbst ad-hoc signieren
 * (Signatur "-"). Das macht aus der App keine vertrauenswürdig signierte
 * App — Gatekeeper zeigt bei einer heruntergeladenen Kopie weiterhin den
 * "unbekannter Entwickler"-Dialog (Rechtsklick → Öffnen hilft dann wie
 * gewohnt) — aber verhindert den irreführenden "beschädigt"-Fehler.
 */
const { execFileSync } = require("child_process");
const path = require("path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, appName + ".app");

  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
};
