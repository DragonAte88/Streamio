// Standalone 24/7 entrypoint for the Discord bot half of KodiRoblox - deployed on
// the Micro Oracle instance, separate from the Kodi/Rich-Presence/screen-capture
// half in KodiRoblox/index.js (which can only ever run on the user's own PC next
// to a real Kodi install and a logged-in Discord desktop client - see the notes
// in botInteractions.js's Rich Presence section for why that part can't be
// containerized). This file only pulls in the bot-account side: slash commands,
// Roblox<->Discord account linking, and the bridge-zip distribution.
// Crash isolation: an unhandled error/rejection anywhere (a bad voice-API
// call, an ffmpeg edge case, etc.) must never take the ENTIRE bot process
// down - this happened for real once already (a resource.volume API
// mismatch crashed the whole process mid-interaction, which is also why the
// interaction was stuck on "thinking" forever - Discord never got a reply
// because the process died before sending one). Logging and continuing is
// far better than a hard crash for a 24/7 service like this.
process.on('uncaughtException', (err) => {
    console.error('[FATAL-ish] Uncaught exception (bot stays alive):', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL-ish] Unhandled rejection (bot stays alive):', reason);
});

require('./httpServer').start();
require('./botInteractions');
