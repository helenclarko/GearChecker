require("dotenv").config();
const { Client, Intents } = require("discord.js");
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
const crypto = require('crypto');
const CharacterManager = require('./application/CharacterManager');
const CI = require('./common/constants/CommandInfo');
const { RealmEnum } = require('./domain/enums/RealmEnum');
const { GetCamelToe } = require("./common/helpers/GenericHelper");
const express = require('express');
const fs = require('fs'); // File system module to handle file I/O
const path = require('path'); // Module to work with file paths

const app = express();
const port = 2000;

// Define the path to the blacklist.json file in the linked volume
const blacklistFilePath = path.join('/app/database', 'blacklist.json');

// Read the blacklist from the file when the bot starts
let serverBlacklists = {};

// Function to load the blacklist from the file
function loadBlacklist(guildId) {
    const filePath = path.join('/app/database', `blacklist_${guildId}.json`);
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        serverBlacklists[guildId] = JSON.parse(data);
        console.log(`Blacklist loaded for guild ${guildId}`);
    } catch (err) {
        console.log(`No existing blacklist for guild ${guildId}, starting fresh.`);
        serverBlacklists[guildId] = [];
    }
}

// Function to save the blacklist to a file
function saveBlacklist(guildId) {
    const filePath = path.join('/app/database', `blacklist_${guildId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(serverBlacklists[guildId], null, 2));
    console.log(`Blacklist saved for guild ${guildId}`);
}

// Function to add a character to the blacklist with a reason (case-insensitive)
function addToBlacklist(guildId, characterName, reason) {
    const normalizedName = characterName.toLowerCase();
    if (!serverBlacklists[guildId]) loadBlacklist(guildId);

    const exists = serverBlacklists[guildId].some(entry => entry.name === normalizedName);
    if (!exists) {
        serverBlacklists[guildId].push({ name: normalizedName, reason });
        saveBlacklist(guildId);
        console.log(`${characterName} added to blacklist in guild ${guildId}`);
    }
}

// Function to remove a character from the blacklist (case-insensitive)
function removeFromBlacklist(guildId, characterName) {
    const normalizedName = characterName.toLowerCase();
    if (!serverBlacklists[guildId]) loadBlacklist(guildId);

    const index = serverBlacklists[guildId].findIndex(entry => entry.name === normalizedName);
    if (index !== -1) {
        serverBlacklists[guildId].splice(index, 1);
        saveBlacklist(guildId);
        console.log(`${characterName} removed from blacklist in guild ${guildId}`);
    }
}

// Function to check if a character is blacklisted (case-insensitive)
function isBlacklisted(guildId, characterName) {
    const normalizedName = characterName.toLowerCase();
    if (!serverBlacklists[guildId]) loadBlacklist(guildId);

    const entry = serverBlacklists[guildId].find(entry => entry.name === normalizedName);
    return entry ? { isBlacklisted: true, reason: entry.reason } : { isBlacklisted: false, reason: null };
}

// Function to show the blacklist with reasons
function showBlacklist(guildId) {
    if (!serverBlacklists[guildId]) loadBlacklist(guildId);
    const list = serverBlacklists[guildId];
    return list.length > 0
        ? list.map(entry => `${entry.name} - Reason: ${entry.reason}`).join('\n')
        : 'No characters are blacklisted.';
}

client.on('ready', () => {
    console.log(`[${new Date().toLocaleString()}]:> Logged in as: ${client.user.tag}`);
    
    client.guilds.cache.forEach(guild => {
        loadBlacklist(guild.id);
    });
});

client.on('messageCreate', async (msg) => {
    let guid = crypto.randomUUID();

    try {
        if (msg.content[0] === "!") {
            console.log(`[${new Date().toLocaleString()}]:> ${msg.content}`);

	    if (!msg.guildId) {
		msg.reply("This bot only works in servers.");
		return;
	    }

            let command = msg.content.split(" ")[0];
            let name = msg.content.split(" ")[1] !== undefined ? msg.content.split(" ")[1] : null;
            let realm = msg.content.split(" ")[2] !== undefined ? GetCamelToe(msg.content.split(" ")[2]) : RealmEnum[0];

            msg = await msg.channel.messages.fetch(msg.id);

            // Check if the command is related to the blacklist
            if (command === "!blacklist") {
                const action = msg.content.split(" ")[1];
                const target = msg.content.split(" ")[2];
                const reason = msg.content.split(" ").slice(3).join(" "); // Get the reason (everything after the character name)

                if (action === "add" && target && reason) {
                    addToBlacklist(msg.guildId, target, reason);
                    msg.reply(`${target} has been added to the blacklist for: ${reason}`);
                } else if (action === "remove" && target) {
                    removeFromBlacklist(msg.guildId, target);
                    msg.reply(`${target} has been removed from the blacklist.`);
                } else if (action === "view") {
                    msg.reply(`Current blacklist:\n${showBlacklist(msg.guildId)}`);
                } else {
                    msg.reply("Usage: !blacklist add <characterName> <reason> | !blacklist remove <characterName> | !blacklist view");
                }
            }
            
            // Add the help command
            else if (command === CI.Commands.help) {
                msg.reply(CI.Help); // Sends the help text defined in CI.Help
            }
            // Check if the character is blacklisted before processing other commands
            else if (Object.values(CI.Commands).includes(command) && Object.values(RealmEnum).includes(realm) && name != null) {
				const { isBlacklisted: blacklistedStatus, reason } = isBlacklisted(msg.guildId, name); // Destructure with different variable names

				if (blacklistedStatus) {
					msg.reply(`${name} is blacklisted for the following reason: ${reason} and cannot be processed.`);
					return; // Skip further processing if the character is blacklisted
				}

                CharacterManager.GetCharacter(realm, name)
                    .then(async character => {
                        switch (command) {
                            case CI.Commands.guild:
                                msg.reply(
                                    character.guild ?
                                        `${character.name}'s guild: ${character.GuildLink}` :
                                        `${character.name} doesn't have a guild`);
                                break;
                            case CI.Commands.gs:
                                msg.reply(`${character.name}'s gear score is: ${character.GearScore}`);
                                break;
                            case CI.Commands.ench:
                                msg.reply(character.Enchants);
                                break;
                            case CI.Commands.gems:
                                msg.reply(character.Gems);
                                break;
                            case CI.Commands.armory:
                                msg.reply(`${character.name}'s armory: ${character.Armory}`);
                                break;
			    case CI.Commands.summary:
                            case CI.Commands.sum:
                                msg.reply(character.Summary);
                                break;
                            case CI.Commands.achievements:
                            case CI.Commands.achi:
                                await CharacterManager.GetAchievements(character).then(async () => {
                                    msg.reply(`**${character.name}'s achievements**:\n${character.Achievements}`);
                                });
                                break;
                        }
                    })
                    .catch(err => {
                        console.log(err);

                        msg.reply(err);
                    });
            }
            else msg.reply(CI.InvalidCommand);
        }
    }
    catch (e) {
        console.log(`[${new Date().toLocaleString()}: ${guid}]:> ${e.message}`);
    }
});

client.login(process.env.discord_bot_id);

app.get('/healthcheck', (req, res) => {
    res.sendStatus(200); // OK
});

// Start the express server
app.listen(port, () => {
    console.log(`[${new Date().toLocaleString()}]:> Server is running on port: ${port}`);
});
