const request = require('request-promise');
const axios = require('axios');

// Cached cookies per hostname, cleared after 10 minutes
const cookieCache = new Map();
const COOKIE_TTL_MS = 10 * 60 * 1000;

// Reuse a single FlareSolverr browser session across requests
let fsSession = null;

async function getFSSession(flareSolverUrl) {
    if (fsSession) return fsSession;
    try {
        const res = await axios.post(flareSolverUrl, { cmd: 'sessions.create' }, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.data.status === 'ok') {
            fsSession = res.data.session;
            console.log(`[FlareSolverr] Session created: ${fsSession}`);
        }
    } catch (e) {
        console.warn('[FlareSolverr] Could not create session:', e.message);
    }
    return fsSession;
}

function getCachedCookies(url) {
    const { hostname } = new URL(url);
    const entry = cookieCache.get(hostname);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        cookieCache.delete(hostname);
        return null;
    }
    return entry.cookies;
}

function setCachedCookies(url, cookies) {
    const { hostname } = new URL(url);
    cookieCache.set(hostname, { cookies, expiry: Date.now() + COOKIE_TTL_MS });
}

function clearCachedCookies(url) {
    cookieCache.delete(new URL(url).hostname);
}

async function fetchWithFallback(url) {
    const cachedCookies = getCachedCookies(url);

    try {
        const options = { uri: url, gzip: true, simple: false, timeout: 15000 };
        if (cachedCookies) {
            options.headers = { Cookie: cachedCookies.map(c => `${c.name}=${c.value}`).join('; ') };
        }

        const body = await request(options);

        if (typeof body === 'string' && (body.includes('Just a moment') || body.includes('cf-challenge'))) {
            clearCachedCookies(url);
            throw new Error('Cloudflare challenge detected');
        }

        return body;
    } catch (err) {
        const flareSolverUrl = process.env.flaresolverr_url;
        if (!flareSolverUrl) throw err;

        console.log(`[${new Date().toLocaleString()}]:> Falling back to FlareSolver for ${url}`);

        const session = await getFSSession(flareSolverUrl);
        const payload = { cmd: 'request.get', url, maxTimeout: 60000 };
        if (session) payload.session = session;

        const fsResponse = await axios.post(flareSolverUrl, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (fsResponse.data.status !== 'ok') {
            throw new Error(`FlareSolver failed: ${fsResponse.data.message}`);
        }

        if (fsResponse.data.solution?.cookies?.length) {
            setCachedCookies(url, fsResponse.data.solution.cookies);
        }

        return fsResponse.data.solution.response;
    }
}

module.exports = { fetchWithFallback };
