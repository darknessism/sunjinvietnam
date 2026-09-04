const express     = require('express');
const crypto      = require('crypto');
const multer      = require('multer');
const pool        = require('../db/connection');
const files       = require('../storage/files');
const { optimize } = require('../storage/optimize');
const requireAuth = require('../middleware/auth');
const router      = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// Generic media store for admin-uploaded images that don't map to a fixed
// page "slot" — e.g. the per-project gallery photos, where each project has an
// arbitrary set of image URLs. Bytes live on the mounted Railway Volume (see
// storage/files.js); MySQL keeps only the relative path, under a random id,
// and serves it back at a stable URL the editor saves like any other URL.
//
// `data` is the legacy LONGBLOB column. Rows written before the move to volume
// storage still carry their bytes there and are served from it until
// db/migrateBlobsToDisk.js has copied them out.
// ──────────────────────────────────────────────────────────────────────────
async function initMedia() {
    await pool.query(`CREATE TABLE IF NOT EXISTS media (
        id         VARCHAR(32)  NOT NULL PRIMARY KEY,
        mime       VARCHAR(80)  NOT NULL,
        data       LONGBLOB     NULL,
        path       VARCHAR(255) NULL,
        optimized_at DATETIME   NULL,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    // Migrate older installs: add `path`, and let `data` be NULL now that new
    // uploads never populate it.
    await ensureColumn('media', 'path', 'ALTER TABLE media ADD COLUMN path VARCHAR(255) NULL');
    await ensureColumn('media', 'optimized_at', 'ALTER TABLE media ADD COLUMN optimized_at DATETIME NULL');
    await pool.query('ALTER TABLE media MODIFY data LONGBLOB NULL').catch(() => {});
}

async function ensureColumn(table, col, alterSql) {
    const [[row]] = await pool.query(
        `SELECT COUNT(*) AS c FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, col]
    );
    if (!row.c) await pool.query(alterSql);
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 8 * 1024 * 1024 }, // 8 MB
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
        // Carry a 4xx so the global handler reports it to the user instead of
        // swallowing it as an internal error.
        const err = new Error('Unsupported file type. Use JPG, PNG, WEBP, GIF or AVIF.');
        err.status = 400;
        cb(err);
    },
});

// ── Public: serve an uploaded image's binary ─────────────────────────────────
router.get('/raw/:id', async (req, res, next) => {
    try {
        const id = String(req.params.id || '');
        if (!/^[a-f0-9]{24}$/.test(id)) return res.status(404).end();
        const [[row]] = await pool.query('SELECT mime, path FROM media WHERE id = ?', [id]);
        if (!row) return res.status(404).end();
        // Each id maps to immutable bytes, so it is safe to cache hard.
        if (row.path) return files.send(res, row.path, row.mime, next);
        // Not yet migrated to the volume — fall back to the legacy blob.
        const [[blob]] = await pool.query('SELECT data FROM media WHERE id = ?', [id]);
        if (!blob || !blob.data) return res.status(404).end();
        res.set('Content-Type', row.mime);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(blob.data);
    } catch (e) { next(e); }
});

// ── Admin: upload an image, get back a stable URL to store ───────────────────
router.post('/admin/upload', requireAuth, upload.single('image'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image file received.' });
        const id  = crypto.randomBytes(12).toString('hex'); // 24 hex chars
        // Recompress to WebP where that is a win; falls back to the original
        // bytes if sharp is unavailable or the file is already well-sized.
        const opt  = await optimize(req.file.buffer, req.file.mimetype);
        const mime = opt ? opt.mime   : req.file.mimetype;
        const buf  = opt ? opt.buffer : req.file.buffer;
        const rel  = files.save('media', id, mime, buf);
        await pool.query(
            'INSERT INTO media (id, mime, path, optimized_at) VALUES (?, ?, ?, ?)',
            [id, mime, rel, opt ? new Date() : null]
        );
        res.json({ ok: true, id, url: '/api/media/raw/' + id });
    } catch (e) { next(e); }
});

module.exports = router;
module.exports.initMedia = initMedia;
