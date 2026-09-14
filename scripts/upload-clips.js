/* Replace the banner clips on the live site through its own admin upload
 * endpoint, one file per slot. Works from any machine with Node 18+; no
 * Railway CLI or volume access needed, and each upload bumps the slot's
 * updated_at so the ?v= cache-buster changes and browsers fetch the new file.
 *
 *   node scripts/upload-clips.js <dir-with-<slot>.mp4-files> [site-url]
 *   node scripts/upload-clips.js backups/clips-720p-2026-09-14 https://sunjinvietnam.vn
 *
 * Reads ADMIN_PASSWORD from .env (must match the live service's value).
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const dir  = process.argv[2];
const site = (process.argv[3] || 'https://sunjinvietnam.vn').replace(/\/+$/, '');
if (!dir) { console.error('usage: node scripts/upload-clips.js <dir> [site-url]'); process.exit(2); }
if (!process.env.ADMIN_PASSWORD) { console.error('ADMIN_PASSWORD is not set'); process.exit(2); }

const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg' };

(async () => {
    const login = await fetch(site + '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
    });
    if (!login.ok) { console.error('login failed:', login.status, await login.text()); process.exit(1); }
    const { token } = await login.json();

    const files = fs.readdirSync(dir).filter(f => MIME[path.extname(f).toLowerCase()]);
    let failed = 0;
    for (const f of files) {
        const slot = path.basename(f, path.extname(f));
        const body = new FormData();
        body.append('video', new Blob([fs.readFileSync(path.join(dir, f))], { type: MIME[path.extname(f).toLowerCase()] }), f);
        const r = await fetch(`${site}/api/banner-clips/admin/${encodeURIComponent(slot)}/upload`, {
            method: 'POST', headers: { authorization: 'Bearer ' + token }, body,
        });
        const text = await r.text();
        console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${slot} ${(fs.statSync(path.join(dir, f)).size / 1048576).toFixed(1)} MB -> ${r.status} ${r.ok ? '' : text}`);
        if (!r.ok) failed++;
    }
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
