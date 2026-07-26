// Small internal HTTP server, fronted by Caddy at 167-234-210-42.sslip.io.
// The ONLY caller is Roblox's Script.lua, POSTing here on every real channel
// switch so the bot always knows the current source URL for /connect -
// Roblox can make outbound HttpService calls but can't itself be polled, so
// this has to be push (Roblox -> bot), not the bot pulling from Roblox.
const http = require('http');
const nowPlaying = require('./nowPlayingState');
const voicePlayback = require('./voicePlayback');

const PORT = parseInt(process.env.PORT, 10) || 8787;

function start() {
    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/nowplaying') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    if (typeof data.url !== 'string' || !data.url) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: false, error: 'missing url' }));
                        return;
                    }
                    nowPlaying.set(data.name || null, data.url);
                    console.log(`[NowPlaying] Updated: ${data.name || '(unnamed)'} -> ${data.url}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
                }
            });
            return;
        }

        if (req.method === 'GET' && req.url === '/nowplaying') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(nowPlaying.get()));
            return;
        }

        if (req.method === 'POST' && req.url === '/volume') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    if (typeof data.percent !== 'number') {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: false, error: 'missing percent' }));
                        return;
                    }
                    const applied = voicePlayback.setVolume(data.percent);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true, percent: applied }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
                }
            });
            return;
        }

        // Real audio/video sync feedback loop: Roblox already knows exactly
        // how many batches behind the encoder's live position it currently
        // is (its own buffering telemetry), converts that to milliseconds
        // using its own measured fps, and pushes it here every 3s. Lets the
        // bot's compensating audio delay track ACTUAL measured video lag
        // instead of a static guessed constant - see nowPlayingState.js and
        // voicePlayback.js for how this gets used.
        if (req.method === 'POST' && req.url === '/videolag') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    if (typeof data.lagMs !== 'number') {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: false, error: 'missing lagMs' }));
                        return;
                    }
                    nowPlaying.setVideoLag(data.lagMs);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
                }
            });
            return;
        }

        if (req.method === 'GET' && req.url === '/volume') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ percent: voicePlayback.getVolume() }));
            return;
        }

        // Single combined status check for the Network debug dashboard -
        // Roblox polls this to show the bot's own state (online, whether a
        // voice session is actually active, current volume, what it thinks
        // is playing) alongside the encoder backends' own /status responses.
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                online: true,
                voiceConnected: voicePlayback.isConnectedAny(),
                volumePercent: voicePlayback.getVolume(),
                nowPlaying: nowPlaying.get(),
            }));
            return;
        }

        res.writeHead(404);
        res.end();
    });

    server.listen(PORT, () => {
        console.log(`[HttpServer] Listening on 0.0.0.0:${PORT}`);
    });
}

module.exports = { start };
