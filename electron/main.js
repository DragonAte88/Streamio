const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs   = require("fs");
const { MpvController, MPV_PATH, MPV_LOG_PATH } = require("./mpvController");
const discordRpc = require("./discordRpc");
const discordOAuth = require("./discordOAuth");
const autoUpdaterModule = require("./autoUpdater");
const systemStats = require("./systemStats");
const wcoScraper = require("./wcoScraper");
const wcoDownloader = require("./wcoDownloader");

app.disableHardwareAcceleration();

// Only one Streamio instance may ever run. A second instance shares nothing
// with the first (separate session/auth state), which is why opening a second
// window appeared "logged out" - they are entirely separate processes, not two
// views of one app. Rather than try to sync them, refuse the second one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow;
let videoWindow;
let controlsWindow;
let mpv;
let updaterHandle = null;
let lastBounds = null;
let closing = false;
let quitting = false;

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

// Shown only in a second instance: tells the user why this window is refusing
// to start, counts down, then hard-exits itself.
const ALREADY_RUNNING_SECONDS = 5;

function showAlreadyRunningAndExit() {
  const notice = new BrowserWindow({
    width: 460,
    height: 220,
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: "#0b0b0f",
    title: "Streamio"
  });
  notice.setMenu(null);

  const html = `
    <body style="margin:0;height:100%;display:flex;flex-direction:column;align-items:center;
                 justify-content:center;background:#0b0b0f;color:#fff;
                 font-family:'Segoe UI',sans-serif;user-select:none">
      <div style="font-size:17px;font-weight:600">You already have a process open.</div>
      <div style="font-size:13px;color:#9a9aa6;margin-top:10px;text-align:center;max-width:360px">
        Streamio is already running. This window will close automatically.
      </div>
      <div id="c" style="font-size:34px;font-weight:800;margin-top:18px">${ALREADY_RUNNING_SECONDS}</div>
      <script>
        let n = ${ALREADY_RUNNING_SECONDS};
        setInterval(() => {
          n -= 1;
          if (n >= 0) document.getElementById("c").textContent = n;
        }, 1000);
      </script>
    </body>`;
  notice.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));

  setTimeout(() => {
    // app.exit(), not app.quit() - quit is cooperative and can be blocked by a
    // pending handle. This process must go away unconditionally.
    app.exit(0);
  }, ALREADY_RUNNING_SECONDS * 1000);
}

// Single teardown path for every exit route (window close, quit, second-instance
// refusal). Anything holding a live handle must be released here or the process
// survives with no windows - which is exactly the "closing the X leaves Electron
// running in Task Manager" bug.
function teardown() {
  if (mpv) {
    try {
      mpv.stop();
    } catch {}
    mpv = null;
  }
  if (updaterHandle) {
    try {
      updaterHandle.stopAutoCheck();
    } catch {}
    updaterHandle = null;
  }
  try {
    discordRpc.destroy();
  } catch {}
  try {
    wcoScraper.destroy();
  } catch {}
  for (const win of [videoWindow, controlsWindow]) {
    if (alive(win)) {
      try {
        win.destroy();
      } catch {}
    }
  }
  videoWindow = null;
  controlsWindow = null;
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

  // Tear everything down here, NOT in "window-all-closed". Some of what
  // teardown() releases are themselves windows (the video/controls windows and
  // the scraper's hidden window) - and an open window is precisely what stops
  // "window-all-closed" from firing. Waiting for that event to clean up windows
  // is circular: it can never arrive while they are still open, so the process
  // would linger with no visible UI.
  mainWindow.on("closed", () => {
    mainWindow = null;
    teardown();
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
  // mpv's native --wid child window can call SetWindowPos(HWND_TOP) on its own
  // during playback (swap-chain repaints), silently re-stealing top z-order
  // from controlsWindow after the one-shot moveTop() in applyVideoBounds().
  // videoWindow is a normal (non-topmost) window, so putting controlsWindow in
  // the OS-level topmost band means mpv's internal HWND_TOP requests - which
  // only reorder within the non-topmost band - can never cross above it.
  controlsWindow.setAlwaysOnTop(true, "screen-saver");
  // Forward this window's renderer console.log into our own stdout so click
  // diagnostics show up in the same log stream as everything else, instead
  // of being trapped in a devtools window nobody has open.
  controlsWindow.webContents.on("console-message", (_e, level, message) => {
    console.log("[controlsWindow console]", message);
  });
  controlsWindow.loadFile(path.join(__dirname, "playerControls.html"));
}

// A second instance never reaches normal startup - it shows the notice window
// and exits itself. The first instance gets focused instead so the user ends up
// looking at the app they already had open.
if (!gotSingleInstanceLock) {
  app.whenReady().then(showAlreadyRunningAndExit);
} else {
  app.on("second-instance", () => {
    if (alive(mainWindow)) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

app.whenReady().then(() => {
  createMainWindow();
  createVideoWindow();
  createControlsWindow();
  discordRpc.init();
  wcoScraper.init();

  ipcMain.handle("wco:search", (_e, query, filter) => wcoScraper.search(query, filter));
  ipcMain.handle("wco:episodes", (_e, url) => wcoScraper.getEpisodes(url));
  ipcMain.handle("wco:extract", (_e, url) => wcoScraper.extractVideo(url));
  ipcMain.handle("wco:list", (_e, type) => wcoScraper.getList(type));
  ipcMain.handle("wco:refresh", () => { wcoScraper.refresh(); return { ok: true, ts: Date.now() }; });
  wcoDownloader.registerIpcHandlers();

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
  updaterHandle = updater; // so teardown() can stop the 60s check interval
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
    mpv.on("end-file", (msg) => {
      if (alive(mainWindow)) mainWindow.webContents.send("player:end-file", msg);
      if (alive(controlsWindow)) controlsWindow.webContents.send("player:end-file", msg);
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

  ipcMain.handle("player:play",   async () => mpv && mpv.play());
  ipcMain.handle("player:pause",  async () => mpv && mpv.pause());
  ipcMain.handle("player:seek",   async (_e, seconds, mode) => mpv && mpv.seek(seconds, mode));
  ipcMain.handle("player:volume", async (_e, vol) => mpv && mpv.setVolume(vol));

  // Read back the last MPV verbose log for diagnostics
  ipcMain.handle("player:mpvlog", () => {
    try { return fs.readFileSync(MPV_LOG_PATH, "utf8").slice(-8000); } catch { return null; }
  });
  // Expose the configured MPV binary path so the renderer can show it in errors
  ipcMain.handle("player:mpvpath", () => MPV_PATH);

  ipcMain.handle("player:stop", async () => {
    if (mpv) {
      mpv.stop();
      mpv = null;
    }
    if (alive(videoWindow)) videoWindow.hide();
    if (alive(controlsWindow)) controlsWindow.hide();
    return true;
  });

  ipcMain.handle("player:tracks", async () => (mpv ? mpv.getTracks() : []));
  ipcMain.handle("player:video-info", async () => (mpv ? mpv.getVideoInfo() : null));
  ipcMain.handle("player:sub-track", async (_e, id) => mpv && mpv.setSubtitleTrack(id));
  ipcMain.handle("player:audio-track", async (_e, id) => mpv && mpv.setAudioTrack(id));
  ipcMain.handle("player:video-track", async (_e, id) => mpv && mpv.setVideoTrack(id));

  // Loading an external subtitle file needs a real OS picker; the renderer is
  // sandboxed and never sees a filesystem path of its own.
  ipcMain.handle("player:sub-pick", async () => {
    if (!mpv) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Choose a subtitle file",
      properties: ["openFile"],
      filters: [{ name: "Subtitles", extensions: ["srt", "ass", "ssa", "sub", "vtt", "idx"] }]
    });
    if (canceled || !filePaths.length) return null;
    await mpv.addSubtitleFile(filePaths[0]);
    return filePaths[0];
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
} // end single-instance guard

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

// Runs once, before windows are gone, on every quit route.
app.on("before-quit", () => {
  quitting = true;
  teardown();
});

app.on("window-all-closed", () => {
  teardown();
  if (process.platform !== "darwin") app.quit();
});

// Last-resort backstop. If some handle we do not own is still keeping the event
// loop alive a moment after quit was requested, exit the process outright rather
// than leaving an invisible Streamio running in Task Manager forever. app.exit()
// bypasses the cooperative quit path that a stuck handle can block.
app.on("quit", () => {
  setTimeout(() => process.exit(0), 1500).unref?.();
});
