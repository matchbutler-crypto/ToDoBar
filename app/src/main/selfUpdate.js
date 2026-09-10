"use strict";

/**
 * Zieht den neuesten Stand, baut die App neu und ersetzt sich selbst in
 * /Applications — per Klick, läuft im Hintergrund. Zwei Phasen:
 *
 *   1) pullAndBuild(): git pull, npm install, electron-builder — läuft ganz
 *      normal, während die App weiterläuft. Nichts Live-Laufendes wird
 *      angefasst, das gebaute Bundle landet nur in app/dist/. Baut den
 *      vollen electron-builder-Durchlauf (nicht nur --dir), damit dabei
 *      gleich auch die DMG für einen GitHub-Release mit entsteht.
 *   2) scheduleReplaceAndRelaunch(): ein eigenständiges Shell-Skript, das
 *      erst NACH dem eigenen app.quit() läuft — beendet die App (Sicherheits-
 *      netz, falls quit() hängt), kopiert das gebaute Bundle nach
 *      /Applications und öffnet es neu. Läuft "detached", übersteht also das
 *      Beenden dieses Prozesses.
 *
 * Der App-Name ist überall ein Parameter statt fest verdrahtet — bei einer
 * Umbenennung genügt es, `productName` in package.json zu ändern.
 *
 * Reines Node (kein Electron-Import), damit es sich ohne Electron-Laufzeit
 * testen lässt.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

function expandHome(p) {
  const raw = String(p || "").trim();
  if (raw === "~") return os.homedir();
  if (raw.indexOf("~/") === 0) return path.join(os.homedir(), raw.slice(2));
  return raw;
}

/**
 * Führt einen Befehl über die Shell aus. Im Normalbetrieb als Login-Shell
 * (`-l`), damit PATH aus dem Profil kommt (nvm, Homebrew, …) — genau das,
 * was ein GUI-gestarteter Prozess sonst nicht automatisch hat. Tests
 * schalten `login: false` ein, sonst würde ein eigenes .bashrc/.zshrc mit
 * eigener nvm-Einbindung die untergeschobenen Fake-Befehle überschreiben.
 */
function runShell(command, cwd, onLog, opts) {
  const options = opts || {};
  return new Promise((resolve, reject) => {
    const shell = process.env.SHELL || "/bin/zsh";
    const env = options.env ? Object.assign({}, process.env, options.env) : process.env;
    const flag = options.login === false ? "-c" : "-lc";
    let child;
    try {
      child = spawn(shell, [flag, command], { cwd: cwd, env: env });
    } catch (err) {
      reject(err);
      return;
    }
    child.stdout.on("data", (d) => onLog(d.toString()));
    child.stderr.on("data", (d) => onLog(d.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("„" + command + "“ endete mit Code " + code));
    });
  });
}

/** Sucht das von electron-builder gebaute Bundle (Architektur kann variieren). */
function findBuiltApp(appDir, appName) {
  const distDir = path.join(appDir, "dist");
  const candidates = ["mac-arm64", "mac-universal", "mac"];
  for (let i = 0; i < candidates.length; i++) {
    const p = path.join(distDir, candidates[i], appName + ".app");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Sucht die von electron-builder gebaute DMG (für einen GitHub-Release). */
function findBuiltDmg(appDir) {
  const distDir = path.join(appDir, "dist");
  if (!fs.existsSync(distDir)) return null;
  const dmg = fs.readdirSync(distDir).find((f) => f.endsWith(".dmg"));
  return dmg ? path.join(distDir, dmg) : null;
}

/** Phase 1: pullen und bauen. Wirft mit einer sprechenden Meldung, wenn ein Schritt fehlschlägt. */
async function pullAndBuild(repoPath, onLog, appName, opts) {
  const root = expandHome(repoPath);
  if (!fs.existsSync(root)) {
    throw new Error("Projektordner nicht gefunden: " + root + " — Pfad in den Einstellungen prüfen.");
  }
  const appDir = path.join(root, "app");

  onLog("→ git pull\n");
  await runShell("git pull --ff-only", root, onLog, opts);

  onLog("\n→ npm install\n");
  await runShell("npm install", appDir, onLog, opts);

  onLog("\n→ electron-builder\n");
  await runShell("npx electron-builder --mac", appDir, onLog, opts);

  const built = findBuiltApp(appDir, appName);
  if (!built) throw new Error("Gebaute App nicht gefunden (app/dist/mac*/" + appName + ".app).");
  return built;
}

/** Phase 2: eigenständiges Skript — läuft erst nach dem eigenen Beenden, übersteht es also. */
function scheduleReplaceAndRelaunch(builtAppPath, appName, targetAppPath) {
  const target = targetAppPath || "/Applications/" + appName + ".app";
  const script = [
    "#!/bin/sh",
    "sleep 1",
    'pkill -f "' + target + '/Contents/MacOS/' + appName + '" 2>/dev/null',
    "sleep 1",
    'rm -rf "' + target + '"',
    'cp -R "' + builtAppPath + '" "' + target + '"',
    "sleep 1",
    'open "' + target + '"'
  ].join("\n");

  const scriptPath = path.join(os.tmpdir(), "checkbar-self-update-" + Date.now() + ".sh");
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  const child = spawn("/bin/sh", [scriptPath], { detached: true, stdio: "ignore" });
  child.unref();
  return scriptPath;
}

module.exports = {
  expandHome: expandHome,
  runShell: runShell,
  findBuiltApp: findBuiltApp,
  findBuiltDmg: findBuiltDmg,
  pullAndBuild: pullAndBuild,
  scheduleReplaceAndRelaunch: scheduleReplaceAndRelaunch
};
