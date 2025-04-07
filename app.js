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
let blacklist = [];

// Function to load the blacklist from the file
function loadBlacklist() {
    try {
        const data = fs.readFileSync(blacklistFilePath, 'utf8');
        blacklist = JSON.parse(data);
        console.log('Blacklist loaded.');
    } catch (err) {
        console.log('Error loading blacklist, starting with an empty list.');
        blacklist = []; // Default to an empty list if the file doesn't exist or can't be read
    }
}

// Function to save the blacklist to a file
function saveBlacklist() {
    fs.writeFileSync(blacklistFilePath, JSON.stringify(blacklist, null, 2));
    console.log('Blacklist saved.');
}

// Function to add a character to the blacklist
function addToBlacklist(characterName) {
    if (!blacklist.includes(characterName)) {
        blacklist.push(characterName);
        saveBlacklist();  // Save the blacklist to the file after adding
        console.log(`${characterName} added to the blacklist.`);
    } else {
        console.log(`${characterName} is already on the blacklist.`);
    }
}

// Function to remove a character from the blacklist
function removeFromBlacklist(characterName) {
    const index = blacklist.indexOf(characterName);
    if (index !== -1) {
        blacklist.splice(index, 1);  // Remove the character
        saveBlacklist();  // Save the blacklist to the file after removing
        console.log(`${characterName} removed from the blacklist.`);
    } else {
        console.log(`${characterName} is not on the blacklist.`);
    }
}

// Function to check if a character is blacklisted
function isBlacklisted(characterName) {
    return blacklist.includes(characterName);
}

// Function to show the blacklist
function showBlacklist() {
    return blacklist.length > 0 ? blacklist.join(', ') : 'No characters are blacklisted.';
}

client.on('ready', () => {
    console.log(`[${new Date().toLocaleString()}]:> Logged in as: ${client.user.tag}`);
    loadBlacklist();  // Load the blacklist when the bot starts
});

client.on('messageCreate', async (msg) => {
    let guid = crypto.randomUUID();

    try {
        if (msg.content[0] === "!") {
            console.log(`[${new Date().toLocaleString()}]:> ${msg.content}`);

            let command = msg.content.split(" ")[0];
            let name = msg.content.split(" ")[1] !== undefined ? msg.content.split(" ")[1] : null;
            let realm = msg.content.split(" ")[2] !== undefined ? GetCamelToe(msg.content.split(" ")[2]) : RealmEnum[0];

            msg = await msg.channel.messages.fetch(msg.id);

            // Check if the command is related to the blacklist
            if (command === "!blacklist") {
                const action = msg.content.split(" ")[1];
                const target = msg.content.split(" ")[2];

                if (action === "add" && target) {
                    addToBlacklist(target);
                    msg.reply(`${target} has been added to the blacklist.`);
                } else if (action === "remove" && target) {
                    removeFromBlacklist(target);
                    msg.reply(`${target} has been removed from the blacklist.`);
                } else if (action === "view") {
                    msg.reply(`Current blacklist: ${showBlacklist()}`);
                } else {
                    msg.reply("Usage: !blacklist add <characterName> | !blacklist remove <characterName> | !blacklist view");
                }
            }
            // Check if the character is blacklisted before processing other commands
            else if (Object.values(CI.Commands).includes(command) && Object.values(RealmEnum).includes(realm) && name != null) {
                if (isBlacklisted(name)) {
                    msg.reply(`${name} is blacklisted and cannot be processed.`);
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
