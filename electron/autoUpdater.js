const { autoUpdater } = require("electron-updater");

const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute, per spec

function init(mainWindow) {
  autoUpdater.allowPrerelease = true; // releases are currently published as prereleases
  autoUpdater.autoDownload = false;

  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };

  let downloadedFilePath = null;

  autoUpdater.on("checking-for-update", () => send("updater:status", { state: "checking" }));
  autoUpdater.on("update-available", (info) =>
    send("updater:status", { state: "available", version: info.version, releaseNotes: normalizeNotes(info.releaseNotes) })
  );
  autoUpdater.on("update-not-available", () => send("updater:status", { state: "up-to-date" }));
  autoUpdater.on("download-progress", (p) =>
    send("updater:status", { state: "downloading", percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond, transferred: p.transferred, total: p.total })
  );
  autoUpdater.on("update-downloaded", (info) => {
    downloadedFilePath = info.downloadedFile;
    send("updater:status", { state: "downloaded", version: info.version, releaseNotes: normalizeNotes(info.releaseNotes) });
  });
  autoUpdater.on("error", (err) => send("updater:status", { state: "error", message: shortErrorMessage(err) }));

  // Auto-check every minute, same as a manual "Refresh Updater" press.
  const interval = setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), CHECK_INTERVAL_MS);
  autoUpdater.checkForUpdates().catch(() => {});

  return {
    check: () => autoUpdater.checkForUpdates(),
    download: () => autoUpdater.downloadUpdate(),
    installNow: () => {
      const { app } = require("electron");
      const path = require("path");
      const { spawn } = require("child_process");

      if (downloadedFilePath) {
        // Get the exact directory where the current Streamio.exe is running from
        const installDir = path.dirname(app.getPath("exe"));

        // Spawn the NSIS installer manually with /S (Silent) and /D (Directory)
        // /D must be the last parameter and must not have quotes even if the path contains spaces!
        const args = ["/S", "--force-run", "/D=" + installDir];
        
        spawn(downloadedFilePath, args, {
          detached: true,
          stdio: "ignore"
        }).unref();

        // Exit the current app so the installer can overwrite it
        app.quit();
      } else {
        autoUpdater.quitAndInstall(true, true);
      }
    },
    stopAutoCheck: () => clearInterval(interval)
  };
}

// electron-updater's HttpError.message dumps the entire request/response
// (every header, the full URL, a JWT, etc.) into one giant string - fine for
// a log, never fine to show a user. Reduce to a short, human line.
function shortErrorMessage(err) {
  const raw = String(err?.message || err);
  const statusMatch = raw.match(/HttpError:\s*(\d{3})/);
  if (statusMatch) {
    const code = statusMatch[1];
    if (code === "404") return "No update package found on GitHub yet - try again shortly.";
    return `Update server returned an error (HTTP ${code}). Try again shortly.`;
  }
  // Otherwise just take the first line/sentence, capped, instead of the raw dump.
  const firstLine = raw.split("\n")[0];
  return firstLine.length > 140 ? firstLine.slice(0, 140) + "…" : firstLine;
}

function normalizeNotes(notes) {
  if (!notes) return "";
  if (typeof notes === "string") return notes;
  if (Array.isArray(notes)) return notes.map((n) => `## ${n.version}\n${n.note || ""}`).join("\n\n");
  return "";
}

module.exports = { init };
