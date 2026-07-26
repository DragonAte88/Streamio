const { Client } = require("@xhayper/discord-rpc");

const CLIENT_ID = "1529308527972192367";

let client = null;
let ready = false;
let startTimestamp = null;

async function init() {
  if (client) return;
  client = new Client({ clientId: CLIENT_ID });
  client.on("ready", () => {
    ready = true;
    console.log("[discord-rpc] connected as", client.user?.username);
  });
  try {
    await client.login();
  } catch (e) {
    console.log("[discord-rpc] no local Discord client found, skipping:", e.message);
    client = null;
  }
}

function setWatching(channelName) {
  if (!client || !ready) return;
  if (!startTimestamp) startTimestamp = Date.now();
  client.user
    ?.setActivity({
      type: 3, // Watching
      details: channelName,
      state: "via Streamio",
      startTimestamp,
      largeImageKey: "streamio_logo",
      largeImageText: "Streamio"
    })
    .catch((e) => console.log("[discord-rpc] setActivity failed:", e.message));
}

function clear() {
  startTimestamp = null;
  if (!client || !ready) return;
  client.user?.clearActivity().catch(() => {});
}

function isConnected() {
  return { connected: ready, username: client?.user?.username || null };
}

// The RPC client holds an open IPC socket to the local Discord app. That socket
// is a live libuv handle - if it is never closed, the Electron main process
// stays alive after every window is gone and the app never actually exits.
// Must be called during shutdown.
function destroy() {
  ready = false;
  startTimestamp = null;
  if (!client) return;
  try {
    client.destroy();
  } catch {}
  client = null;
}

module.exports = { init, setWatching, clear, isConnected, destroy };
