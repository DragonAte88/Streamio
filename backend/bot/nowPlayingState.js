// Tiny in-memory store of "what's currently live on the Streamio pipeline" -
// populated by Roblox's Script.lua POSTing here on every real channel switch
// (see httpServer.js), read by the /connect voice command so it can pull audio
// from the exact same source URL the video side is currently decoding.
// videoLagMs starts null (not 0) so voicePlayback can tell "no real
// measurement reported yet" apart from "measured lag is genuinely zero" -
// falls back to a static default delay until the first real sample arrives.
let current = { name: null, url: null, updatedAt: 0, videoLagMs: null, videoLagUpdatedAt: 0 };

// BUG FOUND LIVE: voicePlayback only ever re-read this store's .url lazily,
// at ffmpeg spawn time (initial /connect, a crash respawn, or the periodic
// resync timer). Nothing forced an immediate ffmpeg restart the MOMENT a
// real channel switch happened, so after switching channels in Roblox the
// bot kept playing audio from the OLD url for as long as the periodic timer
// interval (previously 3min, then 45s) - confirmed as the actual cause of
// "wrong audio source when switching channels", not a race in the report
// call itself. Subscribers registered via onChange() get called synchronously
// whenever the URL actually changes (not on every redundant set() call with
// the same url, which would otherwise force a pointless ffmpeg restart on
// every 3s cloud-metrics poll), so voicePlayback can force an immediate
// resync instead of waiting for the next timer tick.
const listeners = [];

function set(name, url) {
    const urlChanged = url !== current.url;
    current = { ...current, name, url, updatedAt: Date.now() };
    if (urlChanged) {
        for (const listener of listeners) {
            try { listener(current); } catch (e) { console.error('[nowPlayingState] listener error:', e); }
        }
    }
}

// Real, measured "how far behind the live encoder position is Roblox's
// video right now" - pushed every 3s by Script.lua's own buffering
// telemetry (see httpServer.js's /videolag route). Deliberately does NOT
// fire onChange listeners - unlike a real channel switch, a routine lag
// update should never force an immediate ffmpeg restart, only inform the
// NEXT natural respawn (crash, periodic resync, or channel change) of the
// freshest known delay to apply.
function setVideoLag(lagMs) {
    current = { ...current, videoLagMs: lagMs, videoLagUpdatedAt: Date.now() };
}

function get() {
    return current;
}

function onChange(listener) {
    listeners.push(listener);
}

module.exports = { set, get, onChange, setVideoLag };
