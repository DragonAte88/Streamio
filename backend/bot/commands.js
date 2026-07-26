const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('connect')
        .setDescription('Joins your voice channel and plays the live audio from Streamio. Run again to disconnect.')
].map(command => command.toJSON());

async function registerCommands(token, clientId) {
    if (!token || !clientId) return;
    const rest = new REST({ version: '10' }).setToken(token);

    try {
        const guildId = process.env.DISCORD_GUILD_ID;
        if (guildId) {
            console.log(`Started refreshing GUILD (/) commands for guild: ${guildId}`);
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            console.log('Successfully reloaded GUILD (/) commands (Instant Update).');
        } else {
            console.log('Started refreshing GLOBAL (/) commands. (Note: Discord may take time to update globals. Press Ctrl+R in Discord to force refresh).');
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
            console.log('Successfully reloaded GLOBAL (/) commands.');
        }
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

module.exports = { registerCommands };
