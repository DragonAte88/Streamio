const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("player", {
  start: () => ipcRenderer.invoke("player:start"),
  load: (url) => ipcRenderer.invoke("player:load", url),
  play: () => ipcRenderer.invoke("player:play"),
  pause: () => ipcRenderer.invoke("player:pause"),
  seek: (seconds, mode) => ipcRenderer.invoke("player:seek", seconds, mode),
  setVolume: (vol) => ipcRenderer.invoke("player:volume", vol),
  stop: () => ipcRenderer.invoke("player:stop"),
  setBounds: (bounds) => ipcRenderer.send("player:bounds", bounds),
  onPropertyChange: (cb) => {
    const listener = (_e, msg) => cb(msg);
    ipcRenderer.on("player:property-change", listener);
    return () => ipcRenderer.removeListener("player:property-change", listener);
  },
  onExit: (cb) => {
    const listener = (_e, msg) => cb(msg);
    ipcRenderer.on("player:mpv-exit", listener);
    return () => ipcRenderer.removeListener("player:mpv-exit", listener);
  }
});

contextBridge.exposeInMainWorld("discord", {
  setWatching: (channelName) => ipcRenderer.invoke("discord:watching", channelName),
  clear: () => ipcRenderer.invoke("discord:clear"),
  startOAuth: () => ipcRenderer.invoke("discord:oauth:start")
});

contextBridge.exposeInMainWorld("updater", {
  check: () => ipcRenderer.invoke("updater:check"),
  download: () => ipcRenderer.invoke("updater:download"),
  install: () => ipcRenderer.invoke("updater:install"),
  onStatus: (cb) => {
    const listener = (_e, status) => cb(status);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  }
});
