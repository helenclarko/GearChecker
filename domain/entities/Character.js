const request = require("request-promise");

const WARMANE_COOKIE = process.env.warmane_cookie || "";
const WARMANE_USER_AGENT = process.env.warmane_user_agent ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0";

class Character {
    constructor(realm, charName) {
        const uri = `https://armory.warmane.com/api/character/${charName}/${realm}/`;
        const options = {
            uri,
            headers: {
                "User-Agent": WARMANE_USER_AGENT,
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate",
                "Cookie": WARMANE_COOKIE,
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
            simple: true,
            resolveWithFullResponse: false,
            timeout: 15000
        };

        this.request = request(options, (err, response, body) => {
            try {
                body = JSON.parse(body);
            } catch (e) {
                // Likely got HTML (Cloudflare/redirect). Mark invalid and exit early.
                this.valid = false;
                return;
            }

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
        });
    }
}

module.exports = { Character }
