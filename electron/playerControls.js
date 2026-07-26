const topLayer = document.getElementById("topLayer");
const bottomLayer = document.getElementById("bottomLayer");
const backArea = document.getElementById("backArea");
const backLabel = document.getElementById("backLabel");
const titleEl = document.getElementById("title");
const seek = document.getElementById("seek");
const timeCur = document.getElementById("timeCur");
const timeDur = document.getElementById("timeDur");
const bufferEl = document.getElementById("buffer");
const playPause = document.getElementById("playPause");
const volume = document.getElementById("volume");
const centerMsg = document.getElementById("centerMsg");

let duration = null;
let paused = false;
let ready = false;

function fmt(sec) {
  if (sec == null || !isFinite(sec)) return "--:--";
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  const m = Math.floor((sec / 60) % 60).toString().padStart(2, "0");
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

window.playerControlsBridge.onMeta(({ channelName, backLabel: label }) => {
  titleEl.textContent = channelName;
  backLabel.textContent = `Back to ${label}`;
});

window.player.onPropertyChange((msg) => {
  if (msg.name === "time-pos" && !seek.dragging) {
    const pct = duration ? (msg.data / duration) * 100 : 0;
    seek.value = isFinite(pct) ? pct : 0;
    timeCur.textContent = fmt(msg.data);
  }
  if (msg.name === "duration") {
    duration = msg.data;
    timeDur.textContent = duration ? fmt(duration) : "LIVE";
  }
  if (msg.name === "pause") {
    paused = !!msg.data;
    playPause.textContent = paused ? "▶" : "❚❚";
  }
  if (msg.name === "demuxer-cache-duration") {
    bufferEl.textContent = `buffer: ${(msg.data || 0).toFixed(1)}s`;
  }
});

window.player.onExit(() => {
  centerMsg.textContent = "Playback engine exited unexpectedly.";
  centerMsg.classList.add("error");
  centerMsg.style.display = "flex";
});

backArea.addEventListener("click", () => {
  window.playerControlsBridge.requestBack();
});

/* ─── Subtitle / audio / quality menus ──────────────────────────────────────
   Everything below is driven by mpv's real track-list and video-params. No
   option is offered that the stream does not actually contain - if a live
   channel carries a single 1080p H.264 track, that is the only thing listed,
   because presenting "720p" or "480p" the source never sends would be a lie. */

const subBtn = document.getElementById("subBtn");
const subPopup = document.getElementById("subPopup");
const subLabel = document.getElementById("subLabel");
const audioBtn = document.getElementById("audioBtn");
const audioPopup = document.getElementById("audioPopup");
const audioLabel = document.getElementById("audioLabel");
const qualityBtn = document.getElementById("qualityBtn");
const qualityPopup = document.getElementById("qualityPopup");
const qualityLabel = document.getElementById("qualityLabel");

let tracks = [];
let videoInfo = null;

const LANG_NAMES = {
  eng: "English", en: "English", spa: "Spanish", es: "Spanish", fre: "French", fra: "French",
  fr: "French", ger: "German", deu: "German", de: "German", ita: "Italian", it: "Italian",
  por: "Portuguese", pt: "Portuguese", rus: "Russian", ru: "Russian", jpn: "Japanese",
  ja: "Japanese", kor: "Korean", ko: "Korean", chi: "Chinese", zho: "Chinese", zh: "Chinese",
  ara: "Arabic", ar: "Arabic", hin: "Hindi", hi: "Hindi", nld: "Dutch", dut: "Dutch",
  pol: "Polish", swe: "Swedish", nor: "Norwegian", dan: "Danish", fin: "Finnish", tur: "Turkish"
};

function langName(code) {
  if (!code) return null;
  return LANG_NAMES[code.toLowerCase()] || code.toUpperCase();
}

function trackLabel(t) {
  // Prefer the embedded title, then language, then a plain track number - so
  // there is always something meaningful to click.
  const parts = [];
  if (t.title) parts.push(t.title);
  else if (langName(t.lang)) parts.push(langName(t.lang));
  else parts.push(`Track ${t.id}`);
  return parts.join(" ");
}

/** Human resolution tier from real pixel height. */
function resolutionTier(h) {
  if (!h) return null;
  if (h >= 2160) return "4K";
  if (h >= 1440) return "1440p";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  if (h >= 576) return "576p";
  if (h >= 480) return "480p";
  if (h >= 360) return "360p";
  return `${h}p`;
}

function closeAllPopups(except) {
  [subPopup, audioPopup, qualityPopup].forEach((p) => {
    if (p !== except) p.classList.remove("open");
  });
}

// Clicking anywhere else dismisses an open menu.
document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu-wrap")) closeAllPopups(null);
});

async function refreshTracks() {
  try {
    tracks = (await window.player.getTracks()) || [];
    videoInfo = await window.player.getVideoInfo();
  } catch {
    tracks = [];
    videoInfo = null;
  }
  renderSubMenu();
  renderAudioMenu();
  renderQualityMenu();
}

function renderSubMenu() {
  const subs = tracks.filter((t) => t.type === "sub");
  const active = subs.find((t) => t.selected);
  subLabel.textContent = active ? trackLabel(active) : "Subtitles";
  subBtn.classList.toggle("on", !!active);

  let html = '<div class="popup-head">Subtitles</div>';
  html += `<div class="popup-item ${!active ? "active" : ""}" data-sub="off">Off</div>`;

  for (const t of subs) {
    const bits = [t.codec, t.external ? "external" : null].filter(Boolean).join(" · ");
    html += `<div class="popup-item ${t.selected ? "active" : ""}" data-sub="${t.id}">
      <div style="flex:1">${trackLabel(t)}${bits ? `<div class="sub">${bits}</div>` : ""}</div>
    </div>`;
  }

  if (subs.length === 0) {
    html += '<div class="popup-empty">This stream carries no subtitle tracks. Live IPTV rarely includes them — you can still load your own file below.</div>';
  }

  html += '<div class="popup-sep"></div><div class="popup-item" data-sub="file">📁 Load subtitle file…</div>';
  subPopup.innerHTML = html;
}

function renderAudioMenu() {
  const auds = tracks.filter((t) => t.type === "audio");
  const active = auds.find((t) => t.selected);
  audioLabel.textContent = active ? trackLabel(active) : "Audio";

  let html = '<div class="popup-head">Audio track</div>';
  if (auds.length === 0) {
    html += '<div class="popup-empty">No audio tracks reported yet.</div>';
  } else {
    for (const t of auds) {
      const bits = [t.codec, t.channels ? `${t.channels}ch` : null].filter(Boolean).join(" · ");
      html += `<div class="popup-item ${t.selected ? "active" : ""}" data-audio="${t.id}">
        <div style="flex:1">${trackLabel(t)}${bits ? `<div class="sub">${bits}</div>` : ""}</div>
      </div>`;
    }
  }
  audioPopup.innerHTML = html;
}

function renderQualityMenu() {
  const vids = tracks.filter((t) => t.type === "video");
  const tier = resolutionTier(videoInfo?.height);
  qualityLabel.textContent = tier || "Quality";

  let html = '<div class="popup-head">Now decoding</div>';
  if (videoInfo) {
    const rows = [
      ["Resolution", videoInfo.width && videoInfo.height ? `${videoInfo.width} × ${videoInfo.height}${tier ? ` (${tier})` : ""}` : "—"],
      ["Video codec", videoInfo.codec || "—"],
      ["Pixel format", videoInfo.pixelFormat || "—"],
      ["Frame rate", videoInfo.fps ? `${Number(videoInfo.fps).toFixed(2)} fps` : "—"],
      ["Decoder", videoInfo.hwdec && videoInfo.hwdec !== "no" ? `Hardware (${videoInfo.hwdec})` : "Software"],
      ["Dropped frames", videoInfo.droppedFrames ?? "—"]
    ];
    html += rows
      .map(
        ([k, v]) =>
          `<div class="popup-item" style="cursor:default"><div style="flex:1;color:#8a8a99">${k}</div><div>${v}</div></div>`
      )
      .join("");
  } else {
    html += '<div class="popup-empty">No video parameters reported yet.</div>';
  }

  if (vids.length > 1) {
    html += '<div class="popup-sep"></div><div class="popup-head">Video tracks</div>';
    for (const t of vids) {
      const t2 = resolutionTier(t.height);
      const bits = [t.codec, t.width && t.height ? `${t.width}×${t.height}` : null].filter(Boolean).join(" · ");
      html += `<div class="popup-item ${t.selected ? "active" : ""}" data-video="${t.id}">
        <div style="flex:1">${t2 || trackLabel(t)}${bits ? `<div class="sub">${bits}</div>` : ""}</div>
      </div>`;
    }
  } else {
    html +=
      '<div class="popup-sep"></div><div class="popup-empty">This source exposes a single video track, so there are no alternate qualities to switch between. Adaptive streams are switched by the server based on your bandwidth.</div>';
  }

  qualityPopup.innerHTML = html;
}

subBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  const opening = !subPopup.classList.contains("open");
  closeAllPopups(subPopup);
  if (opening) await refreshTracks();
  subPopup.classList.toggle("open", opening);
});

audioBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  const opening = !audioPopup.classList.contains("open");
  closeAllPopups(audioPopup);
  if (opening) await refreshTracks();
  audioPopup.classList.toggle("open", opening);
});

qualityBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  const opening = !qualityPopup.classList.contains("open");
  closeAllPopups(qualityPopup);
  if (opening) await refreshTracks();
  qualityPopup.classList.toggle("open", opening);
});

subPopup.addEventListener("click", async (e) => {
  const item = e.target.closest("[data-sub]");
  if (!item) return;
  const val = item.getAttribute("data-sub");
  if (val === "file") {
    await window.player.addSubtitleFile(); // opens a native picker in the main process
  } else if (val === "off") {
    await window.player.setSubtitleTrack(null);
  } else {
    await window.player.setSubtitleTrack(Number(val));
  }
  await refreshTracks();
  subPopup.classList.remove("open");
});

audioPopup.addEventListener("click", async (e) => {
  const item = e.target.closest("[data-audio]");
  if (!item) return;
  await window.player.setAudioTrack(Number(item.getAttribute("data-audio")));
  await refreshTracks();
  audioPopup.classList.remove("open");
});

qualityPopup.addEventListener("click", async (e) => {
  const item = e.target.closest("[data-video]");
  if (!item) return;
  await window.player.setVideoTrack(Number(item.getAttribute("data-video")));
  await refreshTracks();
  qualityPopup.classList.remove("open");
});

playPause.addEventListener("click", () => {
  if (paused) window.player.play();
  else window.player.pause();
});

seek.addEventListener("mousedown", () => (seek.dragging = true));
seek.addEventListener("change", () => {
  seek.dragging = false;
  if (duration) window.player.seek((Number(seek.value) / 100) * duration, "absolute");
});

volume.addEventListener("input", () => window.player.setVolume(Number(volume.value)));

// Fade controls in on mouse activity, out after idle - standard fullscreen player UX.
let idleTimer = null;
function showControls() {
  topLayer.classList.add("visible");
  bottomLayer.classList.add("visible");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    topLayer.classList.remove("visible");
    bottomLayer.classList.remove("visible");
  }, 3000);
}
document.addEventListener("mousemove", showControls);
showControls();

window.playerControlsBridge.onReady(() => {
  ready = true;
  centerMsg.style.display = "none";

  // Track list is empty until the demuxer has actually opened the stream, and
  // for live HLS the audio/subtitle tracks can appear a beat after the video.
  // Poll a few times on a decaying schedule rather than once, so the menus are
  // populated by the time the user opens them without polling forever.
  [300, 1200, 3000, 6000].forEach((delay) => setTimeout(() => refreshTracks(), delay));
});
