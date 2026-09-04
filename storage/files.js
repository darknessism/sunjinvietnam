/* Durable file storage on a Railway Volume.
 *
 * Railway's container filesystem is ephemeral, which is why uploads originally
 * went into MySQL as LONGBLOBs. A mounted Volume is durable, so binaries live
 * on disk here and MySQL keeps only the small relative path that points at them.
 *
 * Mount a Volume on the app service at /data and set DATA_DIR=/data (the mount
 * path is auto-detected if the env var is absent). Locally it falls back to
 * ./.data so `npm run dev` works with no configuration.
 */
const fs   = require('fs');
const path = require('path');

// Resolved (not just read) so the containment check below compares like with
// like: an env value such as "/data/" or a Windows "C:/x" would otherwise never
// match path.resolve()'s normalised output.
const DATA_DIR = path.resolve(
    process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', '.data'))
);

// Extensions are derived from the stored MIME so the on-disk name is
// self-describing and express' sendFile can infer Content-Type correctly.
const EXT = {
    'image/jpeg': 'jpg',  'image/png':  'png',  'image/webp': 'webp',
    'image/gif':  'gif',  'image/avif': 'avif',
    'video/mp4':  'mp4',  'video/webm': 'webm', 'video/ogg':  'ogv',
    'video/quicktime': 'mov',
};
const extFor = mime => EXT[String(mime || '').toLowerCase()] || 'bin';

/** Absolute path for a stored relative key. Guards against traversal. */
function absolute(relPath) {
    const abs = path.resolve(DATA_DIR, relPath);
    if (abs !== DATA_DIR && !abs.startsWith(DATA_DIR + path.sep)) {
        throw new Error('Refusing to resolve a path outside DATA_DIR: ' + relPath);
    }
    return abs;
}

/**
 * Write bytes and return the relative key to store in MySQL.
 * `kind` is the subdirectory ('media' | 'page-images' | 'banner-clips').
 * `name` is the stable id/slot; media ids are sharded two levels deep so a
 * single directory never accumulates thousands of entries.
 */
function save(kind, name, mime, buffer) {
    const ext   = extFor(mime);
    const shard = kind === 'media' ? name.slice(0, 2) + '/' : '';
    const rel   = `${kind}/${shard}${name}.${ext}`;
    const abs   = absolute(rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    // Write to a temp file then rename, so a crash mid-write can never leave a
    // truncated file sitting at a path the database already points to.
    const tmp = abs + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, abs);
    return rel;
}

/** Delete a stored file. Missing files are not an error. */
function remove(relPath) {
    if (!relPath) return;
    try { fs.unlinkSync(absolute(relPath)); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
}

function exists(relPath) {
    if (!relPath) return false;
    try { return fs.statSync(absolute(relPath)).size > 0; }
    catch { return false; }
}

/**
 * Stream a stored file as the response. Uses res.sendFile, which gives us
 * HTTP Range support for free — so seeking in a banner video no longer
 * re-downloads the whole clip.
 */
function send(res, relPath, mime, next) {
    let abs;
    try { abs = absolute(relPath); } catch (e) { return next(e); }
    res.type(mime || path.extname(abs));
    res.sendFile(abs, { maxAge: '1y', immutable: true, dotfiles: 'deny' }, err => {
        if (!err) return;
        if (err.code === 'ENOENT') return res.status(404).end();
        // The client hanging up mid-stream is normal for video, not an error.
        if (res.headersSent) return res.end();
        next(err);
    });
}

/** Total bytes currently held on the volume, for the admin storage report. */
function usage(dir = DATA_DIR) {
    let bytes = 0, files = 0;
    const walk = d => {
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else { try { bytes += fs.statSync(p).size; files++; } catch {} }
        }
    };
    walk(dir);
    return { bytes, files };
}

module.exports = { DATA_DIR, save, remove, exists, send, absolute, usage, extFor };
