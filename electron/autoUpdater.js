const { autoUpdater } = require("electron-updater");

const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute, per spec

function init(mainWindow) {
  autoUpdater.allowPrerelease = true; // releases are currently published as prereleases
  autoUpdater.autoDownload = false;

  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };

  autoUpdater.on("checking-for-update", () => send("updater:status", { state: "checking" }));
  autoUpdater.on("update-available", (info) =>
    send("updater:status", { state: "available", version: info.version, releaseNotes: normalizeNotes(info.releaseNotes) })
  );
  autoUpdater.on("update-not-available", () => send("updater:status", { state: "up-to-date" }));
  autoUpdater.on("download-progress", (p) =>
    send("updater:status", { state: "downloading", percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond, transferred: p.transferred, total: p.total })
  );
  autoUpdater.on("update-downloaded", (info) =>
    send("updater:status", { state: "downloaded", version: info.version, releaseNotes: normalizeNotes(info.releaseNotes) })
  );
  autoUpdater.on("error", (err) => send("updater:status", { state: "error", message: err.message }));

  // Auto-check every minute, same as a manual "Refresh Updater" press.
  const interval = setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), CHECK_INTERVAL_MS);
  autoUpdater.checkForUpdates().catch(() => {});

  return {
    check: () => autoUpdater.checkForUpdates(),
    download: () => autoUpdater.downloadUpdate(),
    installNow: () => autoUpdater.quitAndInstall(false, true),
    stopAutoCheck: () => clearInterval(interval)
  };
}

function normalizeNotes(notes) {
  if (!notes) return "";
  if (typeof notes === "string") return notes;
  if (Array.isArray(notes)) return notes.map((n) => `## ${n.version}\n${n.note || ""}`).join("\n\n");
  return "";
}

module.exports = { init };
