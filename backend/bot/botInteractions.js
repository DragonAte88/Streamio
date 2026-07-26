const { Client, GatewayIntentBits, MessageFlags } = require('discord.js');
const { registerCommands } = require('./commands');
const voicePlayback = require('./voicePlayback');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const token = process.env.DISCORD_BOT_TOKEN;

client.on('clientReady', () => {
    console.log(`[Discord Bot] Logged in as ${client.user.tag}`);
    registerCommands(token, client.user.id);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'connect') return;

    if (!interaction.guildId) {
        await interaction.reply({ content: 'This only works in a server.', flags: MessageFlags.Ephemeral });
        return;
    }

    // Toggle: running /connect again while already connected in this guild
    // just disconnects - keeps this to a single command instead of a
    // separate /disconnect.
    if (voicePlayback.isConnected(interaction.guildId)) {
        voicePlayback.disconnect(interaction.guildId);
        await interaction.reply({ content: '👋 Disconnected.', flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply();
    const result = await voicePlayback.connect(interaction.member);
    if (result.ok) {
        await interaction.editReply(`🔊 Connected and now playing **${result.channelName}** live from Streamio. Audio tracks the live source but is not frame-locked to the Roblox video - expect it to be close, not perfectly synced. Run \`/connect\` again to disconnect.`);
    } else {
        await interaction.editReply(`Couldn't connect: ${result.error}`);
    }
});

if (token) {
    client.login(token).catch(err => {
        console.error('Failed to login Discord bot. Ensure DISCORD_BOT_TOKEN is correct:', err.message);
    });
} else {
    console.log('No DISCORD_BOT_TOKEN found in env. The Discord Bot will not start.');
}

module.exports = { client };
