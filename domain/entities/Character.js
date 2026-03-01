const cheerio = require('cheerio');
const { fetchWithFallback } = require('../../common/helpers/FlareSolverHelper');

class Character {
    constructor(realm, charName) {
        this.request = new Promise(async (resolve) => {
            try {
                const body = await fetchWithFallback(`http://armory.warmane.com/api/character/${charName}/${realm}/`);

                let data;
                try {
                    data = JSON.parse(body);
                } catch {
                    // FlareSolver may wrap JSON in an HTML page — extract body text
                    const $ = cheerio.load(body);
                    data = JSON.parse($('body').text().trim());
                }

                this.valid = false;
                this.name = data.name;
                this.realm = data.realm;
                this.online = data.online;
                this.level = data.level;
                this.faction = data.faction;
                this.gender = data.gender;
                this.class = data.class;
                this.honorablekills = data.honorablekills;
                this.guild = data.guild;
                this.achievementpoints = data.achievementpoints;
                this.equipment = data.equipment;
                this.race = data.race;
                this.talents = data.talents;
                this.professions = data.professions;

                if (data && data.name) this.valid = true;

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
            } catch (err) {
                console.log(`[${new Date().toLocaleString()}]:> Failed to fetch character ${charName} on ${realm}:`, err.message);
                this.valid = false;
            }

            resolve();
        });
    }
}

module.exports = { Character }
