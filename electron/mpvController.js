const { spawn } = require("child_process");
const net = require("net");
const path = require("path");
const os = require("os");

const PIPE_NAME = "\\\\.\\pipe\\streamio-mpvsocket";
const MPV_PATH = process.env.MPV_PATH || "C:\\Program Files\\MPV Player\\mpv.exe";
const MPV_LOG_PATH = path.join(os.tmpdir(), "streamio-mpv.log");

class MpvController {
  constructor() {
    this.proc = null;
    this.sock = null;
    this.requestId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.buffer = "";
  }

  start(wid) {
    if (this.proc) this.stop();

    const args = [
      `--wid=${wid}`,
      `--input-ipc-server=${PIPE_NAME}`,
      "--idle=yes",
      "--force-window=yes",
      "--no-osc",
      "--no-input-default-bindings",
      "--osd-level=0",
      "--keep-open=yes",
      "--hwdec=auto",
      // Restrict hardware decode to H.264 only - the codec virtually every
      // live IPTV/HLS source actually uses. Anything else (H.265, VP9, etc.)
      // falls back to software decode, which always works and avoids
      // hwdec-driver edge cases entirely for the codecs that aren't the
      // common case here. This doesn't reject other codecs, it just doesn't
      // gamble hardware-decode compatibility on them.
      "--hwdec-codecs=h264",
      // gpu-next (libplacebo) can silently fail to paint into a --wid embedded
      // window on some Windows GPU/driver combos - audio and time-pos keep
      // advancing normally while the video surface just stays black. The
      // classic gpu/d3d11 backend is the well-tested combination for --wid
      // embedding on Windows.
      "--vo=gpu",
      "--gpu-context=d3d11",
      // Verbose vo/gpu diagnostics written to a fixed, known path so a real
      // rendering failure can be read back afterward instead of guessed at -
      // this file is overwritten (not appended) on every new stream load.
      `--log-file=${MPV_LOG_PATH}`,
      "--msg-level=all=v,vo=trace,gpu=trace,cplayer=v",
      "--cache=yes",
      "--cache-secs=10",
      "--demuxer-max-bytes=50MiB",
      "--network-timeout=15",
      "--user-agent=Mozilla/5.0 (StreamioDesktop)"
    ];

    this.proc = spawn(MPV_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });
    this.proc.stdout.on("data", (d) => console.log("[mpv]", d.toString().trim()));
    this.proc.stderr.on("data", (d) => console.error("[mpv:err]", d.toString().trim()));
    this.proc.on("exit", (code) => {
      this._emit("mpv-exit", { code });
      this.proc = null;
    });

    return this._connectWithRetry();
  }

  _connectWithRetry(attempt = 0) {
    return new Promise((resolve, reject) => {
      const tryConnect = () => {
        const sock = net.connect(PIPE_NAME);
        sock.once("connect", () => {
          this.sock = sock;
          this.buffer = "";
          sock.on("data", (chunk) => this._onData(chunk));
          sock.on("error", () => {});
          resolve();
        });
        sock.once("error", () => {
          if (attempt++ < 40) {
            setTimeout(tryConnect, 100);
          } else {
            reject(new Error("mpv IPC connect timeout"));
          }
        });
      };
      tryConnect();
    });
  }

  _onData(chunk) {
    this.buffer += chunk.toString("utf8");
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.request_id !== undefined && this.pending.has(msg.request_id)) {
        const { resolve, reject } = this.pending.get(msg.request_id);
        this.pending.delete(msg.request_id);
        if (msg.error && msg.error !== "success") reject(new Error(msg.error));
        else resolve(msg.data);
      } else if (msg.event) {
        this._emit(msg.event, msg);
      }
    }
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
  }

  _emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) for (const cb of set) cb(payload);
  }

  command(args) {
    if (!this.sock) return Promise.reject(new Error("mpv not connected"));
    const request_id = ++this.requestId;
    const payload = JSON.stringify({ command: args, request_id }) + "\n";
    return new Promise((resolve, reject) => {
      this.pending.set(request_id, { resolve, reject });
      this.sock.write(payload);
      setTimeout(() => {
        if (this.pending.has(request_id)) {
          this.pending.delete(request_id);
          reject(new Error("mpv command timeout: " + JSON.stringify(args)));
        }
      }, 5000);
    });
  }

  loadFile(url) {
    return this.command(["loadfile", url, "replace"]);
  }

  play() {
    return this.command(["set_property", "pause", false]);
  }

  pause() {
    return this.command(["set_property", "pause", true]);
  }

  seek(seconds, mode = "absolute") {
    return this.command(["seek", seconds, mode]);
  }

  setVolume(vol) {
    return this.command(["set_property", "volume", vol]);
  }

  observe(name, id) {
    return this.command(["observe_property", id, name]);
  }

  stop() {
    if (this.sock) {
      try {
        this.sock.destroy();
      } catch {}
      this.sock = null;
    }
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {}
      this.proc = null;
    }
  }
}

module.exports = { MpvController, MPV_PATH, MPV_LOG_PATH };
