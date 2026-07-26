const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("player", {
  start:      (meta) => ipcRenderer.invoke("player:start", meta),
  load:       (url)  => ipcRenderer.invoke("player:load", url),
  play:       ()     => ipcRenderer.invoke("player:play"),
  pause:      ()     => ipcRenderer.invoke("player:pause"),
  seek:       (seconds, mode) => ipcRenderer.invoke("player:seek", seconds, mode),
  setVolume:  (vol)  => ipcRenderer.invoke("player:volume", vol),
  stop:       ()     => ipcRenderer.invoke("player:stop"),
  setBounds:  (bounds) => ipcRenderer.send("player:bounds", bounds),
  getMpvLog:  ()     => ipcRenderer.invoke("player:mpvlog"),
  getMpvPath: ()     => ipcRenderer.invoke("player:mpvpath"),
  // Track / codec introspection - real data from the demuxer, used by the
  // subtitle and quality menus.
  getTracks:        ()   => ipcRenderer.invoke("player:tracks"),
  getVideoInfo:     ()   => ipcRenderer.invoke("player:video-info"),
  setSubtitleTrack: (id) => ipcRenderer.invoke("player:sub-track", id),
  addSubtitleFile:  ()   => ipcRenderer.invoke("player:sub-pick"),
  setAudioTrack:    (id) => ipcRenderer.invoke("player:audio-track", id),
  setVideoTrack:    (id) => ipcRenderer.invoke("player:video-track", id),
  onPropertyChange: (cb) => {
    const listener = (_e, msg) => cb(msg);
    ipcRenderer.on("player:property-change", listener);
    return () => ipcRenderer.removeListener("player:property-change", listener);
  },
  onExit: (cb) => {
    const listener = (_e, msg) => cb(msg);
    ipcRenderer.on("player:mpv-exit", listener);
    return () => ipcRenderer.removeListener("player:mpv-exit", listener);
  },
  onEndFile: (cb) => {
    const listener = (_e, msg) => cb(msg);
    ipcRenderer.on("player:end-file", listener);
    return () => ipcRenderer.removeListener("player:end-file", listener);
  },
  onBack: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("player:back", listener);
    return () => ipcRenderer.removeListener("player:back", listener);
  }
});


contextBridge.exposeInMainWorld("playerControlsBridge", {
  requestBack: () => ipcRenderer.send("player:back-requested"),
  onMeta: (cb) => {
    const listener = (_e, meta) => cb(meta);
    ipcRenderer.on("player:meta", listener);
    return () => ipcRenderer.removeListener("player:meta", listener);
  },
  onReady: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("player:ready", listener);
    return () => ipcRenderer.removeListener("player:ready", listener);
  }
});

contextBridge.exposeInMainWorld("discord", {
  setWatching: (channelName) => ipcRenderer.invoke("discord:watching", channelName),
  clear: () => ipcRenderer.invoke("discord:clear"),
  startOAuth: () => ipcRenderer.invoke("discord:oauth:start"),
  isConnected: () => ipcRenderer.invoke("discord:isConnected")
});

contextBridge.exposeInMainWorld("system", {
  getStats: () => ipcRenderer.invoke("system:stats")
});

contextBridge.exposeInMainWorld("updater", {
  check: () => ipcRenderer.invoke("updater:check"),
  download: () => ipcRenderer.invoke("updater:download"),
  install: () => ipcRenderer.invoke("updater:install"),
  onStatus: (cb) => {
    const listener = (_e, status) => cb(status);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  },
  onRestartCountdown: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("updater:restart-countdown", listener);
    return () => ipcRenderer.removeListener("updater:restart-countdown", listener);
  }
});

contextBridge.exposeInMainWorld("wco", {
  search: (query, filter) => ipcRenderer.invoke("wco:search", query, filter),
  getEpisodes: (url) => ipcRenderer.invoke("wco:episodes", url),
  extractVideo: (url) => ipcRenderer.invoke("wco:extract", url),
  getList: (type) => ipcRenderer.invoke("wco:list", type),
  refresh: () => ipcRenderer.invoke("wco:refresh"),
  // Downloader
  startSeasonDownload: (params) => ipcRenderer.invoke("wco:start-season-download", params),
  getDownloadStatus: () => ipcRenderer.invoke("wco:get-download-status"),
  onDownloadProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on("wco:download-progress", listener);
    return () => ipcRenderer.removeListener("wco:download-progress", listener);
  },
});
