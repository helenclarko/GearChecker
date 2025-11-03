const request = require("request-promise");
const cheerio = require("cheerio");

// Get cookie from global store (updated via API) or env var
function getWarmaneCookie() {
    return (global.warmaneCookieStore || process.env.warmane_cookie || "");
}

function getWarmaneUserAgent() {
    return (global.warmaneUserAgentStore || process.env.warmane_user_agent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0");
}

class Character {
    constructor(realm, charName) {
        const uri = `https://armory.warmane.com/api/character/${charName}/${realm}/`;
        const options = {
            uri,
            headers: {
                "User-Agent": getWarmaneUserAgent(),
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate",
                "Cookie": getWarmaneCookie(),
                "Referer": `https://armory.warmane.com/character/${charName}/${realm}/`,
                "Origin": "https://armory.warmane.com",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Dest": "empty",
                "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="24", "Google Chrome";v="127"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"'
            },
            gzip: true,
            simple: false,
            resolveWithFullResponse: false,
            timeout: 15000
        };

        this.request = new Promise(async (resolve) => {
            let usedFallback = false;
            let body;
            try {
                const raw = await request(options);
                body = raw;
            } catch (err) {
                if (err.statusCode === 403 || (err.error && typeof err.error === 'string' && err.error.includes('Just a moment'))) {
                    console.log(`[${new Date().toLocaleString()}]:> ❌ Cloudflare challenge detected for ${charName} on ${realm}`);
                    console.log(`[${new Date().toLocaleString()}]:> Status: ${err.statusCode || '403'}, falling back to HTML scraping...`);
                } else {
                    console.log(`[${new Date().toLocaleString()}]:> ⚠️ API request failed for ${charName} on ${realm}:`, err.message || err);
                }
                usedFallback = true;
            }

            if (!usedFallback) {
                try {
                    body = JSON.parse(body);
                } catch (parseErr) {
                    if (typeof body === 'string' && body.includes('Just a moment')) {
                        console.log(`[${new Date().toLocaleString()}]:> ❌ Cloudflare challenge detected in response body for ${charName} on ${realm}`);
                        console.log(`[${new Date().toLocaleString()}]:> Falling back to HTML scraping...`);
                    } else {
                        console.log(`[${new Date().toLocaleString()}]:> ⚠️ Failed to parse JSON response for ${charName} on ${realm}:`, parseErr.message);
                    }
                    usedFallback = true;
                }
            }

            if (!usedFallback) {
                this.valid = false;
                this.name = body.name;
                this.realm = body.realm;
                this.online = body.online;
                this.level = body.level;
                this.faction = body.faction;
                this.gender = body.gender;
                this.class = body.class;
                this.honorablekills = body.honorablekills;
                this.guild = body.guild;
                this.achievementpoints = body.achievementpoints;
                this.equipment = body.equipment;
                this.race = body.race;
                this.talents = body.talents;
                this.professions = body.professions;

                if (body && body.name) this.valid = true;

                // Calculated
                this.GearScore = 0;
                this.Enchants = null;
                this.Gems = null;
                this.Armory = `[${charName}](http://armory.warmane.com/character/${charName}/${realm})`;
                this.Talents = null;
                this.Summary = null;
                this.GuildLink = this.guild ?
                    `[${this.guild}](http://armory.warmane.com/guild/${this.guild.replaceAll(" ", "+")}/${realm})` :
                    null;
                this.PVPGear = [];
                this.Achievements = null;
                resolve();
                return;
            }

            // Try JSON API first
            console.log(`[${new Date().toLocaleString()}]:> Attempting HTML scraping fallback for ${charName} on ${realm}...`);
            const scraped = await scrapeCharacterFromHtml(realm, charName);
            if (!scraped) {
                console.log(`[${new Date().toLocaleString()}]:> ❌ HTML scraping also failed for ${charName} on ${realm}. Character may not exist or both methods blocked.`);
                this.valid = false;
                resolve();
                return;
            }
            console.log(`[${new Date().toLocaleString()}]:> ✅ HTML scraping successful for ${charName} on ${realm}`);

            this.valid = true;
            this.name = scraped.name;
            this.realm = realm;
            this.online = scraped.online;
            this.level = scraped.level;
            this.faction = scraped.faction;
            this.gender = scraped.gender;
            this.class = scraped.class;
            this.honorablekills = scraped.honorablekills;
            this.guild = scraped.guild;
            this.achievementpoints = scraped.achievementpoints;
            this.equipment = scraped.equipment;
            this.race = scraped.race;
            this.talents = scraped.talents;
            this.professions = scraped.professions;

            this.GearScore = 0;
            this.Enchants = null;
            this.Gems = null;
            this.Armory = `[${charName}](http://armory.warmane.com/character/${charName}/${realm})`;
            this.Talents = null;
            this.Summary = null;
            this.GuildLink = this.guild ?
                `[${this.guild}](http://armory.warmane.com/guild/${this.guild.replaceAll(" ", "+")}/${realm})` :
                null;
            this.PVPGear = [];
            this.Achievements = null;
            resolve();
        });
    }
}

module.exports = { Character }

async function scrapeCharacterFromHtml(realm, charName) {
    try {
        const pageOptions = {
            uri: `https://armory.warmane.com/character/${charName}/${realm}/`,
            headers: {
                "User-Agent": getWarmaneUserAgent(),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate",
                "Cookie": getWarmaneCookie(),
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Dest": "document"
            },
            gzip: true,
            simple: false
        };

        const html = await request(pageOptions).catch(err => {
            if (err.statusCode === 403 || (err.error && typeof err.error === 'string' && err.error.includes('Just a moment'))) {
                console.log(`[${new Date().toLocaleString()}]:> ❌ Cloudflare challenge detected during HTML scraping for ${charName} on ${realm}`);
                throw err;
            }
            throw err;
        });

        // Check if HTML response is actually a Cloudflare challenge page
        if (typeof html === 'string' && (html.includes('Just a moment') || html.includes('cf-challenge'))) {
            console.log(`[${new Date().toLocaleString()}]:> ❌ Cloudflare challenge page detected in HTML response for ${charName} on ${realm}`);
            return null;
        }

        const $ = cheerio.load(html);

        const headerText = $(".level-race-class").text().trim();
        const name = $(".char-name").text().trim() || charName;
        const guild = $(".guild a").first().text().trim() || null;
        const levelMatch = headerText.match(/(\d{1,2})/);
        const level = levelMatch ? parseInt(levelMatch[1], 10) : null;

        const classText = headerText.toLowerCase();
        const klass = headerText.split(" ").pop() || null;

        const faction = $(".faction").text().includes("Alliance") ? "Alliance" : $(".faction").text().includes("Horde") ? "Horde" : null;
        const race = null; // not critical; optional to parse precisely
        const gender = null;

        // Professions
        const professions = [];
        $(".profskills .text").each(function () {
            const txt = $(this).clone().children().remove().end().text().trim();
            const skillMatch = txt.match(/(\d{1,3})/);
            const skill = skillMatch ? parseInt(skillMatch[1], 10) : null;
            const nameOnly = txt.replace(/\d+/g, "").trim();
            if (nameOnly) professions.push({ name: nameOnly, skill: skill });
        });

        // Equipment minimal for GS: list item ids
        const equipment = [];
        $(".item-model a").each(function () {
            const rel = $(this).attr("rel");
            if (!rel) return;
            const params = new URLSearchParams(rel);
            const itemId = params.get("item");
            if (itemId) equipment.push({ item: Number(itemId) });
        });

        // Achievement points (optional)
        const achievementpoints = Number($(".achievement-points").text().trim()) || null;
        const honorablekills = null;
        const online = null;

        // Talents (optional minimal form)
        const talents = null;

        return {
            name,
            guild,
            level,
            class: klass,
            faction,
            race,
            gender,
            professions,
            equipment,
            achievementpoints,
            honorablekills,
            online,
            talents
        };
    } catch (err) {
        if (err.statusCode === 403 || (err.message && err.message.includes('403'))) {
            console.log(`[${new Date().toLocaleString()}]:> ❌ HTML scraping failed with 403 for ${charName} on ${realm}`);
        } else {
            console.log(`[${new Date().toLocaleString()}]:> ⚠️ HTML scraping error for ${charName} on ${realm}:`, err.message || err);
        }
        return null;
    }
}
