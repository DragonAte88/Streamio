// /connect voice playback: joins the invoking member's voice channel and pipes
// LIVE audio-only ffmpeg output from whatever URL Roblox last reported via
// nowPlayingState (see httpServer.js) into that channel.
//
// SYNC NOTE (be honest about what this actually guarantees): this is NOT
// frame-accurate lockstep with the Roblox video. Both sides independently pull
// from the SAME live source starting at "now", but each has its own buffering:
// Roblox's client runs an adaptive video buffer (roughly 0.5-2s worth of frames
// depending on jitter, see VideoPlayerPage's HIGH_WATER_FRAMES), and Discord's
// voice pipeline has its own internal jitter buffer/packetization delay on top
// of whatever ffmpeg itself buffers here. In practice that means audio and
// video will be CLOSE (both tracking the same live edge, not independently
// drifting over time) but likely off by something in the low single-digit
// seconds, not perfectly frame-locked - there is no cross-process clock this
// codebase shares between a Roblox client and a Discord voice connection to
// close that gap further without a much more involved shared-timestamp sync
// protocol on both ends.
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    StreamType,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    NoSubscriberBehavior,
    entersState,
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const nowPlaying = require('./nowPlayingState');

const FFMPEG_EXE = process.env.FFMPEG_PATH || 'ffmpeg';

// resource.volume is a prism-media VolumeTransformer, but the exact method
// name available on it has genuinely differed across @discordjs/voice/
// prism-media version combos (confirmed live: setVolumeLinear crashed the
// whole bot process once on this deployment's actual installed versions).
// Try every real API this class has used, in order, instead of betting on one.
function applyVolume(resourceVolume, linear) {
    if (!resourceVolume) return false;
    if (typeof resourceVolume.setVolumeLinear === 'function') {
        resourceVolume.setVolumeLinear(linear);
        return true;
    }
    if (typeof resourceVolume.setVolume === 'function') {
        resourceVolume.setVolume(linear);
        return true;
    }
    if (typeof resourceVolume.setVolumeLogarithmic === 'function') {
        resourceVolume.setVolumeLogarithmic(linear);
        return true;
    }
    // Last resort: prism-media's VolumeTransformer stores its own level on a
    // plain `.volume` field internally - setting it directly still works even
    // without a setter method, since the transform reads it live per-chunk.
    if ('volume' in resourceVolume) {
        resourceVolume.volume = linear;
        return true;
    }
    return false;
}

// One active connection/player per guild - joining again in the same guild
// just restarts playback on the current channel rather than stacking players.
// `generation` is bumped on every deliberate stop/reconnect so a stale
// ffmpeg exit from a PREVIOUS session can never trigger a respawn into the
// current one (same pattern as streamio_encoder.py's ChannelSession).
const activeSessions = new Map(); // guildId -> { connection, player, ffmpegProc, resource, generation }

// Roblox's Volume slider has nothing local to control (Roblox itself never
// plays audio for this stream - see the module docstring), so it remotely
// controls whichever guild's bot session is active instead. Persisted across
// reconnects so /connect picks up the last-set level rather than resetting
// to 100% every time.
let lastVolumeLinear = 1.0; // 0..1, applied via @discordjs/voice's inlineVolume

// REAL FEEDBACK LOOP (replaces the old static guess): Script.lua measures its
// OWN actual lag-behind-the-encoder's-live-position every 3s (batches behind
// * frames/batch / its own measured real fps - the same telemetry it already
// uses for its buffering logic) and pushes that number here via /videolag
// (see httpServer.js + nowPlayingState.js). This is the same principle every
// real audio/video sync system uses - WebRTC's RTCP Sender Reports, Snapcast's
// clock-offset broadcasts, NTP-disciplined playout - map each independent
// stream to a shared reference and continuously report the measured offset,
// rather than trusting one fixed number forever. We don't need an actual
// clock-sync protocol between these two separate machines for this
// specifically: both sides ultimately derive from the SAME live encoder, so
// "how far behind that encoder's live position is Roblox's video right now"
// already IS the shared reference. DEFAULT_VIDEO_STARTUP_BUFFER_MS is only
// the fallback for the brief window before the first real sample arrives.
const DEFAULT_VIDEO_STARTUP_BUFFER_MS = 490;
const MAX_VIDEO_LAG_MS = 4000; // sanity clamp - a bad/stale sample must never push the delay absurdly high

function currentVideoDelayMs() {
    const measured = nowPlaying.get().videoLagMs;
    if (typeof measured !== 'number' || measured < 0) {
        return DEFAULT_VIDEO_STARTUP_BUFFER_MS;
    }
    return Math.min(measured, MAX_VIDEO_LAG_MS);
}

function spawnAudioFfmpeg(url, delayMs) {
    const args = [
        '-nostdin', '-loglevel', 'warning',
        '-fflags', 'nobuffer',
        '-analyzeduration', '500000',
        '-probesize', '32768',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        // Deliberately NO -re here, unlike the video encoder. @discordjs/voice's
        // AudioPlayer already paces Opus frame delivery to Discord in real time
        // on its own (one frame/20ms) - adding ffmpeg's OWN real-time pacing on
        // top meant two independent real-time clocks reading/writing through
        // the same pipe, which could drift against each other just enough to
        // stall the pipe. Confirmed live: repeated "Broken pipe" exits every
        // 12-30s even after the Ogg/Opus fix. Letting ffmpeg produce data as
        // fast as the network allows (buffered naturally by the OS pipe/Node's
        // readable stream) is more robust - the AudioPlayer's own scheduler is
        // what actually controls playback pacing regardless of how fast this
        // process writes.
        '-i', url,
        '-vn', // audio only - no video decode cost at all, this process is cheap
        '-ac', '2',
        '-ar', '48000',
        // -af is an OUTPUT option in ffmpeg - it must come after -i, not before
        // it, or ffmpeg reads it as an (invalid) input option and refuses to
        // open the file at all. Confirmed live: "Option af (set audio filters)
        // cannot be applied to input url... Error opening input files" on
        // every single spawn attempt after this was first added before -i,
        // which silently killed all audio (rapid-fire respawn loop, never a
        // stable playing state). Shifts audio's own timeline later by the
        // CALLER-supplied delayMs (see currentVideoDelayMs - a live measured
        // value now, not a fixed constant) so it lines up with when Roblox's
        // video will actually start showing the same live position, instead
        // of playing audio for content the viewer can't see yet. adelay
        // applies per-channel in ms (both channels here, since -ac 2 gives
        // us stereo).
        '-af', `adelay=${delayMs}|${delayMs}`,
        // Output Opus directly in an Ogg container instead of raw s16le PCM.
        // Raw PCM through StreamType.Raw needs exact Opus-frame-aligned chunks
        // (960 samples/20ms exactly) - confirmed live as a real bug: irregular
        // chunk timing from an HLS source caused the resource to be treated as
        // "ended" after ~1s, ffmpeg's write() then failing with EPIPE (the
        // "puh" sound - one valid ~1s burst before each crash-respawn cycle).
        // Ogg/Opus is already packet-framed, which @discordjs/voice demuxes
        // directly and reliably - the same approach the official voice guide
        // uses for arbitrary sources.
        '-c:a', 'libopus',
        '-b:a', '96k',
        '-f', 'ogg',
        'pipe:1',
    ];
    return spawn(FFMPEG_EXE, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

// Periodically re-opens the source from scratch (not just on a crash) so
// audio realigns to the live edge and any slow accumulated drift against the
// Roblox video gets bounded instead of growing for the entire session. This
// does NOT achieve frame-lock (there's still no shared clock - see the
// module docstring), but a several-hours session with zero resync could
// theoretically drift further and further; forcing a fresh "tune in now"
// every few minutes caps how far that can go, the same way syncToLive
// already does for the Roblox side on every reconnect.
// Shortened from 3min to 45s after live server logs showed the encoder's
// real fps swinging hard (4.6fps stalls up to 70fps catch-up bursts) on a
// timescale of ~10-30s, not minutes - video's own effective "live position"
// visibly jumps around on that same short timescale as it stalls/catches up
// with the CPU-bound encoder. A 3min resync left audio drifting against
// that jitter far longer than the jitter itself takes to happen; 45s bounds
// the accumulated drift much closer to the timescale that's actually
// causing it, at the cost of a brief (sub-second) re-open of the source
// more often.
const PERIODIC_RESYNC_MS = 45 * 1000;

// Forces every currently-active guild session to immediately drop its ffmpeg
// process the instant the live URL actually changes, instead of waiting up
// to PERIODIC_RESYNC_MS for the next scheduled resync. This closes the real
// bug where switching channels in Roblox kept playing the PREVIOUS channel's
// audio for up to the whole resync interval - the existing 'close' handler's
// respawn logic re-reads nowPlaying.get().url fresh, so killing the process
// here is enough; no separate restart path needed.
nowPlaying.onChange((info) => {
    for (const [guildId, session] of activeSessions) {
        console.log(`[Voice] Channel changed to "${info.name}" - forcing immediate resync for guild ${guildId}.`);
        try { session.ffmpegProc && session.ffmpegProc.kill('SIGKILL'); } catch (e) {}
    }
});

function stopSession(guildId) {
    const session = activeSessions.get(guildId);
    if (!session) return;
    // Bump generation FIRST - any in-flight ffmpeg 'close' callback from this
    // session (spawned via spawnAndSupervise's closure over `session` and
    // `myGeneration`) checks `session.generation !== myGeneration` before
    // respawning. Without this, a deliberate stop/reconnect could race with a
    // stale close event and respawn ffmpeg into a session that's already dead.
    session.generation = -1;
    if (session.resyncTimer) clearInterval(session.resyncTimer);
    try { session.ffmpegProc && session.ffmpegProc.kill('SIGKILL'); } catch (e) {}
    try { session.player.stop(true); } catch (e) {}
    try { session.connection.destroy(); } catch (e) {}
    activeSessions.delete(guildId);
}

async function connect(member) {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
        return { ok: false, error: 'You need to be in a voice channel first.' };
    }

    const nowPlayingInfo = nowPlaying.get();
    if (!nowPlayingInfo.url) {
        return { ok: false, error: 'Nothing is live yet - the Roblox server hasn\'t reported a channel. Try again once someone picks a channel in-game.' };
    }

    // Replace any existing session in this guild rather than running two at once.
    stopSession(voiceChannel.guild.id);

    // selfDeaf was previously true, which shows the bot with the "deafened"
    // icon in Discord's UI - purely cosmetic (it only affects whether the bot
    // RECEIVES voice, which it never needed to anyway since it doesn't listen),
    // but it read as confusing/broken. False here doesn't change anything about
    // whether other members can hear the bot's own audio playback.
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
    });

    connection.on('stateChange', (oldState, newState) => {
        console.log(`[Voice] Connection state: ${oldState.status} -> ${newState.status}`);
    });
    connection.on('error', (err) => {
        console.error('[Voice] Connection error:', err);
    });
    // @discordjs/voice's own step-by-step handshake log (UDP discovery, IP/port
    // negotiation, encryption mode selection, etc.) - this is the only way to
    // see WHERE the voice UDP handshake actually gets stuck, as opposed to just
    // knowing that it did.
    connection.on('debug', (message) => {
        console.log(`[Voice debug] ${message}`);
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (e) {
        console.error('[Voice] Failed to reach Ready state:', connection.state.status, e && e.message);
        connection.destroy();
        return { ok: false, error: `Could not establish a voice connection in time (stuck at "${connection.state.status}"). This is usually the voice UDP handshake timing out under load - try again.` };
    }

    const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });
    connection.subscribe(player);

    // Measures Discord's OWN buffering->playing delay directly instead of
    // trusting old, unconfirmed reports (an archived discordjs/voice issue
    // claims ~800-900ms AudioPlayer buffering latency on old versions, but
    // that was never confirmed on our installed 0.19.x and the repo's been
    // unmaintained since 2023) - this logs the real number on OUR box so the
    // compensating delay above (see currentVideoDelayMs) can be judged
    // against actual evidence rather than a guess either way.
    let bufferingStartedAt = null;
    player.on('stateChange', (oldState, newState) => {
        console.log(`[Voice] Player state: ${oldState.status} -> ${newState.status}`);
        if (newState.status === AudioPlayerStatus.Buffering) {
            bufferingStartedAt = Date.now();
        } else if (newState.status === AudioPlayerStatus.Playing && bufferingStartedAt) {
            console.log(`[Voice] Discord's own buffering->playing delay: ${Date.now() - bufferingStartedAt}ms`);
            bufferingStartedAt = null;
        }
    });
    player.on('error', (err) => {
        console.error('[Voice] AudioPlayer error:', err.message);
    });

    const guildId = voiceChannel.guild.id;
    const myGeneration = (activeSessions.get(guildId)?.generation || 0) + 1;
    const session = { connection, player, ffmpegProc: null, resource: null, generation: myGeneration };
    activeSessions.set(guildId, session);

    // SELF-HEALING SUPERVISOR: mirrors streamio_encoder.py's
    // _supervised_read_loop. Without this, ANY ffmpeg hiccup (a brief network
    // stall on the HLS source, a broken pipe) tore down the entire voice
    // session and disconnected the bot - this is the actual cause of "random
    // disconnects". Now an unexpected ffmpeg exit just respawns ffmpeg for
    // the same URL and keeps the voice connection alive; only a deliberate
    // stopSession() (via a newer generation) actually ends the session.
    let backoffMs = 1000;
    function spawnAndSupervise() {
        if (session.generation !== myGeneration) return; // superseded by a newer connect()/stop
        const url = nowPlaying.get().url || nowPlayingInfo.url;
        const delayMs = currentVideoDelayMs();
        console.log(`[Voice] Spawning audio with ${delayMs}ms compensating delay (${nowPlaying.get().videoLagMs !== null && nowPlaying.get().videoLagMs !== undefined ? 'measured' : 'default, no measurement yet'}).`);
        const ffmpegProc = spawnAudioFfmpeg(url, delayMs);
        const spawnTime = Date.now();
        session.ffmpegProc = ffmpegProc;

        ffmpegProc.stderr.on('data', (chunk) => {
            console.error(`[ffmpeg audio] ${chunk.toString().trim()}`);
        });
        ffmpegProc.on('error', (err) => {
            console.error('[Voice] ffmpeg failed to start:', err.message);
        });

        const resource = createAudioResource(ffmpegProc.stdout, {
            inputType: StreamType.OggOpus, // see spawnAudioFfmpeg's docstring for why this replaced StreamType.Raw
            inlineVolume: true, // lets Roblox's volume slider adjust live playback without restarting ffmpeg
        });
        // Defensive: a volume-API mismatch must NEVER take down audio playback
        // (or the whole bot process) - this crashed the entire bot once
        // already after a @discordjs/voice version bump changed the shape of
        // resource.volume. Playing at the default level beats not playing.
        if (!applyVolume(resource.volume, lastVolumeLinear)) {
            console.error('[Voice] No known volume API on resource.volume - skipping volume, playback continues at default level.');
        }
        session.resource = resource;
        player.play(resource);

        ffmpegProc.on('close', (code) => {
            if (session.generation !== myGeneration) return; // this session already ended/replaced - not a real failure
            const ranForMs = Date.now() - spawnTime;
            console.log(`[Voice] ffmpeg audio exited (code ${code}) after ${ranForMs}ms - respawning.`);
            backoffMs = ranForMs > 30_000 ? 1000 : Math.min(backoffMs * 2, 15_000);
            setTimeout(spawnAndSupervise, backoffMs);
        });
    }
    spawnAndSupervise();

    session.resyncTimer = setInterval(() => {
        if (session.generation !== myGeneration) return;
        console.log('[Voice] Periodic resync - re-opening source to realign with the live edge.');
        try { session.ffmpegProc && session.ffmpegProc.kill('SIGKILL'); } catch (e) {}
        // The ffmpeg 'close' handler's own respawn logic picks this up
        // automatically (same path as a crash respawn) - no need to duplicate
        // the spawn call here.
    }, PERIODIC_RESYNC_MS);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        // A Disconnected event can be transient (a brief network blip that
        // Discord itself recovers from via a resume) - tearing the whole
        // session down on EVERY Disconnected event, even momentary ones, was
        // also contributing to "random disconnects". Give it a real chance to
        // reconnect on its own first.
        if (session.generation !== myGeneration) return;
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            console.log('[Voice] Recovered from a transient disconnect.');
        } catch (e) {
            console.log('[Voice] Disconnect did not recover - ending session.');
            stopSession(guildId);
        }
    });

    return { ok: true, channelName: nowPlayingInfo.name || '(unnamed channel)' };
}

function disconnect(guildId) {
    const had = activeSessions.has(guildId);
    stopSession(guildId);
    return had;
}

function isConnected(guildId) {
    return activeSessions.has(guildId);
}

function isConnectedAny() {
    return activeSessions.size > 0;
}

// percent: 0-100 from Roblox's slider. Applies immediately to whichever
// session is active (if any) and persists as the level the NEXT /connect
// starts at, so the slider position survives a reconnect.
function setVolume(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    lastVolumeLinear = clamped / 100;
    for (const session of activeSessions.values()) {
        if (session.resource) {
            applyVolume(session.resource.volume, lastVolumeLinear);
        }
    }
    return Math.round(lastVolumeLinear * 100);
}

function getVolume() {
    return Math.round(lastVolumeLinear * 100);
}

module.exports = { connect, disconnect, isConnected, isConnectedAny, setVolume, getVolume };
