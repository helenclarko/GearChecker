const request = require('request-promise');
const axios = require('axios');

async function fetchWithFallback(url) {
    try {
        const body = await request({
            uri: url,
            gzip: true,
            simple: false,
            timeout: 15000
        });

        if (typeof body === 'string' && (body.includes('Just a moment') || body.includes('cf-challenge'))) {
            throw new Error('Cloudflare challenge detected');
        }

        return body;
    } catch (err) {
        const flareSolverUrl = process.env.flaresolverr_url;
        if (!flareSolverUrl) throw err;

        console.log(`[${new Date().toLocaleString()}]:> Falling back to FlareSolver for ${url}`);

        const fsResponse = await axios.post(flareSolverUrl, {
            cmd: 'request.get',
            url,
            maxTimeout: 60000
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (fsResponse.data.status !== 'ok') {
            throw new Error(`FlareSolver failed: ${fsResponse.data.message}`);
        }

        return fsResponse.data.solution.response;
    }
}

module.exports = { fetchWithFallback };
