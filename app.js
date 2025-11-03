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

// Middleware for parsing JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie storage (in-memory, persists until bot restarts)
let warmaneCookieStore = process.env.warmane_cookie || "";
let warmaneUserAgentStore = process.env.warmane_user_agent || 
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0";

// Function to update cookie store and export it for use in other modules
function updateCookieStore(cookie, userAgent) {
    if (cookie) {
        warmaneCookieStore = cookie;
        global.warmaneCookieStore = cookie; // Update global immediately
        console.log(`[${new Date().toLocaleString()}]:> ✅ Cookie updated via API (length: ${cookie.length})`);
    }
    if (userAgent) {
        warmaneUserAgentStore = userAgent;
        global.warmaneUserAgentStore = userAgent; // Update global immediately
        console.log(`[${new Date().toLocaleString()}]:> ✅ User-Agent updated via API`);
    }
}

// Make cookie store accessible globally
global.warmaneCookieStore = warmaneCookieStore;
global.warmaneUserAgentStore = warmaneUserAgentStore;
global.updateCookieStore = updateCookieStore;

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

client.on('guildDelete', guild => {
    console.log(`[${new Date().toLocaleString()}]:> Bot removed from guild: ${guild.id} (${guild.name})`);

    const filePath = path.join('/app/database', `blacklist_${guild.id}.json`);

    // Check if the file exists
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log(`[${new Date().toLocaleString()}]:> Deleted blacklist file for guild ${guild.id}`);
        } catch (err) {
            console.error(`[${new Date().toLocaleString()}]:> Error deleting blacklist file for guild ${guild.id}:`, err.message);
        }
    } else {
        console.log(`[${new Date().toLocaleString()}]:> No blacklist file found for guild ${guild.id} to delete.`);
    }

    // Clean up the in-memory blacklist too
    if (serverBlacklists[guild.id]) {
        delete serverBlacklists[guild.id];
        console.log(`[${new Date().toLocaleString()}]:> Removed guild ${guild.id} from memory.`);
    }
});

client.login(process.env.discord_bot_id);

app.get('/healthcheck', (req, res) => {
    res.sendStatus(200); // OK
});

// Helper function to get current cookie (for internal use) - moved before routes
function getWarmaneCookie() {
    return (global.warmaneCookieStore || process.env.warmane_cookie || "");
}

function getWarmaneUserAgent() {
    return (global.warmaneUserAgentStore || process.env.warmane_user_agent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0");
}

// Endpoint to view current cookie status (for debugging)
app.get('/cookie-status', (req, res) => {
    try {
        const cookie = getWarmaneCookie();
        const hasCookie = !!cookie;
        const cookieLength = cookie.length;
        const hasPHPSESSID = cookie.includes('PHPSESSID');
        const hasCfClearance = cookie.includes('cf_clearance');
        
        res.json({
            hasCookie,
            cookieLength,
            hasPHPSESSID,
            hasCfClearance,
            userAgent: getWarmaneUserAgent(),
            cookiePreview: hasCookie ? cookie.substring(0, 50) + '...' : 'No cookie set'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint to receive cookie via query string or POST
app.get('/set-cookie', (req, res) => {
    const cookie = req.query.cookie || req.query.c;
    const userAgent = req.query.ua || req.query.user_agent;
    
    if (cookie) {
        updateCookieStore(cookie, userAgent);
        res.send(`
            <html>
                <head><title>Cookie Updated</title></head>
                <body style="font-family: Arial; padding: 20px;">
                    <h1>✅ Cookie Updated Successfully!</h1>
                    <p>Cookie has been stored and will be used for subsequent requests.</p>
                    <p><a href="/cookie-helper.html">Get Another Cookie</a> | <a href="/cookie-status">View Status</a></p>
                    <p><small>Cookie will persist until bot restart.</small></p>
                </body>
            </html>
        `);
    } else {
        res.status(400).send(`
            <html>
                <head><title>Error</title></head>
                <body style="font-family: Arial; padding: 20px;">
                    <h1>❌ No Cookie Provided</h1>
                    <p>Please provide a cookie via query parameter: <code>?cookie=YOUR_COOKIE</code></p>
                    <p><a href="/cookie-helper.html">Use Cookie Helper</a></p>
                </body>
            </html>
        `);
    }
});

// POST endpoint for setting cookie (alternative to GET)
app.post('/set-cookie', (req, res) => {
    const cookie = req.body.cookie || req.body.c || req.query.cookie || req.query.c;
    const userAgent = req.body.ua || req.body.user_agent || req.query.ua || req.query.user_agent;
    
    if (cookie) {
        updateCookieStore(cookie, userAgent);
        res.json({ success: true, message: 'Cookie updated successfully' });
    } else {
        res.status(400).json({ success: false, error: 'No cookie provided' });
    }
});

// Cookie helper page - extracts cookies from browser and sends them
app.get('/cookie-helper.html', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>GearChecker Cookie Helper</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .step {
            margin: 20px 0;
            padding: 15px;
            background: #f9f9f9;
            border-left: 4px solid #4CAF50;
        }
        button {
            background: #4CAF50;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin: 10px 5px;
        }
        button:hover { background: #45a049; }
        button.secondary {
            background: #2196F3;
        }
        button.secondary:hover { background: #0b7dda; }
        .cookie-display {
            background: #f0f0f0;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            word-break: break-all;
            margin: 10px 0;
            max-height: 200px;
            overflow-y: auto;
        }
        .status {
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .info { background: #d1ecf1; color: #0c5460; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🍪 GearChecker Cookie Helper</h1>
        <p>This tool helps you extract cookies from your browser and send them to the GearChecker bot.</p>
        
        <div class="step">
            <h3>Step 1: Visit Warmane Armory</h3>
            <p>Open this link in a new tab and solve the Cloudflare challenge:</p>
            <p><a href="https://armory.warmane.com/character/Imoom/Icecrown/" target="_blank" style="color: #2196F3;">
                https://armory.warmane.com/character/Imoom/Icecrown/
            </a></p>
            <p><small>Make sure the page loads fully after solving the challenge.</small></p>
        </div>

        <div class="step">
            <h3>Step 2: Extract Cookies</h3>
            <p>Once the page loads, come back here and click the button below:</p>
            <button onclick="extractCookies()">Extract Cookies from Browser</button>
            <div id="cookieDisplay" class="cookie-display" style="display: none;"></div>
        </div>

        <div class="step">
            <h3>Step 3: Send to Bot</h3>
            <p>Review the cookie above, then send it to your bot:</p>
            <button class="secondary" onclick="sendCookie()" id="sendBtn" disabled>Send Cookie to Bot</button>
            <div id="status"></div>
        </div>

        <div class="step">
            <h3>Manual Method</h3>
            <p>Or manually copy your cookie and visit:</p>
            <code id="manualUrl" style="display: block; padding: 10px; background: #f0f0f0; margin: 10px 0;">
                http://YOUR_SERVER:2000/set-cookie?cookie=YOUR_COOKIE_HERE
            </code>
        </div>
    </div>

    <script>
        let extractedCookie = '';
        let extractedUA = '';

        function extractCookies() {
            // Note: This only works if you're on the same domain or using a browser extension
            // For cross-origin, user needs to manually copy from DevTools
            document.getElementById('status').innerHTML = 
                '<div class="status info">⚠️ Due to browser security, cookies must be copied manually. See instructions below.</div>';
            
            document.getElementById('cookieDisplay').style.display = 'block';
            document.getElementById('cookieDisplay').innerHTML = 
                '<strong>How to get cookies:</strong><br>' +
                '1. Open DevTools (F12) on the Warmane armory page<br>' +
                '2. Go to Application tab (Firefox) or Storage tab (Chrome)<br>' +
                '3. Click Cookies → https://armory.warmane.com<br>' +
                '4. Find PHPSESSID and cf_clearance<br>' +
                '5. Copy both values<br>' +
                '6. Format: PHPSESSID=value1; cf_clearance=value2<br>' +
                '7. Paste below and click "Send Cookie"';
            
            // Create input for manual paste
            const input = document.createElement('textarea');
            input.id = 'cookieInput';
            input.placeholder = 'Paste your cookie here: PHPSESSID=...; cf_clearance=...';
            input.style.width = '100%';
            input.style.height = '60px';
            input.style.marginTop = '10px';
            document.getElementById('cookieDisplay').appendChild(input);
            
            // Create UA input
            const uaInput = document.createElement('input');
            uaInput.id = 'uaInput';
            uaInput.type = 'text';
            uaInput.placeholder = 'User-Agent (optional): Mozilla/5.0...';
            uaInput.style.width = '100%';
            uaInput.style.marginTop = '10px';
            uaInput.style.padding = '8px';
            document.getElementById('cookieDisplay').appendChild(uaInput);
            
            // Update send button
            input.addEventListener('input', function() {
                extractedCookie = input.value;
                document.getElementById('sendBtn').disabled = !extractedCookie;
            });
        }

        function sendCookie() {
            const cookie = document.getElementById('cookieInput').value;
            const ua = document.getElementById('uaInput').value || navigator.userAgent;
            
            if (!cookie) {
                document.getElementById('status').innerHTML = 
                    '<div class="status error">❌ Please enter a cookie first.</div>';
                return;
            }

            // Build URL
            const baseUrl = window.location.origin;
            const url = baseUrl + '/set-cookie?cookie=' + encodeURIComponent(cookie) + 
                       (ua ? '&ua=' + encodeURIComponent(ua) : '');

            // Update manual URL display
            document.getElementById('manualUrl').textContent = url;

            // Send cookie
            fetch(url)
                .then(response => response.text())
                .then(html => {
                    document.getElementById('status').innerHTML = 
                        '<div class="status success">✅ Cookie sent successfully! The bot will use it for future requests.</div>';
                    // Show response in new window
                    const win = window.open('', '_blank');
                    win.document.write(html);
                })
                .catch(err => {
                    document.getElementById('status').innerHTML = 
                        '<div class="status error">❌ Error: ' + err.message + '</div>';
                });
        }
    </script>
</body>
</html>
    `);
});

// Start the express server - bind to 0.0.0.0 to be accessible from outside container
app.listen(port, '0.0.0.0', () => {
    console.log(`[${new Date().toLocaleString()}]:> Server is running on port: ${port}`);
    console.log(`[${new Date().toLocaleString()}]:> Cookie helper available at: http://localhost:${port}/cookie-helper.html`);
    console.log(`[${new Date().toLocaleString()}]:> Server accessible at: http://0.0.0.0:${port} (all interfaces)`);
});
