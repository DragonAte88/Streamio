const { autoUpdater } = require("electron-updater");

function init(mainWindow) {
  autoUpdater.allowPrerelease = true; // releases are currently published as prereleases
  autoUpdater.autoDownload = false;

  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };

  autoUpdater.on("checking-for-update", () => send("updater:status", { state: "checking" }));
  autoUpdater.on("update-available", (info) => send("updater:status", { state: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => send("updater:status", { state: "up-to-date" }));
  autoUpdater.on("download-progress", (p) => send("updater:status", { state: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => send("updater:status", { state: "downloaded", version: info.version }));
  autoUpdater.on("error", (err) => send("updater:status", { state: "error", message: err.message }));

  return {
    check: () => autoUpdater.checkForUpdates(),
    download: () => autoUpdater.downloadUpdate(),
    installNow: () => autoUpdater.quitAndInstall()
  };
}

module.exports = { init };
