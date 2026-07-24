const { autoUpdater } = require("electron-updater");

// mock app version
autoUpdater.currentVersion = "0.6.0";
autoUpdater.allowPrerelease = true;
autoUpdater.autoDownload = false;

// Mock the app
const app = require('electron').app;
if(!app) {
    autoUpdater.app = {
        getVersion: () => "0.6.0",
        getAppPath: () => __dirname,
        getPath: () => __dirname,
        on: () => {},
        isReady: () => true
    };
}

autoUpdater.on("checking-for-update", () => console.log("checking..."));
autoUpdater.on("update-available", (info) => console.log("available:", info.version));
autoUpdater.on("update-not-available", () => console.log("not available"));
autoUpdater.on("error", (err) => console.log("error:", err));

autoUpdater.checkForUpdates().catch(e => console.log("caught error:", e));
