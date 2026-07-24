const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { MpvController } = require("./mpvController");
const discordRpc = require("./discordRpc");
const discordOAuth = require("./discordOAuth");
const autoUpdaterModule = require("./autoUpdater");

let mainWindow;
let videoWindow;
let mpv;

const isDev = process.env.NODE_ENV === "development";

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0b0b0f",
    title: "Streamio",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (mpv) mpv.stop();
    if (videoWindow) videoWindow.close();
  });
}

function createVideoWindow() {
  videoWindow = new BrowserWindow({
    parent: mainWindow,
    show: false,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    backgroundColor: "#000000",
    webPreferences: { offscreen: false }
  });
  videoWindow.setMenu(null);
  videoWindow.loadURL("data:text/html,<body style='margin:0;background:#000'></body>");
}

app.whenReady().then(() => {
  createMainWindow();
  createVideoWindow();
  discordRpc.init();

  ipcMain.handle("discord:watching", (_e, channelName) => {
    discordRpc.setWatching(channelName);
  });
  ipcMain.handle("discord:clear", () => {
    discordRpc.clear();
  });
  ipcMain.handle("discord:oauth:start", async () => {
    return discordOAuth.startOAuthFlow();
  });

  const updater = autoUpdaterModule.init(mainWindow);
  ipcMain.handle("updater:check", () => updater.check());
  ipcMain.handle("updater:download", () => updater.download());
  ipcMain.handle("updater:install", () => updater.installNow());

  ipcMain.handle("player:start", async () => {
    if (mpv) mpv.stop();
    mpv = new MpvController();
    const hwndBuf = videoWindow.getNativeWindowHandle();
    const wid = hwndBuf.readBigUInt64LE(0).toString();
    await mpv.start(wid);
    mpv.observe("time-pos", 1);
    mpv.observe("duration", 2);
    mpv.observe("pause", 3);
    mpv.observe("percent-pos", 4);
    mpv.observe("demuxer-cache-duration", 5);
    mpv.on("property-change", (msg) => {
      if (mainWindow) mainWindow.webContents.send("player:property-change", msg);
    });
    mpv.on("mpv-exit", (msg) => {
      if (mainWindow) mainWindow.webContents.send("player:mpv-exit", msg);
    });
    return true;
  });

  ipcMain.handle("player:load", async (_e, url) => {
    if (!mpv) return false;
    await mpv.loadFile(url);
    return true;
  });

  ipcMain.handle("player:play", async () => mpv && mpv.play());
  ipcMain.handle("player:pause", async () => mpv && mpv.pause());
  ipcMain.handle("player:seek", async (_e, seconds, mode) => mpv && mpv.seek(seconds, mode));
  ipcMain.handle("player:volume", async (_e, vol) => mpv && mpv.setVolume(vol));
  ipcMain.handle("player:stop", async () => {
    if (mpv) {
      mpv.stop();
      mpv = null;
    }
    if (videoWindow) videoWindow.hide();
    return true;
  });

  ipcMain.on("player:bounds", (_e, bounds) => {
    lastBounds = bounds;
    applyVideoBounds();
  });

  mainWindow.on("move", () => applyVideoBounds());
  mainWindow.on("resize", () => applyVideoBounds());
});

let lastBounds = null;
function applyVideoBounds() {
  if (!lastBounds || !videoWindow || !mainWindow) return;
  const mb = mainWindow.getContentBounds();
  if (lastBounds.visible) {
    videoWindow.setBounds({
      x: mb.x + Math.round(lastBounds.x),
      y: mb.y + Math.round(lastBounds.y),
      width: Math.max(1, Math.round(lastBounds.width)),
      height: Math.max(1, Math.round(lastBounds.height))
    });
    if (!videoWindow.isVisible()) videoWindow.showInactive();
  } else {
    videoWindow.hide();
  }
}

app.on("window-all-closed", () => {
  if (mpv) mpv.stop();
  if (process.platform !== "darwin") app.quit();
});
