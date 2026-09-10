"use strict";

/**
 * Update-Check gegen GitHub — vergleicht nur Versionsnummern und meldet, ob es
 * etwas Neueres gibt. Kein Auto-Download, kein Auto-Install: unsignierte Apps
 * würde macOS beim Ersetzen ohnehin wieder blockieren, dafür bräuchte es eine
 * kostenpflichtige Apple-Signierung.
 */

const https = require("https");

const REPO = "matchbutler-crypto/ToDoBar";
const BRANCH = "todo-menubar-app";
const TIMEOUT_MS = 10000;

function fetchJSON(reqPath, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "Checkbar-App",
      Accept: "application/vnd.github+json"
    };
    if (token) headers.Authorization = "Bearer " + token;

    const req = https.request(
      { hostname: "api.github.com", path: reqPath, method: "GET", headers: headers },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(new Error("Ungültige Antwort von GitHub"));
            }
          } else if (res.statusCode === 404) {
            reject(new Error("Nicht gefunden — privates Repo? Zugriffstoken unten hinterlegen."));
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            reject(new Error("Zugriff verweigert — Zugriffstoken prüfen oder erneuern."));
          } else {
            reject(new Error("GitHub antwortete mit Status " + res.statusCode));
          }
        });
      }
    );
    req.on("error", (err) => reject(new Error("Netzwerkfehler: " + err.message)));
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("Zeitüberschreitung bei der Verbindung zu GitHub")));
    req.end();
  });
}

/** Vergleicht zwei "1.2.3"-Versionen. >0 wenn a neuer als b, 0 wenn gleich. */
function compareVersions(a, b) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Liest die Versionsnummer aus app/package.json auf dem verfolgten Branch. */
async function fetchRemoteVersion(token) {
  const reqPath = "/repos/" + REPO + "/contents/app/package.json?ref=" + BRANCH;
  const data = await fetchJSON(reqPath, token);
  if (!data || !data.content) throw new Error("Unerwartete Antwort von GitHub");
  const pkg = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
  if (!pkg.version) throw new Error("Keine Version in der Antwort gefunden");
  return pkg.version;
}

async function checkForUpdate(currentVersion, token) {
  const latestVersion = await fetchRemoteVersion(token);
  return {
    currentVersion: currentVersion,
    latestVersion: latestVersion,
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0
  };
}

module.exports = { REPO: REPO, BRANCH: BRANCH, compareVersions: compareVersions, checkForUpdate: checkForUpdate };
