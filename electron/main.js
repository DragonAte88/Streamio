const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { MpvController } = require("./mpvController");
const discordRpc = require("./discordRpc");
const discordOAuth = require("./discordOAuth");
const autoUpdaterModule = require("./autoUpdater");
const systemStats = require("./systemStats");

let mainWindow;
let videoWindow;
let controlsWindow;
let mpv;
let lastBounds = null;
let closing = false;

// Real evidence from a verbose mpv log: the GPU render pipeline runs
// continuously and correctly (per-frame shader timing for the full session) -
// decode/render was never the problem. The controls window's "transparent"
// middle area is the actual suspect: Electron/DWM transparency is known to be
// fragile on some Windows GPU/driver combos and can render as opaque black
// instead of see-through, fully hiding the correctly-painting video beneath
// it. setShape() sidesteps the question entirely by making the middle area
// genuinely not part of the window at the OS level, not just visually
// transparent - the video is guaranteed visible there regardless of whether
// DWM composites transparency correctly on this machine.
const TOP_BAR_HEIGHT = 76;
const BOTTOM_BAR_HEIGHT = 94;

const isDev = process.env.NODE_ENV === "development";

function alive(win) {
  return win && !win.isDestroyed();
}

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

  // Fires before the native window actually tears down - flip the flag here,
  // not in "closed", so any move/resize event that sneaks in during teardown
  // (a real, observed race) is ignored instead of touching a half-destroyed
  // native handle.
  mainWindow.on("close", () => {
    closing = true;
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (mpv) mpv.stop();
    if (alive(videoWindow)) videoWindow.close();
    if (alive(controlsWindow)) controlsWindow.close();
  });

  mainWindow.on("move", () => applyVideoBounds());
  mainWindow.on("resize", () => applyVideoBounds());
}

// Real native mpv render target - a plain window, no web content of its own.
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

// A transparent, always-on-top window sized identically to videoWindow, sitting
// above it in z-order. mpv's native window paints over ALL renderer content at
// its bounds, so the only way to show UI (back button, seek bar) "on top of"
// the video is a second real window layered above it - not a DOM overlay in
// mainWindow, which would render behind mpv regardless of CSS z-index.
function createControlsWindow() {
  controlsWindow = new BrowserWindow({
    parent: mainWindow,
    show: false,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  controlsWindow.setMenu(null);
  controlsWindow.setIgnoreMouseEvents(false);
  // Forward this window's renderer console.log into our own stdout so click
  // diagnostics show up in the same log stream as everything else, instead
  // of being trapped in a devtools window nobody has open.
  controlsWindow.webContents.on("console-message", (_e, level, message) => {
    console.log("[controlsWindow console]", message);
  });
  controlsWindow.loadFile(path.join(__dirname, "playerControls.html"));
}

app.whenReady().then(() => {
  createMainWindow();
  createVideoWindow();
  createControlsWindow();
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

  ipcMain.handle("system:stats", () => systemStats.getStats());
  ipcMain.handle("discord:isConnected", () => discordRpc.isConnected());

  const updater = autoUpdaterModule.init(mainWindow);
  ipcMain.handle("updater:check", () => updater.check());
  ipcMain.handle("updater:download", () => updater.download());
  ipcMain.handle("updater:install", async () => {
    if (mpv) {
      mpv.stop();
      mpv = null;
    }
    for (let remaining = 6; remaining > 0; remaining--) {
      if (alive(mainWindow)) mainWindow.webContents.send("updater:restart-countdown", { secondsLeft: remaining });
      await new Promise((r) => setTimeout(r, 1000));
    }
    updater.installNow();
  });

  ipcMain.handle("player:start", async (_e, meta) => {
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
      if (alive(mainWindow)) mainWindow.webContents.send("player:property-change", msg);
      if (alive(controlsWindow)) controlsWindow.webContents.send("player:property-change", msg);
    });
    mpv.on("mpv-exit", (msg) => {
      if (alive(mainWindow)) mainWindow.webContents.send("player:mpv-exit", msg);
      if (alive(controlsWindow)) controlsWindow.webContents.send("player:mpv-exit", msg);
    });
    if (alive(controlsWindow) && meta) controlsWindow.webContents.send("player:meta", meta);
    return true;
  });

  ipcMain.handle("player:load", async (_e, url) => {
    if (!mpv) return false;
    await mpv.loadFile(url);
    if (alive(controlsWindow)) controlsWindow.webContents.send("player:ready");
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
    if (alive(videoWindow)) videoWindow.hide();
    if (alive(controlsWindow)) controlsWindow.hide();
    return true;
  });

  ipcMain.on("player:bounds", (_e, bounds) => {
    lastBounds = bounds;
    applyVideoBounds();
  });

  ipcMain.on("player:back-requested", () => {
    console.log("[main] player:back-requested received, forwarding to mainWindow");
    if (alive(mainWindow)) mainWindow.webContents.send("player:back");
  });
});

function applyVideoBounds() {
  if (closing || !lastBounds || !alive(videoWindow) || !alive(mainWindow)) return;
  try {
    const mb = mainWindow.getContentBounds();
    if (lastBounds.visible) {
      const bounds = {
        x: mb.x + Math.round(lastBounds.x),
        y: mb.y + Math.round(lastBounds.y),
        width: Math.max(1, Math.round(lastBounds.width)),
        height: Math.max(1, Math.round(lastBounds.height))
      };
      videoWindow.setBounds(bounds);
      if (!videoWindow.isVisible()) videoWindow.showInactive();

      if (alive(controlsWindow)) {
        controlsWindow.setBounds(bounds);
        try {
          controlsWindow.setShape([
            { x: 0, y: 0, width: bounds.width, height: Math.min(TOP_BAR_HEIGHT, bounds.height) },
            {
              x: 0,
              y: Math.max(0, bounds.height - BOTTOM_BAR_HEIGHT),
              width: bounds.width,
              height: Math.min(BOTTOM_BAR_HEIGHT, bounds.height)
            }
          ]);
        } catch (e) {
          console.error("[applyVideoBounds] setShape failed:", e.message);
        }
        if (!controlsWindow.isVisible()) controlsWindow.showInactive();
        controlsWindow.moveTop(); // keep controls above the mpv window
      }
    } else {
      videoWindow.hide();
      if (alive(controlsWindow)) controlsWindow.hide();
    }
  } catch (e) {
    // Defensive only: isDestroyed() can lag one tick behind the native handle
    // actually going away during teardown - never let that crash the app.
    console.error("[applyVideoBounds] ignored error during window teardown:", e.message);
  }
}

app.on("window-all-closed", () => {
  if (mpv) mpv.stop();
  if (process.platform !== "darwin") app.quit();
});
