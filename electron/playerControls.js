const topLayer = document.getElementById("topLayer");
const bottomLayer = document.getElementById("bottomLayer");
const backBtn = document.getElementById("backBtn");
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

backBtn.addEventListener("click", () => window.playerControlsBridge.requestBack());

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
});
